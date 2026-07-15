import { limitSchema, type PackLimit } from "./pack-schema";

/**
 * Limit evaluator (§19 compliance lib). Two jobs:
 *  - evaluate a measured value against a limit (Phase 2 check flows)
 *  - compare strictness of a proposed limit vs the pack default — the §7.3
 *    guardrail: loosening requires justification + site_manager role, and AI
 *    may never loosen at all.
 */

export type Strictness = "tighter" | "equal" | "looser" | "incomparable";

export function parseLimit(raw: unknown): PackLimit {
  return limitSchema.parse(raw);
}

export function evaluateTemp(limit: PackLimit, valueC: number): boolean {
  if ("max" in limit) return valueC <= limit.max;
  if ("min" in limit) return valueC >= limit.min;
  throw new Error("limit is not a single-temperature limit");
}

export function compareStrictness(
  packDefault: PackLimit,
  proposed: PackLimit,
): Strictness {
  // max limits (cold storage): lower max = tighter
  if ("max" in packDefault && "max" in proposed) {
    if (proposed.max < packDefault.max) return "tighter";
    if (proposed.max > packDefault.max) return "looser";
    return "equal";
  }
  // min limits (heating / hot holding): higher min = tighter
  if ("min" in packDefault && "min" in proposed) {
    if (proposed.min > packDefault.min) return "tighter";
    if (proposed.min < packDefault.min) return "looser";
    return "equal";
  }
  // cooling: any component relaxed = looser; all tightened/equal (≥1 tighter) = tighter
  if ("coolFrom" in packDefault && "coolFrom" in proposed) {
    const looser =
      proposed.withinMinutes > packDefault.withinMinutes ||
      proposed.coolTo > packDefault.coolTo ||
      proposed.coolFrom < packDefault.coolFrom;
    if (looser) return "looser";
    const tighter =
      proposed.withinMinutes < packDefault.withinMinutes ||
      proposed.coolTo < packDefault.coolTo ||
      proposed.coolFrom > packDefault.coolFrom;
    return tighter ? "tighter" : "equal";
  }
  if ("checklist" in packDefault && "checklist" in proposed) return "equal";
  return "incomparable";
}

/** Human-readable limit label, e.g. "≤ 5 °C", "≥ 75 °C", "56→10 °C / 240 min". */
export function formatLimit(raw: unknown): string {
  const limit = parseLimit(raw);
  if ("max" in limit) return `≤ ${limit.max} °C`;
  if ("min" in limit) return `≥ ${limit.min} °C`;
  if ("coolFrom" in limit)
    return `${limit.coolFrom}→${limit.coolTo} °C / ${limit.withinMinutes} min`;
  return "✓";
}
