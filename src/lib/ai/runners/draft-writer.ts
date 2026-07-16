// Persists an AI-generated draft (§7.3) into the programme tables with the
// guardrails already applied: clamped limits, ai_suggested flags on every
// generated row/hazard, pack-grounded control points only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { CompliancePack } from "@/lib/compliance/pack-schema";
import { insertControlPointsForKeys } from "@/lib/compliance/cp-writer";
import type { DraftSection } from "../schemas";
import { clampTighterLimits } from "./wizard";
import type { WizardAnswer } from "./wizard";
import { transcriptToJson } from "./wizard";

type Client = SupabaseClient<Database>;

function i18n(da: string | null, en: string | null): Json | null {
  if (!da && !en) return null;
  return { da: da ?? en ?? "", en: en ?? da ?? "" } as Json;
}

function equipmentCountsFromAnswers(answers: WizardAnswer[]): Map<string, number> {
  const counts = new Map<string, number>();
  const mapping: Record<string, string> = {
    fridge_count: "fridge",
    freezer_count: "freezer",
    hot_holding_count: "hot_holding",
  };
  for (const answer of answers) {
    const kind = mapping[answer.questionId];
    if (!kind) continue;
    const n = Number.parseInt(answer.answer, 10);
    if (Number.isFinite(n) && n > 0 && n <= 20) counts.set(kind, n);
  }
  return counts;
}

export async function writeDraftToRiskAnalysis(args: {
  supabase: Client;
  siteId: string;
  riskAnalysisId: string; // pre-created wizard RA (holds the transcript)
  sections: DraftSection[];
  pack: CompliancePack;
  packVersion: string;
  answers: WizardAnswer[];
}): Promise<{ rejectedLimits: string[] }> {
  const { supabase, pack } = args;

  // §7.3: collect + clamp AI limit proposals across all sections
  const allProposals = args.sections.flatMap((s) => s.tighterLimits);
  const { accepted: tightened, rejected: rejectedLimits } = clampTighterLimits(
    pack,
    allProposals,
  );

  // official skema row keys for coercion (unknown keys become custom)
  const officialRowKeys = new Set(
    pack.officialSkema.sections.flatMap((s) => s.rows.map((r) => r.key)),
  );

  // 1 — process steps
  const stepInserts = pack.officialSkema.sections.map((section, i) => ({
    risk_analysis_id: args.riskAnalysisId,
    position: i,
    key: section.key,
    name_i18n: section.name as unknown as Json,
  }));
  const { data: steps, error: stepsError } = await supabase
    .from("process_steps")
    .insert(stepInserts)
    .select("id, key");
  if (stepsError || !steps) throw new Error(`steps: ${stepsError?.message}`);
  const stepIdByKey = new Map(steps.map((s) => [s.key, s.id]));

  // 2 — equipment (from interview counts, else template suggestions), if none
  const { data: existing } = await supabase
    .from("equipment")
    .select("id, kind")
    .eq("site_id", args.siteId)
    .eq("active", true);
  let equipment = existing ?? [];
  if (equipment.length === 0) {
    const template = pack.activityTemplates.find((t) =>
      t.equipmentSuggestions.length > 0,
    );
    const counts = equipmentCountsFromAnswers(args.answers);
    const suggestions =
      counts.size > 0
        ? [...counts.entries()].map(([kind, count]) => ({
            kind: kind as "fridge" | "freezer" | "hot_holding",
            count,
            name: { da: kind === "fridge" ? "Køleskab" : kind === "freezer" ? "Fryser" : "Varmholdelsesenhed", en: kind },
          }))
        : (template?.equipmentSuggestions ?? []);
    if (suggestions.length > 0) {
      const inserts = suggestions.flatMap((s) =>
        Array.from({ length: s.count }, (_, i) => ({
          site_id: args.siteId,
          kind: s.kind,
          name: s.count > 1 ? `${s.name.da} ${i + 1}` : s.name.da,
        })),
      );
      const { data: created } = await supabase
        .from("equipment")
        .insert(inserts)
        .select("id, kind");
      equipment = created ?? [];
    }
  }

  // 3 — rows + hazards (all flagged ai_suggested, §7.3)
  const cpKeys = new Set<string>(pack.prerequisiteControlPointKeys);
  for (const section of args.sections) {
    const stepId = stepIdByKey.get(section.sectionKey);
    if (!stepId) continue;
    let position = 0;
    for (const row of section.rows) {
      const activityKey = officialRowKeys.has(row.activityKey) ? row.activityKey : "custom";
      const { data: inserted, error } = await supabase
        .from("ra_activity_rows")
        .insert({
          risk_analysis_id: args.riskAnalysisId,
          process_step_id: stepId,
          position: position++,
          activity_key: activityKey,
          applies: row.applies,
          is_critical: row.critical,
          what_you_do_i18n: i18n(
            row.customName_da
              ? `${row.customName_da}: ${row.whatYouDo_da ?? ""}`
              : row.whatYouDo_da,
            row.customName_en
              ? `${row.customName_en}: ${row.whatYouDo_en ?? ""}`
              : row.whatYouDo_en,
          ),
          what_can_go_wrong_i18n: i18n(row.whatCanGoWrong_da, row.whatCanGoWrong_en),
          control_measures_i18n: i18n(row.controlMeasures_da, row.controlMeasures_en),
          if_it_goes_wrong_i18n: i18n(row.ifItGoesWrong_da, row.ifItGoesWrong_en),
          ai_suggested: true,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(`row: ${error?.message}`);

      if (row.applies) {
        row.controlPointKeys.forEach((k) => cpKeys.add(k));
        if (row.hazards.length > 0) {
          const { error: hazardError } = await supabase.from("hazards").insert(
            row.hazards.map((hazard) => ({
              process_step_id: stepId,
              ra_row_id: inserted.id,
              category: hazard.category,
              description_i18n: i18n(hazard.description_da, hazard.description_en)!,
              likelihood: hazard.likelihood,
              severity: hazard.severity,
              is_ccp: hazard.isCcp,
              control_measure_i18n: i18n(hazard.controlMeasure_da, hazard.controlMeasure_en),
              justification_i18n: i18n(hazard.justification_da, hazard.justification_en),
              ai_suggested: true,
            })),
          );
          if (hazardError) throw new Error(`hazards: ${hazardError.message}`);
        }
      }
    }
  }

  // 4 — control points from pack templates (per-equipment fan-out), with
  // clamped tighter limits where accepted
  await insertControlPointsForKeys(supabase, {
    siteId: args.siteId,
    riskAnalysisId: args.riskAnalysisId,
    pack,
    keys: cpKeys,
    tightened,
  });

  // 5 — default cleaning areas + pack pin (parity with the template path)
  const { data: areas } = await supabase
    .from("cleaning_areas")
    .select("id")
    .eq("site_id", args.siteId)
    .limit(1);
  if (!areas || areas.length === 0) {
    const defaults = [
      { da: "Køkken og arbejdsflader", en: "Kitchen and work surfaces" },
      { da: "Køl og frys", en: "Fridges and freezers" },
      { da: "Lager", en: "Storage" },
      { da: "Gulve og afløb", en: "Floors and drains" },
    ];
    await supabase.from("cleaning_areas").insert(
      defaults.map((area, i) => ({
        site_id: args.siteId,
        name_i18n: area as unknown as Json,
        position: i,
      })),
    );
  }
  await supabase
    .from("sites")
    .update({ pack_version_pinned: args.packVersion })
    .eq("id", args.siteId);

  // persist the final transcript on the RA (§7.2: auditable origin)
  await supabase
    .from("risk_analyses")
    .update({ wizard_transcript: transcriptToJson(args.answers) })
    .eq("id", args.riskAnalysisId);

  return { rejectedLimits };
}
