// Server/script-side only (server actions, seed, tests) — no Next.js deps.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { loadPackVersion } from "./pack";
import type { ActivityTemplate, CompliancePack, I18nText } from "./pack-schema";

/**
 * "Start from template" path (§7.1): instantiate the pack's activity template
 * into a DRAFT risk analysis mirroring the official skema 1:1 (§3.3.1), plus
 * suggested equipment and control points. Nothing goes live before explicit
 * approval (§7.4). All rows carry template provenance; nothing is AI-generated
 * here (ai_suggested = false).
 */

type Client = SupabaseClient<Database>;

function asJson(value: unknown): Json {
  return value as Json;
}

export async function applyActivityTemplate(
  supabase: Client,
  args: { siteId: string },
): Promise<{ riskAnalysisId: string; packVersion: string }> {
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, activity_type, compliance_pack, timezone")
    .eq("id", args.siteId)
    .maybeSingle();
  if (!site) throw new Error("site not found or not accessible");

  const { pack, version } = await loadPackVersion(supabase, site.compliance_pack);
  const template = pack.activityTemplates.find((t) => t.code === site.activity_type);
  if (!template) throw new Error(`no activity template for ${site.activity_type}`);

  // Next RA version for this site.
  const { data: latest } = await supabase
    .from("risk_analyses")
    .select("version")
    .eq("site_id", site.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: ra, error: raError } = await supabase
    .from("risk_analyses")
    .insert({ site_id: site.id, version: nextVersion, status: "draft" })
    .select("id")
    .single();
  if (raError || !ra) throw new Error(`risk analysis insert failed: ${raError?.message}`);

  // 1 — official sections → process_steps
  const stepInserts = pack.officialSkema.sections.map((section, i) => ({
    risk_analysis_id: ra.id,
    position: i,
    key: section.key,
    name_i18n: asJson(section.name),
  }));
  const { data: steps, error: stepsError } = await supabase
    .from("process_steps")
    .insert(stepInserts)
    .select("id, key");
  if (stepsError || !steps) throw new Error(`process steps failed: ${stepsError?.message}`);
  const stepIdByKey = new Map(steps.map((s) => [s.key, s.id]));

  // 2 — official rows → ra_activity_rows (template config; defaults elsewhere)
  const rowInserts: Database["public"]["Tables"]["ra_activity_rows"]["Insert"][] = [];
  for (const section of pack.officialSkema.sections) {
    section.rows.forEach((row, position) => {
      const cfg = template.rows[row.key];
      const texts = {
        what_you_do_i18n: asJson(cfg?.texts?.whatYouDo ?? row.defaultTexts?.whatYouDo ?? null),
        what_can_go_wrong_i18n: asJson(
          cfg?.texts?.whatCanGoWrong ?? row.defaultTexts?.whatCanGoWrong ?? null,
        ),
        control_measures_i18n: asJson(
          cfg?.texts?.controlMeasures ?? row.defaultTexts?.controlMeasures ?? null,
        ),
        if_it_goes_wrong_i18n: asJson(
          cfg?.texts?.ifItGoesWrong ?? row.defaultTexts?.ifItGoesWrong ?? null,
        ),
      };
      rowInserts.push({
        risk_analysis_id: ra.id,
        process_step_id: stepIdByKey.get(section.key)!,
        position,
        activity_key: row.key,
        applies: cfg?.applies ?? false,
        is_critical: cfg?.critical ?? false,
        ...(cfg?.applies ? texts : {}),
      });
    });
  }
  const { data: rows, error: rowsError } = await supabase
    .from("ra_activity_rows")
    .insert(rowInserts)
    .select("id, activity_key, process_step_id");
  if (rowsError || !rows) throw new Error(`activity rows failed: ${rowsError?.message}`);
  const rowByKey = new Map(rows.map((r) => [r.activity_key, r]));

  // 3 — hazard detail layer behind applying rows (§3.3.1)
  const hazardInserts: Database["public"]["Tables"]["hazards"]["Insert"][] = [];
  for (const [rowKey, cfg] of Object.entries(template.rows)) {
    if (!cfg.applies) continue;
    const row = rowByKey.get(rowKey);
    if (!row) continue;
    for (const hazardKey of cfg.hazardKeys) {
      const entry = pack.hazardLibrary.find((h) => h.key === hazardKey);
      if (!entry) continue;
      hazardInserts.push({
        process_step_id: row.process_step_id,
        ra_row_id: row.id,
        category: entry.category,
        description_i18n: asJson(entry.description),
        control_measure_i18n: asJson(entry.controlMeasure),
        is_ccp: cfg.critical,
      });
    }
  }
  if (hazardInserts.length > 0) {
    const { error } = await supabase.from("hazards").insert(hazardInserts);
    if (error) throw new Error(`hazards failed: ${error.message}`);
  }

  // 4 — suggested equipment (only when the site has none yet)
  const { data: existingEquipment } = await supabase
    .from("equipment")
    .select("id, kind")
    .eq("site_id", site.id)
    .eq("active", true);
  let equipment = existingEquipment ?? [];
  if (equipment.length === 0 && template.equipmentSuggestions.length > 0) {
    const equipmentInserts = template.equipmentSuggestions.flatMap((s) =>
      Array.from({ length: s.count }, (_, i) => ({
        site_id: site.id,
        kind: s.kind,
        name: s.count > 1 ? `${s.name.da} ${i + 1}` : s.name.da,
      })),
    );
    const { data: created, error } = await supabase
      .from("equipment")
      .insert(equipmentInserts)
      .select("id, kind");
    if (error || !created) throw new Error(`equipment failed: ${error?.message}`);
    equipment = created;
  }

  // 5 — control points: applying rows' template keys + the pack's standing
  // prerequisite programmes (cleaning, hygiene, pest, training — EK p. 3)
  const cpKeys = new Set<string>(pack.prerequisiteControlPointKeys);
  for (const cfg of Object.values(template.rows)) {
    if (cfg.applies) cfg.controlPointKeys.forEach((k) => cpKeys.add(k));
  }
  const cpInserts: Database["public"]["Tables"]["control_points"]["Insert"][] = [];
  for (const key of cpKeys) {
    const tpl = pack.controlPointTemplates.find((t) => t.key === key);
    if (!tpl) continue;
    const equipmentKinds = tpl.appliesTo
      .filter((a) => a.startsWith("equipment:"))
      .map((a) => a.slice("equipment:".length));
    const targetUnits = equipment.filter((e) => equipmentKinds.includes(e.kind));

    const base = {
      site_id: site.id,
      risk_analysis_id: ra.id,
      template_key: tpl.key,
      category: tpl.category,
      limit_json: asJson(tpl.defaultLimit),
      frequency_json: asJson(tpl.defaultFrequency),
      monitoring_method: tpl.monitoringMethod,
      instructions_i18n: asJson(tpl.instructions),
      corrective_guidance_i18n: asJson(tpl.correctiveGuidance),
      source_ref: asJson(tpl.sourceRef), // §3.3: the limit's provenance travels with the CP
    };

    if (targetUnits.length > 0) {
      // one CP per matching equipment unit (e.g. per fridge)
      for (const unit of targetUnits) {
        cpInserts.push({
          ...base,
          target_kind: "equipment",
          equipment_id: unit.id,
          name_i18n: asJson(tpl.name),
        });
      }
    } else {
      const targetKind = tpl.appliesTo[0]?.startsWith("area:")
        ? "area"
        : tpl.appliesTo[0]?.startsWith("supplier:")
          ? "supplier"
          : "process";
      cpInserts.push({
        ...base,
        target_kind: targetKind,
        name_i18n: asJson(tpl.name),
      });
    }
  }
  if (cpInserts.length > 0) {
    const { error } = await supabase.from("control_points").insert(cpInserts);
    if (error) throw new Error(`control points failed: ${error.message}`);
  }

  // pin the pack version used to author this programme
  await supabase
    .from("sites")
    .update({ pack_version_pinned: version })
    .eq("id", site.id);

  return { riskAnalysisId: ra.id, packVersion: version };
}

export type { ActivityTemplate, CompliancePack, I18nText };
