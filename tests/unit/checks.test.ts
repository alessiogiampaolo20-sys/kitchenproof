import { describe, expect, it } from "vitest";
import {
  checklistValueSchema,
  describeValue,
  evaluateCheck,
  suggestSeverity,
} from "@/lib/compliance/checks";

const COLD = { max: 5, unit: "°C" };
const HOT = { min: 56, unit: "°C" };
const COOLING = { coolFrom: 56, coolTo: 10, withinMinutes: 240, unit: "°C" };

describe("evaluateCheck (§8.2, server-side pass/fail)", () => {
  it("temperature vs max/min limits", () => {
    expect(evaluateCheck(COLD, { temp_c: 3.4 })).toBe(true);
    expect(evaluateCheck(COLD, { temp_c: 6.5 })).toBe(false);
    expect(evaluateCheck(HOT, { temp_c: 62 })).toBe(true);
    expect(evaluateCheck(HOT, { temp_c: 50 })).toBe(false);
  });

  it("checklist: any fail → failed; N/A is not a fail", () => {
    expect(
      evaluateCheck(
        { checklist: true },
        {
          checklist: [
            { key: "a", label: "A", status: "ok" },
            { key: "b", label: "B", status: "na" },
          ],
        },
      ),
    ).toBe(true);
    expect(
      evaluateCheck(
        { checklist: true },
        { checklist: [{ key: "a", label: "A", status: "fail", reason: "dirty" }] },
      ),
    ).toBe(false);
  });

  it("cooling: within 4h to ≤10 °C passes; slow or warm fails", () => {
    const t0 = new Date("2026-07-15T12:00:00Z");
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000).toISOString();
    expect(
      evaluateCheck(COOLING, {
        cool_log: [
          { at: at(0), temp_c: 56 },
          { at: at(120), temp_c: 20 },
          { at: at(230), temp_c: 8 },
        ],
      }),
    ).toBe(true);
    expect(
      evaluateCheck(COOLING, {
        cool_log: [
          { at: at(0), temp_c: 56 },
          { at: at(250), temp_c: 8 }, // too slow
        ],
      }),
    ).toBe(false);
    expect(
      evaluateCheck(COOLING, {
        cool_log: [
          { at: at(0), temp_c: 56 },
          { at: at(200), temp_c: 14 }, // never reached 10
        ],
      }),
    ).toBe(false);
  });

  it("rejects mismatched value/limit shapes", () => {
    expect(() => evaluateCheck(COOLING, { temp_c: 4 })).toThrow();
    expect(() =>
      evaluateCheck(COLD, { cool_log: [{ at: new Date().toISOString(), temp_c: 5 }] }),
    ).toThrow();
  });
});

describe("suggestSeverity (§8.3 rules)", () => {
  it("fridge 6.5 °C (max 5) → minor; 12 °C → major; 20 °C → critical", () => {
    expect(suggestSeverity(COLD, { temp_c: 6.5 })).toBe("minor");
    expect(suggestSeverity(COLD, { temp_c: 12 })).toBe("major");
    expect(suggestSeverity(COLD, { temp_c: 20 })).toBe("critical");
  });

  it("hot holding 54 °C (min 56) → minor; 49 °C → major; 45 °C → critical", () => {
    expect(suggestSeverity(HOT, { temp_c: 54 })).toBe("minor");
    expect(suggestSeverity(HOT, { temp_c: 49 })).toBe("major");
    expect(suggestSeverity(HOT, { temp_c: 45 })).toBe("critical");
  });

  it("cooling failures: major, critical when still warm", () => {
    const t0 = new Date("2026-07-15T12:00:00Z").toISOString();
    const t5h = new Date("2026-07-15T17:00:00Z").toISOString();
    expect(
      suggestSeverity(COOLING, { cool_log: [{ at: t0, temp_c: 56 }, { at: t5h, temp_c: 12 }] }),
    ).toBe("major");
    expect(
      suggestSeverity(COOLING, { cool_log: [{ at: t0, temp_c: 56 }, { at: t5h, temp_c: 30 }] }),
    ).toBe("critical");
  });
});

describe("checklist schema (§8.2: every ✗ needs a reason)", () => {
  it("rejects fail without reason", () => {
    expect(
      checklistValueSchema.safeParse({
        checklist: [{ key: "a", label: "A", status: "fail" }],
      }).success,
    ).toBe(false);
    expect(
      checklistValueSchema.safeParse({
        checklist: [{ key: "a", label: "A", status: "fail", reason: "dirty" }],
      }).success,
    ).toBe(true);
  });
});

describe("describeValue", () => {
  it("summarizes values for deviation descriptions", () => {
    expect(describeValue({ temp_c: 6.5 })).toBe("6.5 °C");
    expect(
      describeValue({
        checklist: [{ key: "a", label: "Køl", status: "fail", reason: "Ikke rent" }],
      }),
    ).toContain("Køl");
  });
});
