"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { loadPackVersion } from "@/lib/compliance/pack";
import {
  buildGapReport,
  gapCount,
  mapExtractionToDraft,
} from "@/lib/compliance/import-mapper";
import { extractImportFiles } from "@/lib/ai/runners/import";
import { AiError } from "@/lib/ai/provider";
import { markAiOutcome } from "@/lib/ai/run";
import { importExtractionSchema, importRowSchema } from "@/lib/ai/schemas";
import type { Json } from "@/lib/supabase/database.types";

const EXT_TO_KIND: Record<string, "photo_set" | "pdf" | "docx" | "xlsx"> = {
  jpg: "photo_set",
  jpeg: "photo_set",
  png: "photo_set",
  webp: "photo_set",
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
};
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type ImportActionState =
  | { ok: true; importId: string }
  | { error: "error" | "aiUnavailable" | "badFile" }
  | null;

async function managerSiteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, activity_type, compliance_pack")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return null;
  return { supabase, site, ctx };
}

/** Upload originals (kept forever, §7.5) and create the ra_imports row. */
export async function createImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const siteId = z.uuid().safeParse(formData.get("siteId"));
  if (!siteId.success) return { error: "error" };
  const sc = await managerSiteContext(siteId.data);
  if (!sc) return { error: "error" };

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0 || files.length > 20) return { error: "badFile" };

  const kinds = new Set<string>();
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const kind = EXT_TO_KIND[ext];
    if (!kind || file.size > MAX_FILE_BYTES) return { error: "badFile" };
    kinds.add(kind);
  }
  // one document type per import (a photo set may have many pages)
  if (kinds.size > 1) return { error: "badFile" };
  const kind = [...kinds][0] as "photo_set" | "pdf" | "docx" | "xlsx";

  const importRef = randomUUID();
  const filePaths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-æøåÆØÅ]/g, "_");
    const path = `${sc.site.id}/imports/${importRef}/${safeName}`;
    const { error } = await sc.supabase.storage
      .from("imports")
      .upload(path, file, { contentType: file.type || undefined });
    if (error) return { error: "error" };
    filePaths.push(path);
  }

  const { data: imported, error } = await sc.supabase
    .from("ra_imports")
    .insert({ site_id: sc.site.id, kind, file_paths: filePaths })
    .select("id")
    .single();
  if (error || !imported) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "ra_import.created",
    entityTable: "ra_imports",
    entityId: imported.id,
    diff: { kind, files: filePaths.length },
  });

  revalidatePath(`/app/${sc.site.id}/programme/import`);
  return { ok: true, importId: imported.id };
}

const extractInputSchema = z.object({ siteId: z.uuid(), importId: z.uuid() });

/** Extraction + gap analysis (§7.5): uploaded → extracting → mapped → needs_review. */
export async function extractImportAction(input: unknown): Promise<ImportActionState> {
  const parsed = extractInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await managerSiteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: imp } = await sc.supabase
    .from("ra_imports")
    .select("id, file_paths, status")
    .eq("id", parsed.data.importId)
    .eq("site_id", sc.site.id)
    .maybeSingle();
  if (!imp || imp.status === "confirmed") return { error: "error" };

  await sc.supabase
    .from("ra_imports")
    .update({ status: "extracting" })
    .eq("id", imp.id);

  let extraction;
  try {
    extraction = await extractImportFiles({
      supabase: sc.supabase,
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      importId: imp.id,
      filePaths: imp.file_paths,
    });
  } catch (err) {
    await sc.supabase.from("ra_imports").update({ status: "failed" }).eq("id", imp.id);
    await writeAudit(sc.supabase, {
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      actorId: sc.ctx.user.id,
      actorRole: sc.ctx.role,
      action: "ra_import.extraction_failed",
      entityTable: "ra_imports",
      entityId: imp.id,
      diff: { error: err instanceof Error ? err.message : "unknown" },
    });
    return { error: err instanceof AiError ? "aiUnavailable" : "error" };
  }

  await sc.supabase
    .from("ra_imports")
    .update({ extraction_json: extraction as unknown as Json, status: "mapped" })
    .eq("id", imp.id);

  const { pack } = await loadPackVersion(sc.supabase, sc.site.compliance_pack);
  const gapReport = buildGapReport(extraction, pack, sc.site.activity_type);
  await sc.supabase
    .from("ra_imports")
    .update({ gap_report_json: gapReport as unknown as Json, status: "needs_review" })
    .eq("id", imp.id);

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "ra_import.extracted",
    entityTable: "ra_imports",
    entityId: imp.id,
    diff: { rows: extraction.rows.length, gaps: gapCount(gapReport) },
  });

  revalidatePath(`/app/${sc.site.id}/programme/import`);
  return { ok: true, importId: imp.id };
}

const confirmInputSchema = z.object({
  siteId: z.uuid(),
  importId: z.uuid(),
  // reviewed rows: the extraction rows after human correction in the review UI
  rows: z.array(importRowSchema).max(80),
});

export type ConfirmImportState =
  | { ok: true; riskAnalysisId: string }
  | { error: "error" }
  | null;

/** Review confirmation: corrected rows → draft RA with provenance (§7.5). */
export async function confirmImportAction(input: unknown): Promise<ConfirmImportState> {
  const parsed = confirmInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await managerSiteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: imp } = await sc.supabase
    .from("ra_imports")
    .select("id, status, extraction_json")
    .eq("id", parsed.data.importId)
    .eq("site_id", sc.site.id)
    .maybeSingle();
  if (!imp || imp.status !== "needs_review" || !imp.extraction_json) {
    return { error: "error" };
  }
  const original = importExtractionSchema.safeParse(imp.extraction_json);
  if (!original.success) return { error: "error" };

  // cells the human changed in review lose the "unreviewed AI" status but keep
  // their import provenance; appended rows are entirely human
  const humanEditedIndexes = new Set<number>();
  parsed.data.rows.forEach((row, index) => {
    const before = original.data.rows[index];
    if (!before || JSON.stringify(before) !== JSON.stringify(row)) {
      humanEditedIndexes.add(index);
    }
  });

  const { pack, version } = await loadPackVersion(sc.supabase, sc.site.compliance_pack);
  let riskAnalysisId: string;
  try {
    const mapped = await mapExtractionToDraft(sc.supabase, {
      siteId: sc.site.id,
      importId: imp.id,
      activityType: sc.site.activity_type,
      rows: parsed.data.rows,
      documentLanguage: original.data.documentLanguage,
      pack,
      packVersion: version,
      humanEditedIndexes,
    });
    riskAnalysisId = mapped.riskAnalysisId;
  } catch {
    return { error: "error" };
  }

  await sc.supabase
    .from("ra_imports")
    .update({
      status: "confirmed",
      risk_analysis_id: riskAnalysisId,
      confirmed_by: sc.ctx.user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", imp.id);

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "ra_import.confirmed",
    entityTable: "ra_imports",
    entityId: imp.id,
    diff: { risk_analysis_id: riskAnalysisId, corrected_rows: humanEditedIndexes.size },
  });
  await markAiOutcome(
    sc.supabase,
    { orgId: sc.site.org_id, feature: "ra_import_extract", inputRef: `import:${imp.id}` },
    { accepted: true, edited: humanEditedIndexes.size > 0 },
  );

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true, riskAnalysisId };
}
