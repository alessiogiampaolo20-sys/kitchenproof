// Getting-started state for a site. Pure: the page feeds it counts, it decides
// what is still missing. Two groups — the basics that make records valid, and
// taking over an existing business's current situation (§7.5 import, opening
// stock, existing documents) so nobody has to start from an empty kitchen.

export type OnboardingKey =
  | "programme"
  | "equipment"
  | "pins"
  | "catalog"
  | "stock"
  | "documents";

export type OnboardingFacts = {
  programmeApproved: boolean;
  equipmentCount: number;
  hasManagerPin: boolean;
  productCount: number;
  batchCount: number;
  documentCount: number;
};

export type OnboardingStep = {
  key: OnboardingKey;
  done: boolean;
  /** Basics block records from being valid; the rest carries history over. */
  required: boolean;
  /** Path under /app/<siteId>, or an absolute path when it leaves the site. */
  path: string;
  /** Second way to complete the same step (e.g. import vs build from scratch). */
  altPath?: string;
};

export type OnboardingState = {
  steps: OnboardingStep[];
  doneCount: number;
  totalCount: number;
  /** Basics still missing — the app nags only while this is > 0. */
  requiredRemaining: number;
  complete: boolean;
};

export function computeOnboarding(facts: OnboardingFacts): OnboardingState {
  const steps: OnboardingStep[] = [
    {
      key: "programme",
      done: facts.programmeApproved,
      required: true,
      path: "/programme/import",
      altPath: "/programme/wizard",
    },
    {
      key: "equipment",
      done: facts.equipmentCount > 0,
      required: true,
      path: "/equipment",
    },
    {
      key: "pins",
      done: facts.hasManagerPin,
      required: true,
      path: "/org/members",
    },
    {
      key: "catalog",
      done: facts.productCount > 0,
      required: false,
      path: "/receive",
      altPath: "/stock/products",
    },
    {
      key: "stock",
      done: facts.batchCount > 0,
      required: false,
      path: "/receive/quick",
    },
    {
      key: "documents",
      done: facts.documentCount > 0,
      required: false,
      path: "/inspection",
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  const requiredRemaining = steps.filter((s) => s.required && !s.done).length;

  return {
    steps,
    doneCount,
    totalCount: steps.length,
    requiredRemaining,
    complete: doneCount === steps.length,
  };
}
