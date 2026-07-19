// §13 regulation change pipeline: a newly published pack_version fans out
// idempotent site_review_tasks with per-CP diffs. Nothing silently changes an
// approved programme (R9) — every item is decided by a site manager.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { loadPackVersion } from "./pack";
import type { CompliancePack, PackLimit } from "./pack-schema";

type Client = SupabaseClient<Database>;

export type PackDiffItem = {
  key: string;
  kind: "limit_changed" | "frequency_changed" | "template_added" | "template_removed";
  before: Json | null;
  after: Json | null;
  /** the site's CURRENT value for this CP (review shows all three) */
  siteValue?: Json | null;
  decision?: { action: "applied" | "kept"; justification?: string; at: string } | null;
};

/** Deterministic pack-to-pack diff over control point templates. */
export function computePackDiff(
  oldPack: CompliancePack,
  newPack: CompliancePack,
): PackDiffItem[] {
  const items: PackDiffItem[] = [];
  const oldByKey = new Map(oldPack.controlPointTemplates.map((t) => [t.key, t]));
  const newByKey = new Map(newPack.controlPointTemplates.map((t) => [t.key, t]));

  for (const [key, oldTpl] of oldByKey) {
    const newTpl = newByKey.get(key);
    if (!newTpl) {
      items.push({ key, kind: "template_removed", before: oldTpl.defaultLimit as unknown as Json, after: null });
      continue;
    }
    if (JSON.stringify(oldTpl.defaultLimit) !== JSON.stringify(newTpl.defaultLimit)) {
      items.push({
        key,
        kind: "limit_changed",
        before: oldTpl.defaultLimit as unknown as Json,
        after: newTpl.defaultLimit as unknown as Json,
      });
    }
    if (JSON.stringify(oldTpl.defaultFrequency) !== JSON.stringify(newTpl.defaultFrequency)) {
      items.push({
        key,
        kind: "frequency_changed",
        before: oldTpl.defaultFrequency as unknown as Json,
        after: newTpl.defaultFrequency as unknown as Json,
      });
    }
  }
  for (const [key, newTpl] of newByKey) {
    if (!oldByKey.has(key)) {
      items.push({ key, kind: "template_added", before: null, after: newTpl.defaultLimit as unknown as Json });
    }
  }
  return items;
}

export type FanOutResult = {
  updates: number;
  reviewTasks: number;
};

/**
 * Cron step: for every site whose pinned pack version is older than the
 * latest published one, ensure a regulatory_updates row and an idempotent
 * site_review_task carrying the site-relevant diff.
 */
export async function processPackUpdates(supabase: Client): Promise<FanOutResult> {
  const result: FanOutResult = { updates: 0, reviewTasks: 0 };

  const { data: packs } = await supabase.from("compliance_packs").select("code");
  for (const pack of packs ?? []) {
    const latest = await loadPackVersion(supabase, pack.code);

    // sites pinned to an older version of this pack
    const { data: sites } = await supabase
      .from("sites")
      .select("id, org_id, pack_version_pinned")
      .eq("compliance_pack", pack.code)
      .not("pack_version_pinned", "is", null)
      .neq("pack_version_pinned", latest.version)
      .neq("status", "archived");
    if (!sites || sites.length === 0) continue;

    // group per from-version so the pack diff is computed once
    const byFromVersion = new Map<string, typeof sites>();
    for (const site of sites) {
      const list = byFromVersion.get(site.pack_version_pinned!) ?? [];
      list.push(site);
      byFromVersion.set(site.pack_version_pinned!, list);
    }

    for (const [fromVersion, group] of byFromVersion) {
      let oldPack: CompliancePack;
      try {
        oldPack = (await loadPackVersion(supabase, pack.code, fromVersion)).pack;
      } catch {
        continue; // unknown historical version — nothing to diff against
      }
      const diff = computePackDiff(oldPack, latest.pack);
      if (diff.length === 0) continue;

      // regulatory_updates row — append-only table, so select-then-insert
      // (the unique transition key makes concurrent inserts safe to retry)
      const summary = {
        da: `Regelpakken er opdateret (${fromVersion} → ${latest.version}) — ${diff.length} ændringer`,
        en: `Rule pack updated (${fromVersion} → ${latest.version}) — ${diff.length} changes`,
      };
      let update = (
        await supabase
          .from("regulatory_updates")
          .select("id")
          .eq("pack_code", pack.code)
          .eq("from_version", fromVersion)
          .eq("to_version", latest.version)
          .maybeSingle()
      ).data;
      if (!update) {
        update = (
          await supabase
            .from("regulatory_updates")
            .insert({
              pack_code: pack.code,
              from_version: fromVersion,
              to_version: latest.version,
              summary_i18n: summary as Json,
            })
            .select("id")
            .single()
        ).data;
        if (update) result.updates++;
      }
      if (!update) continue;

      for (const site of group) {
        // only the CPs this site actually runs (plus newly added templates)
        const { data: siteCps } = await supabase
          .from("control_points")
          .select("template_key, limit_json, frequency_json")
          .eq("site_id", site.id)
          .eq("active", true)
          .not("template_key", "is", null);
        const siteKeys = new Map(
          (siteCps ?? []).map((cp) => [cp.template_key!, cp]),
        );
        const items = diff
          .filter((item) => item.kind === "template_added" || siteKeys.has(item.key))
          .map((item) => ({
            ...item,
            siteValue:
              item.kind === "frequency_changed"
                ? (siteKeys.get(item.key)?.frequency_json ?? null)
                : (siteKeys.get(item.key)?.limit_json ?? null),
            decision: null,
          }));
        if (items.length === 0) continue;

        const { data: task, error } = await supabase
          .from("site_review_tasks")
          .upsert(
            {
              site_id: site.id,
              trigger: "pack_update",
              regulatory_update_id: update.id,
              diff_json: {
                fromVersion,
                toVersion: latest.version,
                items,
              } as unknown as Json,
              due_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
            },
            { onConflict: "site_id,regulatory_update_id", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
        if (!error && task) {
          result.reviewTasks++;
          await supabase.from("notifications").insert({
            site_id: site.id,
            kind: "pack_update",
            payload: { review_task_id: task.id, ...summary } as Json,
            channels: ["in_app"],
          });
        }
      }
    }
  }
  return result;
}

/** Applying a suggested change may only follow the pack (§13 one-tap apply). */
export function limitFromDiffItem(item: PackDiffItem): PackLimit | null {
  if (item.kind !== "limit_changed" || !item.after) return null;
  return item.after as unknown as PackLimit;
}
