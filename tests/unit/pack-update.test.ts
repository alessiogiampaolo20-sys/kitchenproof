import { describe, expect, it } from "vitest";
import rawPack from "../../supabase/seed/dk-pack.json";
import { parsePack, type CompliancePack } from "@/lib/compliance/pack-schema";
import { computePackDiff } from "@/lib/compliance/pack-update";

const base = parsePack(rawPack);

function withTemplates(
  mutate: (templates: CompliancePack["controlPointTemplates"]) => CompliancePack["controlPointTemplates"],
): CompliancePack {
  const clone = structuredClone(base);
  clone.controlPointTemplates = mutate(structuredClone(base.controlPointTemplates));
  return clone;
}

describe("computePackDiff (§13 regulation change pipeline)", () => {
  it("identical packs produce no diff", () => {
    expect(computePackDiff(base, base)).toEqual([]);
  });

  it("detects a limit change with before/after values", () => {
    const next = withTemplates((templates) =>
      templates.map((tpl) =>
        tpl.key === "hot_holding_56"
          ? {
              ...tpl,
              // tightening the threshold, keeping what the number is about
              defaultLimit: {
                min: 58,
                unit: "°C" as const,
                measurementKind: "product" as const,
              },
            }
          : tpl,
      ),
    );
    const diff = computePackDiff(base, next);
    expect(diff).toEqual([
      {
        key: "hot_holding_56",
        kind: "limit_changed",
        before: { min: 56, unit: "°C", measurementKind: "product" },
        after: { min: 58, unit: "°C", measurementKind: "product" },
      },
    ]);
  });

  it("detects frequency changes independently of limits", () => {
    const next = withTemplates((templates) =>
      templates.map((tpl) =>
        tpl.key === "cold_storage_temp"
          ? {
              ...tpl,
              defaultFrequency: {
                rrule: "FREQ=DAILY",
                times: ["08:00", "16:00"],
                dueWindowMinutes: 120,
              },
            }
          : tpl,
      ),
    );
    const diff = computePackDiff(base, next);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ key: "cold_storage_temp", kind: "frequency_changed" });
  });

  it("detects added and removed templates", () => {
    const added = withTemplates((templates) => [
      ...templates,
      { ...templates[0]!, key: "brand_new_requirement" },
    ]);
    expect(computePackDiff(base, added)).toEqual([
      expect.objectContaining({ key: "brand_new_requirement", kind: "template_added" }),
    ]);
    const removed = withTemplates((templates) =>
      templates.filter((tpl) => tpl.key !== "pest_control"),
    );
    expect(computePackDiff(base, removed)).toEqual([
      expect.objectContaining({ key: "pest_control", kind: "template_removed" }),
    ]);
  });

  it("a combined change reports every item once", () => {
    const next = withTemplates((templates) =>
      templates
        .filter((tpl) => tpl.key !== "training_egenkontrol")
        .map((tpl) =>
          tpl.key === "freezer_temp"
            ? { ...tpl, defaultLimit: { max: -20, unit: "°C" as const } }
            : tpl,
        ),
    );
    const diff = computePackDiff(base, next);
    const kinds = diff.map((item) => `${item.key}:${item.kind}`).sort();
    expect(kinds).toEqual([
      "freezer_temp:limit_changed",
      "training_egenkontrol:template_removed",
    ]);
  });
});
