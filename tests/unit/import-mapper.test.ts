import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import rawPack from "../../supabase/seed/dk-pack.json";
import { parsePack } from "@/lib/compliance/pack-schema";
import {
  buildGapReport,
  extractionRowInserts,
  gapCount,
} from "@/lib/compliance/import-mapper";
import { importExtractionSchema, type ImportExtraction } from "@/lib/ai/schemas";

const pack = parsePack(rawPack);
const officialRowKeys = new Set(
  pack.officialSkema.sections.flatMap((s) => s.rows.map((r) => r.key)),
);
const stepIdByKey = new Map(
  pack.officialSkema.sections.map((s) => [s.key, `step-${s.key}`]),
);

function loadFixture(name: string): ImportExtraction {
  const raw = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "fixtures/ai/ra_import_extract", `${name}.json`),
      "utf8",
    ),
  );
  return importExtractionSchema.parse(raw);
}

describe("import fixtures (§7.5 DoD set)", () => {
  it("all three fixtures satisfy the extraction schema", () => {
    expect(loadFixture("official-skema-filled").looksLikeOfficialSkema).toBe(true);
    expect(loadFixture("consultant-word").looksLikeOfficialSkema).toBe(false);
    expect(loadFixture("paper-skema-page1").documentLanguage).toBe("mixed");
  });
});

describe("buildGapReport (§7.5 gap analysis)", () => {
  it("official PDF: empty corrective cell on a critical row is a gap", () => {
    const report = buildGapReport(loadFixture("official-skema-filled"), pack, "restaurant");
    expect(report.emptyCriticalCells).toEqual([
      {
        sectionKey: "modtagelse",
        activityKey: "modtagelse.frozen",
        fields: ["ifItGoesWrong"],
      },
    ]);
    expect(report.missingSections).toEqual([]);
    expect(report.lowConfidenceRows).toEqual([]);
  });

  it("consultant DOCX: missing expected section + empty critical control column", () => {
    const report = buildGapReport(loadFixture("consultant-word"), pack, "restaurant");
    // restaurant template expects salg_servering rows; the Word file has none
    expect(report.missingSections).toContain("salg_servering");
    expect(
      report.emptyCriticalCells.some(
        (g) =>
          g.activityKey === "tilberedning.hot_holding" &&
          g.fields.includes("controlMeasures"),
      ),
    ).toBe(true);
    expect(report.unreadableNotes).toHaveLength(1);
  });

  it("paper photos: low-confidence handwriting + unreadable checkbox flagged", () => {
    const report = buildGapReport(loadFixture("paper-skema-page1"), pack, "restaurant");
    expect(report.lowConfidenceRows.length).toBeGreaterThanOrEqual(2);
    expect(report.unreadableCheckboxes).toContainEqual({
      sectionKey: "opbevaring",
      activityKey: "opbevaring.chilled",
      field: "applies",
    });
    expect(gapCount(report)).toBeGreaterThan(0);
  });
});

describe("extractionRowInserts (§7.5 [DECISION]: never invents)", () => {
  const extraction = loadFixture("official-skema-filled");
  const inserts = extractionRowInserts({
    rows: extraction.rows,
    documentLanguage: extraction.documentLanguage,
    riskAnalysisId: "ra-1",
    importId: "imp-1",
    stepIdByKey,
    officialRowKeys,
  });

  it("empty cells stay empty — null i18n, no fabricated text", () => {
    const frozen = inserts.find((i) => i.activity_key === "modtagelse.frozen")!;
    expect(frozen.if_it_goes_wrong_i18n).toBeNull(); // empty in the original
    expect(frozen.control_measures_i18n).toEqual({
      da: "Varerne tjekkes for hårdfrossenhed.",
    });
    const chilledFrozenRow = inserts.find((i) => i.activity_key === "opbevaring.frozen")!;
    expect(chilledFrozenRow.what_can_go_wrong_i18n).toBeNull();
  });

  it("text is stored verbatim under the detected language only", () => {
    const chilled = inserts.find((i) => i.activity_key === "modtagelse.chilled")!;
    expect(chilled.what_you_do_i18n).toEqual({
      da: "Kølevarer leveres mandag og torsdag fra Dansk Cater.",
    });
    // never auto-translated into the other locale
    expect(
      (chilled.what_you_do_i18n as Record<string, string>).en,
    ).toBeUndefined();
  });

  it("every imported cell keeps provenance (import id, page, region)", () => {
    for (const insert of inserts) {
      expect(insert.source_import_id).toBe("imp-1");
      expect(insert.source_page).toBeGreaterThanOrEqual(1);
    }
    const chilled = inserts.find((i) => i.activity_key === "modtagelse.chilled")!;
    expect(chilled.source_region).toEqual({ x: 40, y: 120, w: 500, h: 60 });
  });

  it("rows are flagged ai_suggested until human review; corrections marked", () => {
    expect(inserts.every((i) => i.ai_suggested === true)).toBe(true);
    const withEdits = extractionRowInserts({
      rows: extraction.rows,
      documentLanguage: extraction.documentLanguage,
      riskAnalysisId: "ra-1",
      importId: "imp-1",
      stepIdByKey,
      officialRowKeys,
      humanEditedIndexes: new Set([0]),
    });
    expect(withEdits[0]!.human_edited).toBe(true);
    expect(withEdits[1]!.human_edited).toBe(false);
  });

  it("unreadable checkboxes map to false (resolved in review, never guessed)", () => {
    const paper = loadFixture("paper-skema-page1");
    const paperInserts = extractionRowInserts({
      rows: paper.rows,
      documentLanguage: paper.documentLanguage,
      riskAnalysisId: "ra-1",
      importId: "imp-2",
      stepIdByKey,
      officialRowKeys,
    });
    const unreadable = paperInserts.find((i) => i.activity_key === "opbevaring.chilled")!;
    expect(unreadable.applies).toBe(false);
  });

  it("unknown activity keys coerce to custom, keeping the extracted label", () => {
    const consultant = loadFixture("consultant-word");
    const consultantInserts = extractionRowInserts({
      rows: consultant.rows,
      documentLanguage: consultant.documentLanguage,
      riskAnalysisId: "ra-1",
      importId: "imp-3",
      stepIdByKey,
      officialRowKeys,
    });
    const custom = consultantInserts.find((i) => i.activity_key === "custom")!;
    expect(custom.what_you_do_i18n).toEqual({
      da: "Returvarer: Returvarer registreres i kladdehæfte.",
    });
  });

  it("English documents key text under en", () => {
    const inserts2 = extractionRowInserts({
      rows: [
        {
          sectionKey: "modtagelse",
          activityKey: "modtagelse.chilled",
          customName: null,
          applies: true,
          isCritical: false,
          whatYouDo: "Chilled goods twice a week.",
          whatCanGoWrong: null,
          controlMeasures: null,
          ifItGoesWrong: null,
          confidence: 0.9,
          page: 1,
          region: null,
        },
      ],
      documentLanguage: "en",
      riskAnalysisId: "ra-1",
      importId: "imp-4",
      stepIdByKey,
      officialRowKeys,
    });
    expect(inserts2[0]!.what_you_do_i18n).toEqual({ en: "Chilled goods twice a week." });
  });
});
