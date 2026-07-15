import { describe, expect, it } from "vitest";
import rawPack from "../../supabase/seed/dk-pack.json";
import {
  parsePack,
  packSchema,
  validatePack,
  type CompliancePack,
} from "@/lib/compliance/pack-schema";

function clone(): CompliancePack {
  return JSON.parse(JSON.stringify(rawPack)) as CompliancePack;
}

describe("DK pack v1 (§3.2/§3.3)", () => {
  it("parses and cross-validates", () => {
    expect(() => parsePack(rawPack)).not.toThrow();
  });

  it("every control point template carries a corpus sourceRef (§3.3 rule a)", () => {
    const pack = parsePack(rawPack);
    for (const tpl of pack.controlPointTemplates) {
      expect(tpl.sourceRef.docId, tpl.key).toBeTruthy();
      expect(tpl.sourceRef.page, tpl.key).toBeGreaterThan(0);
    }
  });

  it("every guidance entry carries a corpus sourceRef", () => {
    const pack = parsePack(rawPack);
    for (const g of pack.guidance) {
      expect(g.sourceRef.docId, g.key).toBeTruthy();
    }
  });

  it("hazards without sourceRef are explicit TODO(pack-review) markers", () => {
    const pack = parsePack(rawPack);
    for (const h of pack.hazardLibrary) {
      expect(h.sourceRef !== undefined || h.todo !== undefined, h.key).toBe(true);
    }
  });

  it("covers all 12 §2 activity types with the 6 official skema sections", () => {
    const pack = parsePack(rawPack);
    expect(pack.activityTemplates).toHaveLength(12);
    expect(pack.officialSkema.sections.map((s) => s.key)).toEqual([
      "modtagelse",
      "opbevaring",
      "tilberedning",
      "salg_servering",
      "transport",
      "andet",
    ]);
  });

  it("encodes the verified 2025 limits (56/56/4h, 75, 5, -18)", () => {
    const pack = parsePack(rawPack);
    const byKey = Object.fromEntries(
      pack.controlPointTemplates.map((t) => [t.key, t.defaultLimit]),
    );
    expect(byKey.cold_storage_temp).toMatchObject({ max: 5 });
    expect(byKey.freezer_temp).toMatchObject({ max: -18 });
    expect(byKey.heating_core_temp).toMatchObject({ min: 75 });
    expect(byKey.hot_holding_56).toMatchObject({ min: 56 });
    expect(byKey.cooling_56_10_4h).toMatchObject({
      coolFrom: 56,
      coolTo: 10,
      withinMinutes: 240,
    });
  });

  it("rejects a template with the sourceRef stripped (fail-closed)", () => {
    const broken = clone();
    // @ts-expect-error — intentional corruption
    delete broken.controlPointTemplates[0].sourceRef;
    expect(packSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a critical row without a monitoring control point (§3.3.1)", () => {
    const broken = clone();
    const restaurant = broken.activityTemplates.find((t) => t.code === "restaurant")!;
    restaurant.rows["opbevaring.chilled"]!.controlPointKeys = [];
    const parsed = packSchema.parse(broken);
    const errors = validatePack(parsed);
    expect(errors.some((e) => e.includes("critical row without"))).toBe(true);
  });

  it("rejects unknown control point references", () => {
    const broken = clone();
    const restaurant = broken.activityTemplates.find((t) => t.code === "restaurant")!;
    restaurant.rows["opbevaring.chilled"]!.controlPointKeys = ["does_not_exist"];
    const parsed = packSchema.parse(broken);
    const errors = validatePack(parsed);
    expect(errors.some((e) => e.includes("unknown control point"))).toBe(true);
  });
});
