import { describe, expect, it } from "vitest";
import {
  compareStrictness,
  evaluateTemp,
  formatLimit,
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
