import { describe, expect, it } from "vitest";
import { computeOnboarding, type OnboardingFacts } from "@/lib/onboarding/steps";

const empty: OnboardingFacts = {
  programmeApproved: false,
  equipmentCount: 0,
  hasManagerPin: false,
  productCount: 0,
  batchCount: 0,
  documentCount: 0,
};

describe("computeOnboarding", () => {
  it("marks everything open for a brand-new site", () => {
    const state = computeOnboarding(empty);
    expect(state.doneCount).toBe(0);
    expect(state.totalCount).toBe(6);
    expect(state.complete).toBe(false);
    expect(state.steps.every((step) => !step.done)).toBe(true);
  });

  it("counts only the basics as required", () => {
    expect(computeOnboarding(empty).requiredRemaining).toBe(3);
    const basicsDone = computeOnboarding({
      ...empty,
      programmeApproved: true,
      equipmentCount: 2,
      hasManagerPin: true,
    });
    expect(basicsDone.requiredRemaining).toBe(0);
    // taking over the existing situation is still outstanding
    expect(basicsDone.complete).toBe(false);
    expect(basicsDone.doneCount).toBe(3);
  });

  it("offers import and wizard as two ways to get a programme", () => {
    const programme = computeOnboarding(empty).steps.find((s) => s.key === "programme");
    expect(programme?.path).toBe("/programme/import");
    expect(programme?.altPath).toBe("/programme/wizard");
  });

  it("completes once the existing business's data is carried over", () => {
    const state = computeOnboarding({
      programmeApproved: true,
      equipmentCount: 3,
      hasManagerPin: true,
      productCount: 12,
      batchCount: 4,
      documentCount: 1,
    });
    expect(state.complete).toBe(true);
    expect(state.requiredRemaining).toBe(0);
    expect(state.doneCount).toBe(state.totalCount);
  });

  it("keeps a draft programme open — only an approved one counts", () => {
    const state = computeOnboarding({ ...empty, programmeApproved: false, equipmentCount: 1 });
    expect(state.steps.find((s) => s.key === "programme")?.done).toBe(false);
    expect(state.requiredRemaining).toBe(2);
  });
});
