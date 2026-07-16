"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext } from "@/lib/tenancy";
import { applyActivityTemplate } from "@/lib/compliance/apply-template";
import { loadPackVersion } from "@/lib/compliance/pack";
import {
  materializeSiteTasks,
  rescheduleControlPoint,
} from "@/lib/compliance/materialize-runner";
import { compareStrictness, parseLimit } from "@/lib/compliance/limits";
import { findUncoveredCriticalRows } from "@/lib/compliance/approval";
import { uploadProgrammeSnapshot } from "@/lib/pdf/render";
import { frequencySchema, type PackLimit } from "@/lib/compliance/pack-schema";
import {
  approveSchema,
  createControlPointSchema,
  editControlPointSchema,
  startTemplateSchema,
  toggleControlPointSchema,
} from "@/lib/schemas/programme";
import { editRaRowSchema } from "@/lib/schemas/wizard";
import { markAiOutcome } from "@/lib/ai/run";
import type { Json } from "@/lib/supabase/database.types";

export type ProgrammeActionState = { ok: true } | { error: string } | null;

async function siteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, activity_type, compliance_pack, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return null;
  return { supabase, site, ctx };
}

export async function startFromTemplate(
  _prev: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const parsed = startTemplateSchema.safeParse({ siteId: formData.get("siteId") });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  try {
    const { riskAnalysisId, packVersion } = await applyActivityTemplate(sc.supabase, {
      siteId: sc.site.id,
    });
    await writeAudit(sc.supabase, {
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      actorId: sc.ctx.user.id,
      actorRole: sc.ctx.role,
      action: "risk_analysis.created_from_template",
      entityTable: "risk_analyses",
      entityId: riskAnalysisId,
      diff: { activity_type: sc.site.activity_type, pack_version: packVersion },
    });
  } catch {
    return { error: "error" };
  }

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true };
}

export async function approveProgramme(
  _prev: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const parsed = approveSchema.safeParse({
    siteId: formData.get("siteId"),
    riskAnalysisId: formData.get("riskAnalysisId"),
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  // §3.3.1 completeness validator: every applying critical row must be covered
  // by an active monitoring control point of the mapped template.
  const [{ data: rows }, { data: cps }] = await Promise.all([
    sc.supabase
      .from("ra_activity_rows")
      .select("activity_key, applies, is_critical")
      .eq("risk_analysis_id", parsed.data.riskAnalysisId),
    sc.supabase
      .from("control_points")
      .select("template_key, active")
      .eq("risk_analysis_id", parsed.data.riskAnalysisId)
      .eq("active", true),
  ]);
  const { pack } = await loadPackVersion(sc.supabase, sc.site.compliance_pack);
  const template = pack.activityTemplates.find((t) => t.code === sc.site.activity_type);
  const uncovered = findUncoveredCriticalRows(
    rows ?? [],
    new Set((cps ?? []).map((c) => c.template_key)),
    template,
  );
  if (uncovered.length > 0) {
    return { error: "criticalNoCp" };
  }

  // supersede the previously approved analysis (kept forever, §7.4)
  const { data: previous } = await sc.supabase
    .from("risk_analyses")
    .select("id")
    .eq("site_id", sc.site.id)
    .eq("status", "approved")
    .neq("id", parsed.data.riskAnalysisId);
  for (const prev of previous ?? []) {
    await sc.supabase
      .from("risk_analyses")
      .update({ status: "superseded" })
      .eq("id", prev.id);
  }

  const { error: approveError } = await sc.supabase
    .from("risk_analyses")
    .update({
      status: "approved",
      approved_by: sc.ctx.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.riskAnalysisId)
    .eq("status", "draft");
  if (approveError) return { error: "error" };

  // §7.4/§7.6: approval snapshots the programme as official-layout PDFs (da+en)
  let pdfPath: string | null = null;
  try {
    const snapshot = await uploadProgrammeSnapshot(
      sc.supabase,
      sc.site.id,
      parsed.data.riskAnalysisId,
    );
    pdfPath = snapshot.egenkontrolPath;
    for (const raPath of snapshot.raPaths) {
      await sc.supabase.from("programme_documents").insert({
        site_id: sc.site.id,
        risk_analysis_id: parsed.data.riskAnalysisId,
        kind: "annex",
        pdf_path: raPath,
      });
    }
  } catch (err) {
    // rendering failure must not roll back a valid approval — record it
    await writeAudit(sc.supabase, {
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      actorId: sc.ctx.user.id,
      actorRole: sc.ctx.role,
      action: "programme.pdf_failed",
      entityTable: "programme_documents",
      diff: { error: err instanceof Error ? err.message : "unknown" },
    });
  }
  await sc.supabase.from("programme_documents").insert({
    site_id: sc.site.id,
    risk_analysis_id: parsed.data.riskAnalysisId,
    kind: "egenkontrolprogram",
    pdf_path: pdfPath,
  });

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "risk_analysis.approved",
    entityTable: "risk_analyses",
    entityId: parsed.data.riskAnalysisId,
  });

  // §14 rule 2: approving an AI-drafted programme marks the run accepted
  const { data: aiRow } = await sc.supabase
    .from("ra_activity_rows")
    .select("id")
    .eq("risk_analysis_id", parsed.data.riskAnalysisId)
    .eq("ai_suggested", true)
    .limit(1)
    .maybeSingle();
  if (aiRow) {
    await markAiOutcome(
      sc.supabase,
      { orgId: sc.site.org_id, feature: "wizard_draft", inputRef: `draft:${sc.site.id}` },
      { accepted: true, edited: false },
    );
  }

  // the daily task schedule goes live only after approval (§7.4)
  const result = await materializeSiteTasks(sc.supabase, sc.site.id);
  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "tasks.materialized",
    entityTable: "tasks",
    diff: { inserted: result.inserted, ...result.window },
  });

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true };
}

export async function editControlPoint(
  _prev: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const parsed = editControlPointSchema.safeParse({
    siteId: formData.get("siteId"),
    controlPointId: formData.get("controlPointId"),
    max: formData.get("max") || undefined,
    min: formData.get("min") || undefined,
    coolFrom: formData.get("coolFrom") || undefined,
    coolTo: formData.get("coolTo") || undefined,
    withinMinutes: formData.get("withinMinutes") || undefined,
    times: formData.get("times") || undefined,
    justification: formData.get("justification") ?? undefined,
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: cp } = await sc.supabase
    .from("control_points")
    .select("id, template_key, limit_json, frequency_json, limit_justification")
    .eq("id", parsed.data.controlPointId)
    .maybeSingle();
  if (!cp) return { error: "error" };

  // Build the proposed limit from the current shape.
  const current = parseLimit(cp.limit_json);
  let proposed: PackLimit = current;
  if ("max" in current && parsed.data.max !== undefined) {
    proposed = { max: parsed.data.max, unit: "°C" };
  } else if ("min" in current && parsed.data.min !== undefined) {
    proposed = { min: parsed.data.min, unit: "°C" };
  } else if ("coolFrom" in current) {
    proposed = {
      coolFrom: parsed.data.coolFrom ?? current.coolFrom,
      coolTo: parsed.data.coolTo ?? current.coolTo,
      withinMinutes: parsed.data.withinMinutes ?? current.withinMinutes,
      unit: "°C",
    };
  }

  // §7.3 [DECISION]: loosening a PACK default requires a written justification
  // (site_manager+ is already the only role RLS lets write here).
  let loosened = false;
  if (cp.template_key) {
    const { pack } = await loadPackVersion(sc.supabase, sc.site.compliance_pack);
    const tpl = pack.controlPointTemplates.find((t) => t.key === cp.template_key);
    if (tpl) {
      const strictness = compareStrictness(tpl.defaultLimit, proposed);
      if (strictness === "incomparable") return { error: "error" };
      loosened = strictness === "looser";
      if (loosened && !parsed.data.justification) {
        return { error: "justificationRequired" };
      }
    }
  }

  const frequencyChanged = parsed.data.times !== undefined;
  const newFrequency = frequencyChanged
    ? (() => {
        const f = frequencySchema.parse(cp.frequency_json);
        if ("perEvent" in f) return cp.frequency_json;
        return { ...f, times: parsed.data.times! };
      })()
    : cp.frequency_json;

  const { error } = await sc.supabase
    .from("control_points")
    .update({
      limit_json: proposed as unknown as Json,
      limit_loosened: loosened,
      limit_justification: loosened
        ? parsed.data.justification
        : cp.limit_justification,
      frequency_json: newFrequency as Json,
    })
    .eq("id", cp.id);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "control_point.updated",
    entityTable: "control_points",
    entityId: cp.id,
    diff: {
      before: { limit: cp.limit_json as Json, frequency: cp.frequency_json as Json },
      after: { limit: proposed as unknown as Json, frequency: newFrequency as Json },
      loosened,
      justification: parsed.data.justification ?? null,
    },
  });

  if (frequencyChanged) {
    await rescheduleControlPoint(sc.supabase, cp.id, sc.site.id);
  }

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true };
}

export async function toggleControlPoint(
  _prev: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const parsed = toggleControlPointSchema.safeParse({
    siteId: formData.get("siteId"),
    controlPointId: formData.get("controlPointId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { error } = await sc.supabase
    .from("control_points")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.controlPointId);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: parsed.data.active ? "control_point.activated" : "control_point.deactivated",
    entityTable: "control_points",
    entityId: parsed.data.controlPointId,
  });

  if (!parsed.data.active) {
    await sc.supabase
      .from("tasks")
      .delete()
      .eq("control_point_id", parsed.data.controlPointId)
      .eq("status", "pending")
      .gt("due_at", new Date().toISOString());
  } else {
    await materializeSiteTasks(sc.supabase, sc.site.id);
  }

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true };
}

export async function createControlPoint(
  _prev: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const parsed = createControlPointSchema.safeParse({
    siteId: formData.get("siteId"),
    name: formData.get("name"),
    category: formData.get("category"),
    limitType: formData.get("limitType"),
    value: formData.get("value") || undefined,
    times: formData.get("times"),
    monitoringMethod: formData.get("monitoringMethod"),
    equipmentId: formData.get("equipmentId") ?? "",
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: ra } = await sc.supabase
    .from("risk_analyses")
    .select("id")
    .eq("site_id", sc.site.id)
    .in("status", ["draft", "in_review", "approved"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ra) return { error: "error" };

  const limit: PackLimit =
    parsed.data.limitType === "checklist"
      ? { checklist: true }
      : parsed.data.limitType === "max"
        ? { max: parsed.data.value ?? 0, unit: "°C" }
        : { min: parsed.data.value ?? 0, unit: "°C" };

  const { data: cp, error } = await sc.supabase
    .from("control_points")
    .insert({
      site_id: sc.site.id,
      risk_analysis_id: ra.id,
      template_key: null, // custom, site-authored (no pack default to loosen)
      name_i18n: { da: parsed.data.name, en: parsed.data.name } as Json,
      category: parsed.data.category,
      target_kind: parsed.data.equipmentId ? "equipment" : "process",
      equipment_id: parsed.data.equipmentId ?? null,
      limit_json: limit as unknown as Json,
      frequency_json: {
        rrule: "FREQ=DAILY",
        times: parsed.data.times,
        dueWindowMinutes: 120,
      } as Json,
      monitoring_method: parsed.data.monitoringMethod,
    })
    .select("id")
    .single();
  if (error || !cp) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "control_point.created",
    entityTable: "control_points",
    entityId: cp.id,
    diff: { name: parsed.data.name, category: parsed.data.category },
  });

  await materializeSiteTasks(sc.supabase, sc.site.id);
  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true };
}

/**
 * Review editor (§7.3): manager edits an AI-suggested (or template) skema row.
 * Origin stays auditable — ai_suggested is never cleared; human_edited marks
 * the human review. RLS restricts writes to draft analyses.
 */
export async function editRaRow(
  _prev: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const parsed = editRaRowSchema.safeParse({
    siteId: formData.get("siteId"),
    rowId: formData.get("rowId"),
    applies: formData.get("applies"),
    critical: formData.get("critical"),
    whatYouDo: formData.get("whatYouDo") ?? "",
    whatCanGoWrong: formData.get("whatCanGoWrong") ?? "",
    controlMeasures: formData.get("controlMeasures") ?? "",
    ifItGoesWrong: formData.get("ifItGoesWrong") ?? "",
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: row } = await sc.supabase
    .from("ra_activity_rows")
    .select(
      "id, ai_suggested, what_you_do_i18n, what_can_go_wrong_i18n, control_measures_i18n, if_it_goes_wrong_i18n",
    )
    .eq("id", parsed.data.rowId)
    .maybeSingle();
  if (!row) return { error: "error" };

  // merge the edited locale text into the i18n value, keeping the other locale
  const merge = (existing: Json | null, text: string): Json | null => {
    if (!text) return existing;
    const prev = (existing ?? {}) as Record<string, string>;
    return { ...prev, da: text, en: prev.en ?? text } as Json;
  };

  const { error } = await sc.supabase
    .from("ra_activity_rows")
    .update({
      applies: parsed.data.applies,
      is_critical: parsed.data.critical,
      what_you_do_i18n: merge(row.what_you_do_i18n, parsed.data.whatYouDo),
      what_can_go_wrong_i18n: merge(row.what_can_go_wrong_i18n, parsed.data.whatCanGoWrong),
      control_measures_i18n: merge(row.control_measures_i18n, parsed.data.controlMeasures),
      if_it_goes_wrong_i18n: merge(row.if_it_goes_wrong_i18n, parsed.data.ifItGoesWrong),
      human_edited: true,
    })
    .eq("id", row.id);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "ra_row.updated",
    entityTable: "ra_activity_rows",
    entityId: row.id,
    diff: { applies: parsed.data.applies, critical: parsed.data.critical },
  });

  if (row.ai_suggested) {
    await markAiOutcome(
      sc.supabase,
      { orgId: sc.site.org_id, feature: "wizard_draft", inputRef: `draft:${sc.site.id}` },
      { accepted: true, edited: true },
    );
  }

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true };
}
