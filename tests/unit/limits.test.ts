import { describe, expect, it } from "vitest";
import {
  compareStrictness,
  evaluateTemp,
  evaluateTempReading,
  formatLimit,
  limitMeasurementKind,
} from "@/lib/compliance/limits";
import { findUncoveredCriticalRows } from "@/lib/compliance/approval";
import { parsePack } from "@/lib/compliance/pack-schema";
import rawPack from "../../supabase/seed/dk-pack.json";

describe("compareStrictness (§7.3 guardrail core)", () => {
  const cold = { max: 5, unit: "°C" } as const;
  const hot = { min: 56, unit: "°C" } as const;
  const cooling = { coolFrom: 56, coolTo: 10, withinMinutes: 240, unit: "°C" } as const;

  it("max limits: lower = tighter, higher = looser", () => {
    expect(compareStrictness(cold, { max: 4, unit: "°C" })).toBe("tighter");
    expect(compareStrictness(cold, { max: 8, unit: "°C" })).toBe("looser");
    expect(compareStrictness(cold, { max: 5, unit: "°C" })).toBe("equal");
  });

  it("min limits: higher = tighter, lower = looser", () => {
    expect(compareStrictness(hot, { min: 60, unit: "°C" })).toBe("tighter");
    expect(compareStrictness(hot, { min: 50, unit: "°C" })).toBe("looser");
  });

  it("cooling: any relaxed component = looser", () => {
    expect(
      compareStrictness(cooling, { coolFrom: 56, coolTo: 10, withinMinutes: 300, unit: "°C" }),
    ).toBe("looser");
    expect(
      compareStrictness(cooling, { coolFrom: 56, coolTo: 12, withinMinutes: 240, unit: "°C" }),
    ).toBe("looser");
    expect(
      compareStrictness(cooling, { coolFrom: 56, coolTo: 10, withinMinutes: 180, unit: "°C" }),
    ).toBe("tighter");
  });

  it("mismatched shapes are incomparable", () => {
    expect(compareStrictness(cold, hot)).toBe("incomparable");
  });
});

describe("evaluateTemp", () => {
  it("evaluates max and min limits", () => {
    expect(evaluateTemp({ max: 5, unit: "°C" }, 3.4)).toBe(true);
    expect(evaluateTemp({ max: 5, unit: "°C" }, 6.5)).toBe(false);
    expect(evaluateTemp({ min: 75, unit: "°C" }, 80)).toBe(true);
    expect(evaluateTemp({ min: 75, unit: "°C" }, 70)).toBe(false);
  });
});

describe("formatLimit", () => {
  it("formats all limit shapes", () => {
    expect(formatLimit({ max: 5, unit: "°C" })).toBe("≤ 5 °C");
    expect(formatLimit({ min: 56, unit: "°C" })).toBe("≥ 56 °C");
    expect(formatLimit({ coolFrom: 56, coolTo: 10, withinMinutes: 240, unit: "°C" })).toBe(
      "56→10 °C / 240 min",
    );
    expect(formatLimit({ checklist: true })).toBe("✓");
  });
});

describe("findUncoveredCriticalRows (§3.3.1 approval validator)", () => {
  const pack = parsePack(rawPack);
  const restaurant = pack.activityTemplates.find((t) => t.code === "restaurant");

  const rows = [
    { activity_key: "opbevaring.chilled", applies: true, is_critical: true },
    { activity_key: "tilberedning.hot_prep", applies: true, is_critical: true },
    { activity_key: "opbevaring.ambient", applies: true, is_critical: false },
  ];

  it("passes when critical rows are covered", () => {
    const active = new Set<string | null>(["cold_storage_temp", "heating_core_temp"]);
    expect(findUncoveredCriticalRows(rows, active, restaurant)).toEqual([]);
  });

  it("flags critical rows whose control points are missing/inactive", () => {
    const active = new Set<string | null>(["cold_storage_temp"]);
    expect(findUncoveredCriticalRows(rows, active, restaurant)).toEqual([
      "tilberedning.hot_prep",
    ]);
  });
});

describe("product vs ambient temperature (DK-HYGIEJNE kap. 26.2)", () => {
  const ambientFridge = { max: 5, unit: "°C" as const, measurementKind: "ambient" as const };
  const productCore = { min: 75, unit: "°C" as const, measurementKind: "product" as const };
  const unannotated = { max: 5, unit: "°C" as const };

  it("judges a reading of the kind the limit is written about", () => {
    expect(evaluateTempReading(ambientFridge, 4, "ambient")).toEqual({ verdict: "pass" });
    expect(evaluateTempReading(ambientFridge, 8, "ambient")).toEqual({ verdict: "fail" });
    expect(evaluateTempReading(productCore, 80, "product")).toEqual({ verdict: "pass" });
    expect(evaluateTempReading(productCore, 70, "product")).toEqual({ verdict: "fail" });
  });

  it("refuses to judge when the operator did not say which kind it is", () => {
    const verdict = evaluateTempReading(ambientFridge, 4, null);
    expect(verdict).toEqual({
      verdict: "unevaluable",
      reason: "kind_unknown",
      expected: "ambient",
      got: null,
    });
  });

  it("refuses to judge a core reading against an ambient limit", () => {
    // 4 °C in the food would "pass" an air limit — and that is exactly the
    // wrong verdict this guards against, in both directions
    expect(evaluateTempReading(ambientFridge, 4, "product")).toEqual({
      verdict: "unevaluable",
      reason: "kind_mismatch",
      expected: "ambient",
      got: "product",
    });
    expect(evaluateTempReading(productCore, 80, "ambient")).toEqual({
      verdict: "unevaluable",
      reason: "kind_mismatch",
      expected: "product",
      got: "ambient",
    });
  });

  it("still judges limits written before the distinction existed", () => {
    expect(evaluateTempReading(unannotated, 4, null)).toEqual({ verdict: "pass" });
    expect(evaluateTempReading(unannotated, 9, "ambient")).toEqual({ verdict: "fail" });
  });

  it("reports the kind a limit expresses", () => {
    expect(limitMeasurementKind(ambientFridge)).toBe("ambient");
    expect(limitMeasurementKind(productCore)).toBe("product");
    expect(limitMeasurementKind(unannotated)).toBeNull();
    expect(limitMeasurementKind({ checklist: true })).toBeNull();
  });
});

describe("the kind survives an edit (regression)", () => {
  // A manager editing a threshold — or just the schedule — used to get a limit
  // rebuilt from the form fields alone, silently dropping measurementKind and
  // turning an evaluable limit back into an ambiguous one.
  const packDefault = { max: 5, unit: "°C" as const, measurementKind: "ambient" as const };

  it("a tightened value keeps saying what it is about", () => {
    const edited = { max: 4, unit: "°C" as const, measurementKind: "ambient" as const };
    expect(limitMeasurementKind(edited)).toBe("ambient");
    expect(compareStrictness(packDefault, edited)).toBe("tighter");
    expect(evaluateTempReading(edited, 3, "ambient")).toEqual({ verdict: "pass" });
  });

  it("a limit that lost its kind can no longer be judged from a plain reading", () => {
    const stripped = { max: 4, unit: "°C" as const };
    // still comparable for the §7.3 guardrail…
    expect(compareStrictness(packDefault, stripped)).toBe("tighter");
    // …but the record's kind is now unconstrained, which is what we prevent
    expect(limitMeasurementKind(stripped)).toBeNull();
  });
});
