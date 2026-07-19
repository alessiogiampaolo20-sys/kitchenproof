"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getActiveOrgId } from "@/lib/org-context";
import { getOrgContext } from "@/lib/tenancy";
import {
  applyTemplateContent,
  buildTemplateContent,
  computeTemplateDiff,
  type TemplateContent,
} from "@/lib/compliance/template";
import type { Json } from "@/lib/supabase/database.types";

const ADMIN_ROLES = ["org_owner", "org_admin"];

async function orgAdminContext() {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  const supabase = await createClient();
  const ctx = await getOrgContext(supabase, orgId);
  if (!ctx || !ADMIN_ROLES.includes(ctx.role)) return null;
  return { supabase, orgId, ctx };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceSiteId: z.uuid(),
});

export type TemplateActionState =
  | { ok: true }
  | { error: "error" | "noProgramme" | "noChanges" }
  | null;

/** §11: snapshot one site's programme as an org-level template. */
export async function createTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    sourceSiteId: formData.get("sourceSiteId"),
  });
  if (!parsed.success) return { error: "error" };
  const oc = await orgAdminContext();
  if (!oc) return { error: "error" };

  const { data: site } = await oc.supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.sourceSiteId)
    .eq("org_id", oc.orgId)
    .maybeSingle();
  if (!site) return { error: "error" };

  const content = await buildTemplateContent(oc.supabase, site.id);
  if (!content) return { error: "noProgramme" };

  const { data: template, error } = await oc.supabase
    .from("org_programme_templates")
    .insert({
      org_id: oc.orgId,
      name: parsed.data.name,
      source_site_id: site.id,
      content: content as unknown as Json,
      created_by: oc.ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !template) return { error: "error" };

  await writeAudit(oc.supabase, {
    orgId: oc.orgId,
    siteId: site.id,
    actorId: oc.ctx.user.id,
    actorRole: oc.ctx.role,
    action: "programme_template.created",
    entityTable: "org_programme_templates",
    entityId: template.id,
    diff: { name: parsed.data.name },
  });
  revalidatePath("/org/templates");
  return { ok: true };
}

const deploySchema = z.object({
  templateId: z.uuid(),
  targetSiteId: z.uuid(),
});

export type DeployState =
  | { ok: true; mode: "draft" | "proposal" }
  | { error: "error" | "noChanges" }
  | null;

/**
 * §11 deploy: a site without a programme gets a fresh DRAFT; a site with one
 * gets a PROPOSAL requiring local approval (R9 — never a silent change).
 */
export async function deployTemplate(input: unknown): Promise<DeployState> {
  const parsed = deploySchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const oc = await orgAdminContext();
  if (!oc) return { error: "error" };

  const [{ data: template }, { data: site }] = await Promise.all([
    oc.supabase
      .from("org_programme_templates")
      .select("id, content")
      .eq("id", parsed.data.templateId)
      .eq("org_id", oc.orgId)
      .maybeSingle(),
    oc.supabase
      .from("sites")
      .select("id, org_id")
      .eq("id", parsed.data.targetSiteId)
      .eq("org_id", oc.orgId)
      .maybeSingle(),
  ]);
  if (!template || !site) return { error: "error" };
  const content = template.content as unknown as TemplateContent;

  const { data: existingRa } = await oc.supabase
    .from("risk_analyses")
    .select("id")
    .eq("site_id", site.id)
    .in("status", ["draft", "in_review", "approved"])
    .limit(1)
    .maybeSingle();

  if (!existingRa) {
    try {
      const { riskAnalysisId } = await applyTemplateContent(oc.supabase, {
        siteId: site.id,
        content,
      });
      await writeAudit(oc.supabase, {
        orgId: oc.orgId,
        siteId: site.id,
        actorId: oc.ctx.user.id,
        actorRole: oc.ctx.role,
        action: "programme_template.applied",
        entityTable: "risk_analyses",
        entityId: riskAnalysisId,
        diff: { template_id: template.id },
      });
    } catch {
      return { error: "error" };
    }
    revalidatePath("/org/templates");
    return { ok: true, mode: "draft" };
  }

  // push as proposal
  const { data: siteCps } = await oc.supabase
    .from("control_points")
    .select("template_key, limit_json, frequency_json")
    .eq("site_id", site.id)
    .eq("active", true);
  const diff = computeTemplateDiff(content, siteCps ?? []);
  if (diff.length === 0) return { error: "noChanges" };

  const { data: proposal, error } = await oc.supabase
    .from("programme_change_proposals")
    .insert({
      site_id: site.id,
      template_id: template.id,
      diff_json: diff as unknown as Json,
      proposed_by: oc.ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !proposal) return { error: "error" };

  await oc.supabase.from("notifications").insert({
    site_id: site.id,
    kind: "programme_proposal",
    payload: { proposal_id: proposal.id, changes: diff.length } as Json,
    channels: ["in_app"],
  });
  await writeAudit(oc.supabase, {
    orgId: oc.orgId,
    siteId: site.id,
    actorId: oc.ctx.user.id,
    actorRole: oc.ctx.role,
    action: "programme_proposal.pushed",
    entityTable: "programme_change_proposals",
    entityId: proposal.id,
    diff: { changes: diff.length },
  });
  revalidatePath("/org/templates");
  return { ok: true, mode: "proposal" };
}
