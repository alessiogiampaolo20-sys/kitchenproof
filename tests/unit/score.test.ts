import { describe, expect, it } from "vitest";
import { computeComplianceScore, SCORE_WEIGHTS } from "@/lib/compliance/score";

const NOW = new Date("2026-07-19T12:00:00Z");

const PERFECT = {
  tasksDone30d: 100,
  tasksTotal30d: 100,
  openMajorDeviations: 0,
  avgResolutionHours: 10,
  programmeApprovedAt: "2026-07-01T00:00:00Z",
  unconfirmedInvoices: 0,
  missedLeftoverSessions7d: 0,
};

describe("computeComplianceScore (§11 [DEFAULT] weights)", () => {
  it("weights sum to 1", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it("a fully compliant site scores 100", () => {
    expect(computeComplianceScore(PERFECT, NOW).score).toBe(100);
  });

  it("a new site with no tasks/deviations but no programme loses only freshness", () => {
    const { score, components } = computeComplianceScore(
      { ...PERFECT, tasksTotal30d: 0, tasksDone30d: 0, avgResolutionHours: null, programmeApprovedAt: null },
      NOW,
    );
    expect(components.freshness).toBe(0);
    expect(score).toBe(90); // 100 − 10% freshness weight
  });

  it("open major deviations cost 5 points each (25% weight ÷ 5)", () => {
    const one = computeComplianceScore({ ...PERFECT, openMajorDeviations: 1 }, NOW);
    const five = computeComplianceScore({ ...PERFECT, openMajorDeviations: 5 }, NOW);
    expect(one.score).toBe(95);
    expect(five.score).toBe(75);
    // floor: more than five doesn't go below the component floor
    const ten = computeComplianceScore({ ...PERFECT, openMajorDeviations: 10 }, NOW);
    expect(ten.score).toBe(75);
  });

  it("completion rate scales its 40% share", () => {
    const half = computeComplianceScore(
      { ...PERFECT, tasksDone30d: 50, tasksTotal30d: 100 },
      NOW,
    );
    expect(half.score).toBe(80); // lost half of 40
  });

  it("slow resolution decays linearly between 24h and 7 days", () => {
    const fast = computeComplianceScore({ ...PERFECT, avgResolutionHours: 24 }, NOW);
    const slow = computeComplianceScore({ ...PERFECT, avgResolutionHours: 168 }, NOW);
    const mid = computeComplianceScore({ ...PERFECT, avgResolutionHours: 96 }, NOW);
    expect(fast.score).toBe(100);
    expect(slow.score).toBe(85); // full 15% lost
    expect(mid.components.resolutionTime).toBeCloseTo(0.5);
  });

  it("programme freshness decays after 6 months, zero at 18", () => {
    const fresh = computeComplianceScore(
      { ...PERFECT, programmeApprovedAt: "2026-02-01T00:00:00Z" },
      NOW,
    );
    expect(fresh.components.freshness).toBe(1);
    const stale = computeComplianceScore(
      { ...PERFECT, programmeApprovedAt: "2025-01-01T00:00:00Z" }, // ~18.6 months
      NOW,
    );
    expect(stale.components.freshness).toBe(0);
  });

  it("traceability hygiene: invoices + missed sessions share the 10%", () => {
    const messy = computeComplianceScore(
      { ...PERFECT, unconfirmedInvoices: 3, missedLeftoverSessions7d: 2 },
      NOW,
    );
    expect(messy.components.traceability).toBe(0);
    expect(messy.score).toBe(90);
  });
});
