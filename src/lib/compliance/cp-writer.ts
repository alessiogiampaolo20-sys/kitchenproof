// Shared control-point instantiation: pack templates → control_points rows for
// a draft risk analysis, with per-equipment fan-out (one CP per fridge etc.)
// and optional pre-clamped tighter limits (§7.3 — callers clamp, never loosen).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { CompliancePack, PackLimit } from "./pack-schema";

type Client = SupabaseClient<Database>;

export async function insertControlPointsForKeys(
  supabase: Client,
  args: {
    siteId: string;
    riskAnalysisId: string;
    pack: CompliancePack;
    keys: ReadonlySet<string>;
    /** template key → accepted TIGHTER limit (already clamped by the caller) */
    tightened?: ReadonlyMap<string, PackLimit>;
  },
): Promise<void> {
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, kind")
    .eq("site_id", args.siteId)
    .eq("active", true);

  const inserts: Database["public"]["Tables"]["control_points"]["Insert"][] = [];
  for (const key of args.keys) {
    const tpl = args.pack.controlPointTemplates.find((t) => t.key === key);
    if (!tpl) continue;
    const limit = args.tightened?.get(key) ?? tpl.defaultLimit;
    const equipmentKinds = tpl.appliesTo
      .filter((a) => a.startsWith("equipment:"))
      .map((a) => a.slice("equipment:".length));
    const targets = (equipment ?? []).filter((e) => equipmentKinds.includes(e.kind));
    const base = {
      site_id: args.siteId,
      risk_analysis_id: args.riskAnalysisId,
      template_key: tpl.key,
      name_i18n: tpl.name as unknown as Json,
      category: tpl.category,
      limit_json: limit as unknown as Json,
      frequency_json: tpl.defaultFrequency as unknown as Json,
      monitoring_method: tpl.monitoringMethod,
      instructions_i18n: tpl.instructions as unknown as Json,
      corrective_guidance_i18n: tpl.correctiveGuidance as unknown as Json,
      source_ref: tpl.sourceRef as unknown as Json, // §3.3 provenance travels with the CP
    };
    if (targets.length > 0) {
      for (const unit of targets) {
        inserts.push({ ...base, target_kind: "equipment", equipment_id: unit.id });
      }
    } else {
      const targetKind = tpl.appliesTo[0]?.startsWith("area:")
        ? "area"
        : tpl.appliesTo[0]?.startsWith("supplier:")
          ? "supplier"
          : "process";
      inserts.push({ ...base, target_kind: targetKind });
    }
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("control_points").insert(inserts);
    if (error) throw new Error(`control points: ${error.message}`);
  }
}
