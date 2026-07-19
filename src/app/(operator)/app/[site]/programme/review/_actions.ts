"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { loadPackVersion } from "@/lib/compliance/pack";
import { insertControlPointsForKeys } from "@/lib/compliance/cp-writer";
import { rescheduleControlPoint } from "@/lib/compliance/materialize-runner";
import { compareStrictness, parseLimit } from "@/lib/compliance/limits";
import type { PackDiffItem } from "@/lib/compliance/pack-update";
import type { Json } from "@/lib/supabase/database.types";

async function managerSiteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, compliance_pack")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return null;
  return { supabase, site, ctx };
}

type DiffPayload = { fromVersion: string; toVersion: string; items: PackDiffItem[] };

const decideSchema = z.object({
  siteId: z.uuid(),
  taskId: z.uuid(),
  itemKey: z.string().min(1),
  itemKind: z.string().min(1),
  action: z.enum(["apply", "keep"]),
  justification: z.string().trim().max(2000).nullable(),
});

export type ReviewDecisionState =
  | { ok: true; resolved: boolean }
  | { error: "error" | "justificationRequired" }
  | null;

/**
 * §13 one-tap decision per diff item: "apply suggested change" updates the
 * site CPs to the new pack default; "keep mine" requires a justification and
 * flags looser-than-default limits (§7.3). All decisions audited; the task
 * resolves when every item is decided (R9: nothing silently changes).
 */
export async function decideReviewItem(input: unknown): Promise<ReviewDecisionState> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await managerSiteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: task } = await sc.supabase
    .from("site_review_tasks")
    .select("id, status, diff_json")
    .eq("id", parsed.data.taskId)
    .eq("site_id", sc.site.id)
    .maybeSingle();
  if (!task || task.status !== "open" || !task.diff_json) return { error: "error" };
  const diff = task.diff_json as unknown as DiffPayload;
  const item = diff.items.find(
    (candidate) =>
      candidate.key === parsed.data.itemKey && candidate.kind === parsed.data.itemKind,
  );
  if (!item || item.decision) return { error: "error" };

  if (parsed.data.action === "keep" && !parsed.data.justification) {
    return { error: "justificationRequired" }; // keeping always explains why
  }

  if (parsed.data.action === "apply") {
    if (item.kind === "limit_changed" && item.after) {
      const { error } = await sc.supabase
        .from("control_points")
        .update({
          limit_json: item.after,
          limit_loosened: false,
          limit_justification: null,
        })
        .eq("site_id", sc.site.id)
        .eq("template_key", item.key)
        .eq("active", true);
      if (error) return { error: "error" };
    } else if (item.kind === "frequency_changed" && item.after) {
      const { data: cps, error } = await sc.supabase
        .from("control_points")
        .update({ frequency_json: item.after })
        .eq("site_id", sc.site.id)
        .eq("template_key", item.key)
        .eq("active", true)
        .select("id");
      if (error) return { error: "error" };
      for (const cp of cps ?? []) {
        await rescheduleControlPoint(sc.supabase, cp.id, sc.site.id);
      }
    } else if (item.kind === "template_added") {
      // instantiate the new pack requirement on this site's current RA
      const { data: ra } = await sc.supabase
        .from("risk_analyses")
        .select("id")
        .eq("site_id", sc.site.id)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ra) {
        const { pack } = await loadPackVersion(sc.supabase, sc.site.compliance_pack);
        await insertControlPointsForKeys(sc.supabase, {
          siteId: sc.site.id,
          riskAnalysisId: ra.id,
          pack,
          keys: new Set([item.key]),
        });
      }
    }
  } else if (item.kind === "limit_changed" && item.after && item.siteValue) {
    // keeping a value looser than the NEW default → flagged with justification
    try {
      const strictness = compareStrictness(
        parseLimit(item.after),
        parseLimit(item.siteValue),
      );
      if (strictness === "looser") {
        await sc.supabase
          .from("control_points")
          .update({
            limit_loosened: true,
            limit_justification: parsed.data.justification,
          })
          .eq("site_id", sc.site.id)
          .eq("template_key", item.key)
          .eq("active", true);
      }
    } catch {
      // incomparable shapes: keep without the loosened flag
    }
  }

  // record the decision inside diff_json; resolve when all items are decided
  item.decision = {
    action: parsed.data.action === "apply" ? "applied" : "kept",
    justification: parsed.data.justification ?? undefined,
    at: new Date().toISOString(),
  };
  const allDecided = diff.items.every((candidate) => candidate.decision);
  const { error: updateError } = await sc.supabase
    .from("site_review_tasks")
    .update({
      diff_json: diff as unknown as Json,
      ...(allDecided
        ? {
            status: "resolved" as const,
            resolved_at: new Date().toISOString(),
            resolved_by: sc.ctx.user.id,
          }
        : {}),
    })
    .eq("id", task.id);
  if (updateError) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action:
      parsed.data.action === "apply"
        ? "review_task.change_applied"
        : "review_task.change_kept",
    entityTable: "site_review_tasks",
    entityId: task.id,
    diff: {
      key: item.key,
      kind: item.kind,
      justification: parsed.data.justification,
    },
  });

  revalidatePath(`/app/${sc.site.id}/programme`);
  revalidatePath(`/app/${sc.site.id}/programme/review/${task.id}`);
  return { ok: true, resolved: allDecided };
}
