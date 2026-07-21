"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";

const smileySchema = z.object({
  siteId: z.uuid(),
  inspectedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  result: z.coerce.number().int().min(1).max(4),
  note: z.string().trim().max(500).nullable(),
});

export type SmileyState = { ok: true } | { error: "error" } | null;

/** §13 smiley tracking (manual entry v1) — outcomes are append-only history. */
export async function addSmileyInspection(
  _prev: SmileyState,
  formData: FormData,
): Promise<SmileyState> {
  const parsed = smileySchema.safeParse({
    siteId: formData.get("siteId"),
    inspectedOn: formData.get("inspectedOn"),
    result: formData.get("result"),
    note: (formData.get("note") as string) || null,
  });
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return { error: "error" };

  const { data: row, error } = await supabase
    .from("smiley_inspections")
    .insert({
      site_id: site.id,
      inspected_on: parsed.data.inspectedOn,
      result: parsed.data.result,
      note: parsed.data.note,
      recorded_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !row) return { error: "error" };

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "smiley.recorded",
    entityTable: "smiley_inspections",
    entityId: row.id,
    diff: { result: parsed.data.result, inspected_on: parsed.data.inspectedOn },
  });
  revalidatePath(`/app/${site.id}/reports`);
  return { ok: true };
}

const smileyUrlSchema = z.object({
  siteId: z.uuid(),
  // only the official findsmiley.dk site is a valid target
  url: z
    .url()
    .refine((value) => new URL(value).hostname.endsWith("findsmiley.dk"))
    .or(z.literal("")),
});

/** Saves the site's own findsmiley.dk page link (shown next to smiley history). */
export async function setSmileyUrl(
  _prev: SmileyState,
  formData: FormData,
): Promise<SmileyState> {
  const parsed = smileyUrlSchema.safeParse({
    siteId: formData.get("siteId"),
    url: (formData.get("url") as string)?.trim() ?? "",
  });
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return { error: "error" };

  const { error } = await supabase
    .from("sites")
    .update({ smiley_url: parsed.data.url || null })
    .eq("id", site.id);
  if (error) return { error: "error" };

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "site.smiley_url_set",
    entityTable: "sites",
    entityId: site.id,
    diff: { smiley_url: parsed.data.url || null },
  });
  revalidatePath(`/app/${site.id}/reports`);
  return { ok: true };
}

const trainingSchema = z.object({
  siteId: z.uuid(),
  personName: z.string().trim().min(1).max(200),
  course: z.string().trim().min(1).max(300),
  trainedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** §13 training log — who, what, when, optional certificate photo. */
export async function addTrainingRecord(
  _prev: SmileyState,
  formData: FormData,
): Promise<SmileyState> {
  const parsed = trainingSchema.safeParse({
    siteId: formData.get("siteId"),
    personName: formData.get("personName"),
    course: formData.get("course"),
    trainedOn: formData.get("trainedOn"),
  });
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return { error: "error" };

  let certificatePath: string | null = null;
  const file = formData.get("certificate");
  if (file instanceof File && file.size > 0 && file.size <= 20 * 1024 * 1024) {
    const safeName = file.name.replace(/[^\w.\-æøåÆØÅ]/g, "_");
    certificatePath = `${site.id}/documents/training-${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("documents")
      .upload(certificatePath, file, { contentType: file.type || undefined });
    if (error) return { error: "error" };
  }

  const { data: row, error } = await supabase
    .from("training_records")
    .insert({
      site_id: site.id,
      person_name: parsed.data.personName,
      course: parsed.data.course,
      trained_on: parsed.data.trainedOn,
      certificate_path: certificatePath,
      recorded_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !row) return { error: "error" };

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "training.recorded",
    entityTable: "training_records",
    entityId: row.id,
    diff: { person: parsed.data.personName, course: parsed.data.course },
  });
  revalidatePath(`/app/${site.id}/inspection`);
  return { ok: true };
}
