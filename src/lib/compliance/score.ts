// §11 Compliance Score (0–100). Weights are [DEFAULT] config — adjustable,
// changes logged in the CLAUDE.md decision log.
export const SCORE_WEIGHTS = {
  completion: 0.4,      // task completion rate (30 days)
  openMajor: 0.25,      // open major/critical deviations
  resolutionTime: 0.15, // deviation resolution speed
  freshness: 0.1,       // programme approval age
  traceability: 0.1,    // unconfirmed invoices + missed leftover sessions
} as const;

export type ScoreInputs = {
  tasksDone30d: number;
  tasksTotal30d: number;
  openMajorDeviations: number;
  /** avg hours detected→corrected over the last 90d; null = no deviations */
  avgResolutionHours: number | null;
  programmeApprovedAt: string | null; // ISO — null = no approved programme
  unconfirmedInvoices: number;
  missedLeftoverSessions7d: number;
};

export type ScoreBreakdown = {
  score: number; // 0–100
  components: Record<keyof typeof SCORE_WEIGHTS, number>; // each 0–1
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function computeComplianceScore(
  inputs: ScoreInputs,
  now: Date = new Date(),
): ScoreBreakdown {
  const completion =
    inputs.tasksTotal30d === 0 ? 1 : clamp01(inputs.tasksDone30d / inputs.tasksTotal30d);

  // each open major deviation costs 20%, floor at 0
  const openMajor = clamp01(1 - inputs.openMajorDeviations / 5);

  // ≤24h = perfect; linearly down to 0 at 7 days
  const resolutionTime =
    inputs.avgResolutionHours === null
      ? 1
      : inputs.avgResolutionHours <= 24
        ? 1
        : clamp01(1 - (inputs.avgResolutionHours - 24) / (168 - 24));

  // fresh ≤180 days; linearly stale to 0 at 540 days; none = 0
  let freshness = 0;
  if (inputs.programmeApprovedAt) {
    const ageDays =
      (now.getTime() - new Date(inputs.programmeApprovedAt).getTime()) / 86_400_000;
    freshness = ageDays <= 180 ? 1 : clamp01(1 - (ageDays - 180) / 360);
  }

  const traceability = clamp01(
    1 - (inputs.unconfirmedInvoices + inputs.missedLeftoverSessions7d) / 5,
  );

  const components = { completion, openMajor, resolutionTime, freshness, traceability };
  const score = Math.round(
    100 *
      (SCORE_WEIGHTS.completion * completion +
        SCORE_WEIGHTS.openMajor * openMajor +
        SCORE_WEIGHTS.resolutionTime * resolutionTime +
        SCORE_WEIGHTS.freshness * freshness +
        SCORE_WEIGHTS.traceability * traceability),
  );
  return { score, components };
}
