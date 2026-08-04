import { limitSchema, type MeasurementKind, type PackLimit } from "./pack-schema";

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

/** The kind of temperature a limit is written about, when the pack says so. */
export function limitMeasurementKind(limit: PackLimit): MeasurementKind | null {
  return "measurementKind" in limit ? (limit.measurementKind ?? null) : null;
}

export type TempVerdict =
  | { verdict: "pass" }
  | { verdict: "fail" }
  | {
      /** Not judged, and deliberately so — the operator is asked instead. */
      verdict: "unevaluable";
      reason: "kind_unknown" | "kind_mismatch";
      expected: MeasurementKind;
      got: MeasurementKind | null;
    };

/**
 * Evaluates a reading against a limit, refusing to judge when the two are not
 * about the same thing.
 *
 * DK-HYGIEJNE kap. 26.2 (p. 57) separates product from ambient temperature:
 * the hygiene order's provisions are ambient, while the animal-origin
 * regulation and the frozen-food order are mostly product temperatures. A
 * fridge's air at 5 °C is compliant; the food inside it at 5 °C measured
 * against a product limit may not be — and a core reading of 5 °C judged
 * against an ambient limit would pass something that should fail. Both
 * directions are wrong, so an ambiguous record is never silently scored.
 */
export function evaluateTempReading(
  limit: PackLimit,
  valueC: number,
  kind: MeasurementKind | null | undefined,
): TempVerdict {
  const expected = limitMeasurementKind(limit);

  // Limits written before the distinction existed carry no kind: judge them as
  // before rather than blocking a kitchen over metadata.
  if (expected === null) {
    return evaluateTemp(limit, valueC) ? { verdict: "pass" } : { verdict: "fail" };
  }
  if (!kind) {
    return { verdict: "unevaluable", reason: "kind_unknown", expected, got: null };
  }
  if (kind !== expected) {
    return { verdict: "unevaluable", reason: "kind_mismatch", expected, got: kind };
  }
  return evaluateTemp(limit, valueC) ? { verdict: "pass" } : { verdict: "fail" };
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

/**
 * Client-safe reader for a raw limit's measurement kind: the check UI holds
 * `limit_json` straight from the row and must not throw on a shape it does not
 * recognise — an unparseable limit simply declares nothing.
 */
export function limitMeasurementKindOf(rawLimit: unknown): MeasurementKind | null {
  const parsed = limitSchema.safeParse(rawLimit);
  return parsed.success ? limitMeasurementKind(parsed.data) : null;
}
