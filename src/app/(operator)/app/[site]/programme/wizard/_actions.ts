"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { applyActivityTemplate } from "@/lib/compliance/apply-template";
import { AiError } from "@/lib/ai/provider";
import {
  generateDraftSections,
  nextInterviewTurn,
  validateDraftCompleteness,
  transcriptToJson,
} from "@/lib/ai/runners/wizard";
import { writeDraftToRiskAnalysis } from "@/lib/ai/runners/draft-writer";
import {
  generateDraftInputSchema,
  wizardTurnInputSchema,
} from "@/lib/schemas/wizard";
import type { WizardTurn } from "@/lib/ai/schemas";

export type WizardTurnState =
  | { turn: WizardTurn }
  | { error: "error" | "aiUnavailable" };

export type GenerateDraftState =
  | { ok: true; riskAnalysisId: string; warnings: string[]; rejectedLimits: string[] }
  | { fallback: true; riskAnalysisId: string }
  | { error: "error" | "aiUnavailable" };

async function managerSiteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, activity_type, compliance_pack")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return null;
  return { supabase, site, ctx };
}

/** One adaptive interview turn (§7.2). AI-only path; failure surfaces the manual template route. */
export async function wizardTurnAction(input: unknown): Promise<WizardTurnState> {
  const parsed = wizardTurnInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await managerSiteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  try {
    const turn = await nextInterviewTurn({
      supabase: sc.supabase,
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      activityType: sc.site.activity_type,
      siteName: sc.site.name,
      answers: parsed.data.answers,
    });
    return { turn };
  } catch (err) {
    return { error: err instanceof AiError ? "aiUnavailable" : "error" };
  }
}

/**
 * Draft generation (§7.3): section-by-section AI draft → completeness
 * validation → guardrailed write (ai_suggested rows, clamped limits). If the
 * AI path fails entirely, falls back to the pack template — the wizard is
 * never a hard dependency (§14).
 */
export async function generateDraftAction(input: unknown): Promise<GenerateDraftState> {
  const parsed = generateDraftInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await managerSiteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: equipment } = await sc.supabase
    .from("equipment")
    .select("kind, name")
    .eq("site_id", sc.site.id)
    .eq("active", true);

  let generated;
  try {
    generated = await generateDraftSections({
      supabase: sc.supabase,
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      activityType: sc.site.activity_type,
      answers: parsed.data.answers,
      equipment: equipment ?? [],
    });
  } catch (err) {
    if (!(err instanceof AiError)) return { error: "error" };
    // §14: manual fallback — instantiate the pack template instead
    try {
      const { riskAnalysisId } = await applyActivityTemplate(sc.supabase, {
        siteId: sc.site.id,
      });
      await writeAudit(sc.supabase, {
        orgId: sc.site.org_id,
        siteId: sc.site.id,
        actorId: sc.ctx.user.id,
        actorRole: sc.ctx.role,
        action: "risk_analysis.ai_fallback_template",
        entityTable: "risk_analyses",
        entityId: riskAnalysisId,
        diff: { reason: err.message },
      });
      revalidatePath(`/app/${sc.site.id}/programme`);
      return { fallback: true, riskAnalysisId };
    } catch {
      return { error: "aiUnavailable" };
    }
  }

  // §7.3 completeness validator — problems are surfaced in the review editor,
  // and the §3.3.1 approval validator independently blocks uncovered criticals.
  const warnings = validateDraftCompleteness(generated.sections);

  const { data: latest } = await sc.supabase
    .from("risk_analyses")
    .select("version")
    .eq("site_id", sc.site.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: ra, error: raError } = await sc.supabase
    .from("risk_analyses")
    .insert({
      site_id: sc.site.id,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      wizard_transcript: transcriptToJson(parsed.data.answers),
    })
    .select("id")
    .single();
  if (raError || !ra) return { error: "error" };

  let rejectedLimits: string[];
  try {
    const written = await writeDraftToRiskAnalysis({
      supabase: sc.supabase,
      siteId: sc.site.id,
      riskAnalysisId: ra.id,
      sections: generated.sections,
      pack: generated.pack,
      packVersion: generated.packVersion,
      answers: parsed.data.answers,
    });
    rejectedLimits = written.rejectedLimits;
  } catch {
    // leave the empty RA superseded so the site is not stuck on a broken draft
    await sc.supabase
      .from("risk_analyses")
      .update({ status: "superseded" })
      .eq("id", ra.id);
    return { error: "error" };
  }

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "risk_analysis.ai_draft_generated",
    entityTable: "risk_analyses",
    entityId: ra.id,
    diff: {
      answers: parsed.data.answers.length,
      warnings,
      // §7.3: proposals the clamp refused (looser than pack default) — audited
      rejected_limits: rejectedLimits,
    },
  });

  revalidatePath(`/app/${sc.site.id}/programme`);
  return { ok: true, riskAnalysisId: ra.id, warnings, rejectedLimits };
}
