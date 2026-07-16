import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import rawPack from "../../supabase/seed/dk-pack.json";
import { parsePack } from "@/lib/compliance/pack-schema";
import {
  clampTighterLimits,
  validateDraftCompleteness,
} from "@/lib/ai/runners/wizard";
import { draftSectionSchema, wizardTurnSchema, type DraftSection } from "@/lib/ai/schemas";

const pack = parsePack(rawPack);

function loadDraftFixture(section: string): DraftSection {
  const raw = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "fixtures/ai/wizard_draft", `draft-${section}.json`),
      "utf8",
    ),
  );
  return draftSectionSchema.parse(raw);
}

const SECTION_KEYS = [
  "modtagelse",
  "opbevaring",
  "tilberedning",
  "salg_servering",
  "transport",
  "andet",
] as const;

describe("clampTighterLimits (§7.3 [DECISION]: AI may only tighten)", () => {
  it("accepts a strictly tighter max", () => {
    const { accepted, rejected } = clampTighterLimits(pack, [
      { templateKey: "cold_storage_temp", max: 4, min: null, reason_da: "margin" },
    ]);
    expect(accepted.get("cold_storage_temp")).toEqual({ max: 4, unit: "°C" });
    expect(rejected).toEqual([]);
  });

  it("rejects a looser max (above the pack default)", () => {
    const { accepted, rejected } = clampTighterLimits(pack, [
      { templateKey: "cold_storage_temp", max: 8, min: null, reason_da: "easier" },
    ]);
    expect(accepted.size).toBe(0);
    expect(rejected[0]).toContain("not tighter");
  });

  it("rejects an equal limit (not strictly tighter)", () => {
    const { accepted } = clampTighterLimits(pack, [
      { templateKey: "cold_storage_temp", max: 5, min: null, reason_da: "same" },
    ]);
    expect(accepted.size).toBe(0);
  });

  it("rejects a looser min (below the pack default)", () => {
    const { accepted, rejected } = clampTighterLimits(pack, [
      { templateKey: "hot_holding_56", max: null, min: 50, reason_da: "easier" },
    ]);
    expect(accepted.size).toBe(0);
    expect(rejected[0]).toContain("not tighter");
  });

  it("accepts a tighter min (above the pack default)", () => {
    const { accepted } = clampTighterLimits(pack, [
      { templateKey: "hot_holding_56", max: null, min: 60, reason_da: "margin" },
    ]);
    expect(accepted.get("hot_holding_56")).toEqual({ min: 60, unit: "°C" });
  });

  it("rejects unknown templates and shape mismatches", () => {
    const { accepted, rejected } = clampTighterLimits(pack, [
      { templateKey: "no_such_cp", max: 1, min: null, reason_da: "x" },
      // cooling_56_10_4h is a cooling-curve limit — a bare max cannot replace it
      { templateKey: "cooling_56_10_4h", max: 2, min: null, reason_da: "x" },
    ]);
    expect(accepted.size).toBe(0);
    expect(rejected).toHaveLength(2);
  });
});

describe("validateDraftCompleteness (§7.3 validator)", () => {
  const fixtures = SECTION_KEYS.map(loadDraftFixture);

  it("passes the pizzeria fixture set", () => {
    expect(validateDraftCompleteness(fixtures)).toEqual([]);
  });

  it("flags a missing section", () => {
    const problems = validateDraftCompleteness(fixtures.slice(0, 5));
    expect(problems).toContain("missing section andet");
  });

  it("flags an applying row without hazards or an explicit reason", () => {
    const broken = structuredClone(fixtures);
    const row = broken[0]!.rows.find((r) => r.applies)!;
    row.hazards = [];
    row.notRelevantBecause_da = null;
    expect(
      validateDraftCompleteness(broken).some((p) => p.includes("no hazards")),
    ).toBe(true);
  });

  it("flags a critical row without a control point", () => {
    const broken = structuredClone(fixtures);
    const row = broken[1]!.rows.find((r) => r.critical)!;
    row.controlPointKeys = [];
    expect(
      validateDraftCompleteness(broken).some((p) =>
        p.includes("critical without control point"),
      ),
    ).toBe(true);
  });
});

describe("wizard fixtures (scripted pizzeria interview)", () => {
  it("every interview turn fixture satisfies the turn schema", () => {
    const dir = resolve(process.cwd(), "fixtures/ai/risk_wizard");
    const files = readdirSync(dir).filter((f) => f.startsWith("turn-"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
      expect(() => wizardTurnSchema.parse(raw), file).not.toThrow();
    }
    // the interview terminates
    const last = JSON.parse(readFileSync(resolve(dir, "turn-5.json"), "utf8"));
    expect(last.done).toBe(true);
    expect(last.summary_da).toBeTruthy();
  });

  it("draft fixtures reference only pack row keys and CP templates", () => {
    const rowKeys = new Set(
      pack.officialSkema.sections.flatMap((s) => s.rows.map((r) => r.key)),
    );
    const cpKeys = new Set(pack.controlPointTemplates.map((t) => t.key));
    for (const key of SECTION_KEYS) {
      const section = loadDraftFixture(key);
      for (const row of section.rows) {
        expect(
          row.activityKey === "custom" || rowKeys.has(row.activityKey),
          row.activityKey,
        ).toBe(true);
        for (const cp of row.controlPointKeys) {
          expect(cpKeys.has(cp), cp).toBe(true);
        }
      }
    }
  });

  it("the fixture's deliberate loosening (hot_holding min 50) is clamped", () => {
    const proposals = SECTION_KEYS.flatMap((k) => loadDraftFixture(k).tighterLimits);
    const { accepted, rejected } = clampTighterLimits(pack, proposals);
    // tighter cold-storage proposal accepted, looser hot-holding rejected
    expect(accepted.get("cold_storage_temp")).toEqual({ max: 4, unit: "°C" });
    expect(accepted.has("hot_holding_56")).toBe(false);
    expect(rejected.some((r) => r.startsWith("hot_holding_56"))).toBe(true);
  });
});
