// §11 programme templating: snapshot one site's programme → apply to sites
// without one (fresh draft) or push to sites with one (proposals requiring
// local approval — each site's programme must match THAT site, R9).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { loadPackVersion } from "./pack";
import { insertControlPointsForKeys } from "./cp-writer";

type Client = SupabaseClient<Database>;

export type TemplateContent = {
  sourcePackVersion: string | null;
  rows: {
    sectionKey: string;
    activityKey: string;
    applies: boolean;
    critical: boolean;
    whatYouDo: Json | null;
    whatCanGoWrong: Json | null;
    controlMeasures: Json | null;
    ifItGoesWrong: Json | null;
  }[];
  controlPoints: {
    templateKey: string | null;
    name: Json;
    category: string;
    targetKind: string;
    limit: Json;
    frequency: Json;
    monitoringMethod: string;
    instructions: Json | null;
    correctiveGuidance: Json | null;
    sourceRef: Json | null;
  }[];
};

export async function buildTemplateContent(
  supabase: Client,
  siteId: string,
): Promise<TemplateContent | null> {
  const { data: ra } = await supabase
    .from("risk_analyses")
    .select("id")
    .eq("site_id", siteId)
    .in("status", ["approved", "draft"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ra) return null;

  const [{ data: site }, { data: steps }, { data: rows }, { data: cps }] =
    await Promise.all([
      supabase.from("sites").select("pack_version_pinned").eq("id", siteId).single(),
      supabase
        .from("process_steps")
        .select("id, key")
        .eq("risk_analysis_id", ra.id),
      supabase
        .from("ra_activity_rows")
        .select(
          "process_step_id, activity_key, applies, is_critical, what_you_do_i18n, what_can_go_wrong_i18n, control_measures_i18n, if_it_goes_wrong_i18n",
        )
        .eq("risk_analysis_id", ra.id),
      supabase
        .from("control_points")
        .select(
          "template_key, name_i18n, category, target_kind, limit_json, frequency_json, monitoring_method, instructions_i18n, corrective_guidance_i18n, source_ref",
        )
        .eq("risk_analysis_id", ra.id)
        .eq("active", true),
    ]);

  const sectionByStepId = new Map((steps ?? []).map((step) => [step.id, step.key]));
  // per-equipment CP fan-out collapses to one entry per template key
  const seenTemplateKeys = new Set<string>();
  const controlPoints: TemplateContent["controlPoints"] = [];
  for (const cp of cps ?? []) {
    if (cp.template_key) {
      if (seenTemplateKeys.has(cp.template_key)) continue;
      seenTemplateKeys.add(cp.template_key);
    }
    controlPoints.push({
      templateKey: cp.template_key,
      name: cp.name_i18n,
      category: cp.category,
      targetKind: cp.target_kind,
      limit: cp.limit_json,
      frequency: cp.frequency_json,
      monitoringMethod: cp.monitoring_method,
      instructions: cp.instructions_i18n,
      correctiveGuidance: cp.corrective_guidance_i18n,
      sourceRef: cp.source_ref,
    });
  }

  return {
    sourcePackVersion: site?.pack_version_pinned ?? null,
    rows: (rows ?? []).map((row) => ({
      sectionKey: sectionByStepId.get(row.process_step_id) ?? "andet",
      activityKey: row.activity_key,
      applies: row.applies,
      critical: row.is_critical,
      whatYouDo: row.what_you_do_i18n,
      whatCanGoWrong: row.what_can_go_wrong_i18n,
      controlMeasures: row.control_measures_i18n,
      ifItGoesWrong: row.if_it_goes_wrong_i18n,
    })),
    controlPoints,
  };
}

/** Fresh draft on a site with no programme (equipment re-mapped to the target). */
export async function applyTemplateContent(
  supabase: Client,
  args: { siteId: string; content: TemplateContent },
): Promise<{ riskAnalysisId: string }> {
  const { data: site } = await supabase
    .from("sites")
    .select("id, compliance_pack")
    .eq("id", args.siteId)
    .single();
  if (!site) throw new Error("site not found");
  const { pack, version } = await loadPackVersion(supabase, site.compliance_pack);

  const { data: latest } = await supabase
    .from("risk_analyses")
    .select("version")
    .eq("site_id", args.siteId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: ra, error: raError } = await supabase
    .from("risk_analyses")
    .insert({
      site_id: args.siteId,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
    })
    .select("id")
    .single();
  if (raError || !ra) throw new Error(`risk analysis: ${raError?.message}`);

  const stepInserts = pack.officialSkema.sections.map((section, index) => ({
    risk_analysis_id: ra.id,
    position: index,
    key: section.key,
    name_i18n: section.name as unknown as Json,
  }));
  const { data: steps, error: stepsError } = await supabase
    .from("process_steps")
    .insert(stepInserts)
    .select("id, key");
  if (stepsError || !steps) throw new Error(`steps: ${stepsError?.message}`);
  const stepIdByKey = new Map(steps.map((step) => [step.key, step.id]));

  const positionBySection = new Map<string, number>();
  const rowInserts = args.content.rows.flatMap((row) => {
    const stepId = stepIdByKey.get(row.sectionKey);
    if (!stepId) return [];
    const position = positionBySection.get(row.sectionKey) ?? 0;
    positionBySection.set(row.sectionKey, position + 1);
    return [
      {
        risk_analysis_id: ra.id,
        process_step_id: stepId,
        position,
        activity_key: row.activityKey,
        applies: row.applies,
        is_critical: row.critical,
        what_you_do_i18n: row.whatYouDo,
        what_can_go_wrong_i18n: row.whatCanGoWrong,
        control_measures_i18n: row.controlMeasures,
        if_it_goes_wrong_i18n: row.ifItGoesWrong,
      },
    ];
  });
  if (rowInserts.length > 0) {
    const { error } = await supabase.from("ra_activity_rows").insert(rowInserts);
    if (error) throw new Error(`rows: ${error.message}`);
  }

  // pack-template CPs re-fan-out over the TARGET site's equipment, then the
  // template's values override where they differ from pack defaults
  const templateKeys = new Set(
    args.content.controlPoints
      .filter((cp) => cp.templateKey)
      .map((cp) => cp.templateKey!),
  );
  await insertControlPointsForKeys(supabase, {
    siteId: args.siteId,
    riskAnalysisId: ra.id,
    pack,
    keys: templateKeys,
  });
  for (const cp of args.content.controlPoints) {
    if (!cp.templateKey) {
      // custom site-authored CP: copied as-is (process-target)
      await supabase.from("control_points").insert({
        site_id: args.siteId,
        risk_analysis_id: ra.id,
        template_key: null,
        name_i18n: cp.name,
        // snapshot round-trips the enum value; DB validates on insert
        category: cp.category as Database["public"]["Enums"]["cp_category"],
        target_kind: "process",
        limit_json: cp.limit,
        frequency_json: cp.frequency,
        monitoring_method: cp.monitoringMethod,
        instructions_i18n: cp.instructions,
        corrective_guidance_i18n: cp.correctiveGuidance,
        source_ref: cp.sourceRef,
      });
      continue;
    }
    await supabase
      .from("control_points")
      .update({ limit_json: cp.limit, frequency_json: cp.frequency })
      .eq("risk_analysis_id", ra.id)
      .eq("template_key", cp.templateKey);
  }

  await supabase
    .from("sites")
    .update({ pack_version_pinned: version })
    .eq("id", args.siteId);
  return { riskAnalysisId: ra.id };
}

export type TemplateDiffItem = {
  templateKey: string;
  field: "limit" | "frequency";
  siteValue: Json | null;
  templateValue: Json;
};

/** Central-edit push: what would change on this site (by pack template key). */
export function computeTemplateDiff(
  content: TemplateContent,
  siteCps: { template_key: string | null; limit_json: Json; frequency_json: Json }[],
): TemplateDiffItem[] {
  const items: TemplateDiffItem[] = [];
  const siteByKey = new Map(
    siteCps.filter((cp) => cp.template_key).map((cp) => [cp.template_key!, cp]),
  );
  for (const cp of content.controlPoints) {
    if (!cp.templateKey) continue;
    const siteCp = siteByKey.get(cp.templateKey);
    if (!siteCp) continue;
    if (JSON.stringify(siteCp.limit_json) !== JSON.stringify(cp.limit)) {
      items.push({
        templateKey: cp.templateKey,
        field: "limit",
        siteValue: siteCp.limit_json,
        templateValue: cp.limit,
      });
    }
    if (JSON.stringify(siteCp.frequency_json) !== JSON.stringify(cp.frequency)) {
      items.push({
        templateKey: cp.templateKey,
        field: "frequency",
        siteValue: siteCp.frequency_json,
        templateValue: cp.frequency,
      });
    }
  }
  return items;
}
