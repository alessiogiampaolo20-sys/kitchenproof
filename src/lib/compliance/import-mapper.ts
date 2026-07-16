// §7.5 deterministic import pipeline (no AI in here): extraction → gap
// analysis → draft risk analysis. [DECISION] rules enforced:
//   - extraction content is copied verbatim; empty cells STAY empty (null)
//   - every imported cell keeps provenance (source_import_id, page, region)
//   - gaps are reported and asked, never filled in
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { CompliancePack } from "./pack-schema";
import { insertControlPointsForKeys } from "./cp-writer";
import type { ImportExtraction } from "@/lib/ai/schemas";

type Client = SupabaseClient<Database>;
type ImportRow = ImportExtraction["rows"][number];

export const LOW_CONFIDENCE_THRESHOLD = 0.6; // §7.5 [DEFAULT]

export type ImportGapReport = {
  /** template cross-check: sections with no extracted rows but expected for the activity type */
  missingSections: string[];
  /** critical rows with empty control/corrective columns — blocks approval */
  emptyCriticalCells: { sectionKey: string; activityKey: string; fields: string[] }[];
  /** cells below the confidence threshold — review before confirming */
  lowConfidenceRows: { sectionKey: string; activityKey: string; page: number; confidence: number }[];
  /** checkboxes the extraction could not read (null) */
  unreadableCheckboxes: { sectionKey: string; activityKey: string; field: "applies" | "isCritical" }[];
  unreadableNotes: string[];
};

export function gapCount(report: ImportGapReport): number {
  return (
    report.missingSections.length +
    report.emptyCriticalCells.length +
    report.lowConfidenceRows.length +
    report.unreadableCheckboxes.length
  );
}

/** §7.5 gap analysis vs the official skema + the site's activity template. */
export function buildGapReport(
  extraction: ImportExtraction,
  pack: CompliancePack,
  activityType: string,
): ImportGapReport {
  const template = pack.activityTemplates.find((t) => t.code === activityType);
  const report: ImportGapReport = {
    missingSections: [],
    emptyCriticalCells: [],
    lowConfidenceRows: [],
    unreadableCheckboxes: [],
    unreadableNotes: extraction.unreadableNotes,
  };

  const sectionsWithRows = new Set(
    extraction.rows.filter((r) => r.applies !== false).map((r) => r.sectionKey),
  );
  for (const section of pack.officialSkema.sections) {
    if (sectionsWithRows.has(section.key)) continue;
    // expected when the activity template marks any row of this section as applying
    const expected = section.rows.some((row) => template?.rows[row.key]?.applies);
    if (expected) report.missingSections.push(section.key);
  }

  for (const row of extraction.rows) {
    if (row.isCritical === true && row.applies !== false) {
      const fields: string[] = [];
      if (!row.controlMeasures) fields.push("controlMeasures");
      if (!row.ifItGoesWrong) fields.push("ifItGoesWrong");
      if (fields.length > 0) {
        report.emptyCriticalCells.push({
          sectionKey: row.sectionKey,
          activityKey: row.activityKey,
          fields,
        });
      }
    }
    if (row.confidence < LOW_CONFIDENCE_THRESHOLD) {
      report.lowConfidenceRows.push({
        sectionKey: row.sectionKey,
        activityKey: row.activityKey,
        page: row.page,
        confidence: row.confidence,
      });
    }
    if (row.applies === null) {
      report.unreadableCheckboxes.push({
        sectionKey: row.sectionKey,
        activityKey: row.activityKey,
        field: "applies",
      });
    }
    if (row.isCritical === null) {
      report.unreadableCheckboxes.push({
        sectionKey: row.sectionKey,
        activityKey: row.activityKey,
        field: "isCritical",
      });
    }
  }

  return report;
}

/** Text goes under the DETECTED language key only — never duplicated or translated. */
function importedTextLocale(language: ImportExtraction["documentLanguage"]): string {
  return language === "en" || language === "it" ? language : "da";
}

function cellJson(text: string | null, locale: string): Json | null {
  // §7.5 [DECISION]: an empty extracted cell stays empty — no fabrication
  if (text === null || text === "") return null;
  return { [locale]: text } as Json;
}

/**
 * Pure mapper: extraction rows (plus any human corrections already applied by
 * the caller) → ra_activity_rows inserts with full provenance. Rows whose
 * index appears in `humanEditedIndexes` were corrected in review.
 */
export function extractionRowInserts(args: {
  rows: ImportRow[];
  documentLanguage: ImportExtraction["documentLanguage"];
  riskAnalysisId: string;
  importId: string;
  stepIdByKey: ReadonlyMap<string, string>;
  officialRowKeys: ReadonlySet<string>;
  humanEditedIndexes?: ReadonlySet<number>;
}): Database["public"]["Tables"]["ra_activity_rows"]["Insert"][] {
  const locale = importedTextLocale(args.documentLanguage);
  const positionBySection = new Map<string, number>();
  const inserts: Database["public"]["Tables"]["ra_activity_rows"]["Insert"][] = [];

  for (const [index, row] of args.rows.entries()) {
    const stepId = args.stepIdByKey.get(row.sectionKey);
    if (!stepId) continue;
    const position = positionBySection.get(row.sectionKey) ?? 0;
    positionBySection.set(row.sectionKey, position + 1);

    const activityKey = args.officialRowKeys.has(row.activityKey)
      ? row.activityKey
      : "custom";
    // a custom row's extracted label is content, not invention — keep it as prefix
    const whatYouDo =
      row.customName && row.whatYouDo
        ? `${row.customName}: ${row.whatYouDo}`
        : (row.whatYouDo ?? row.customName);

    inserts.push({
      risk_analysis_id: args.riskAnalysisId,
      process_step_id: stepId,
      position,
      activity_key: activityKey,
      // unreadable checkbox (null) maps to false — surfaced in the gap report,
      // resolved by the human in review, never guessed here
      applies: row.applies ?? false,
      is_critical: row.isCritical ?? false,
      what_you_do_i18n: cellJson(whatYouDo ?? null, locale),
      what_can_go_wrong_i18n: cellJson(row.whatCanGoWrong, locale),
      control_measures_i18n: cellJson(row.controlMeasures, locale),
      if_it_goes_wrong_i18n: cellJson(row.ifItGoesWrong, locale),
      ai_suggested: true, // AI-read content stays flagged until human review (§7.3)
      human_edited: args.humanEditedIndexes?.has(index) ?? false,
      source_import_id: args.importId,
      source_page: row.page,
      source_region: (row.region as Json) ?? null,
    });
  }
  return inserts;
}

/**
 * DB orchestration: creates the draft RA from a confirmed extraction and
 * generates control points for critical rows via the pack's activity-template
 * mapping (§7.5) plus the standing prerequisite programmes.
 */
export async function mapExtractionToDraft(
  supabase: Client,
  args: {
    siteId: string;
    importId: string;
    activityType: string;
    rows: ImportRow[];
    documentLanguage: ImportExtraction["documentLanguage"];
    pack: CompliancePack;
    packVersion: string;
    humanEditedIndexes?: ReadonlySet<number>;
  },
): Promise<{ riskAnalysisId: string }> {
  const { pack } = args;

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

  const stepInserts = pack.officialSkema.sections.map((section, i) => ({
    risk_analysis_id: ra.id,
    position: i,
    key: section.key,
    name_i18n: section.name as unknown as Json,
  }));
  const { data: steps, error: stepsError } = await supabase
    .from("process_steps")
    .insert(stepInserts)
    .select("id, key");
  if (stepsError || !steps) throw new Error(`steps: ${stepsError?.message}`);

  const officialRowKeys = new Set(
    pack.officialSkema.sections.flatMap((s) => s.rows.map((r) => r.key)),
  );
  const rowInserts = extractionRowInserts({
    rows: args.rows,
    documentLanguage: args.documentLanguage,
    riskAnalysisId: ra.id,
    importId: args.importId,
    stepIdByKey: new Map(steps.map((s) => [s.key, s.id])),
    officialRowKeys,
    humanEditedIndexes: args.humanEditedIndexes,
  });
  if (rowInserts.length > 0) {
    const { error } = await supabase.from("ra_activity_rows").insert(rowInserts);
    if (error) throw new Error(`rows: ${error.message}`);
  }

  // control points: pack templates matched by activityKey on critical applying
  // rows + standing prerequisites (cleaning, hygiene, pest, training)
  const template = pack.activityTemplates.find((t) => t.code === args.activityType);
  const cpKeys = new Set<string>(pack.prerequisiteControlPointKeys);
  for (const row of args.rows) {
    if (!(row.applies ?? false) || !(row.isCritical ?? false)) continue;
    for (const key of template?.rows[row.activityKey]?.controlPointKeys ?? []) {
      cpKeys.add(key);
    }
  }
  await insertControlPointsForKeys(supabase, {
    siteId: args.siteId,
    riskAnalysisId: ra.id,
    pack,
    keys: cpKeys,
  });

  await supabase
    .from("sites")
    .update({ pack_version_pinned: args.packVersion })
    .eq("id", args.siteId);

  return { riskAnalysisId: ra.id };
}
