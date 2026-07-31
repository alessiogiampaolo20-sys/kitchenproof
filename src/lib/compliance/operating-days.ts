// §3.5 operating calendar. Pure: callers supply the facts, this decides.
//
// The governing rule is asymmetric on purpose: a day counts as CLOSED only
// when someone said so or the configured pattern says so. Uncertainty never
// closes a day, because suppressing a check we merely guessed was unnecessary
// would hide a real obligation. Uncertainty asks.
import { z } from "zod";

export const operatingPatternSchema = z.union([
  z.object({
    mode: z.literal("weekdays"),
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  }),
  z.object({ mode: z.literal("scheduled_only") }),
]);

export type OperatingPattern = z.infer<typeof operatingPatternSchema>;

export type DayStatus = "open" | "closed" | "unknown";

/** ISO weekday (1 = Monday) of a plain `YYYY-MM-DD` date, timezone-free. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
  return weekday === 0 ? 7 : weekday;
}

export function parsePattern(raw: unknown): OperatingPattern | null {
  if (raw == null) return null;
  const parsed = operatingPatternSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function resolveDayStatus(args: {
  /** An explicit confirmation always wins — a human said this. */
  explicit?: "open" | "closed" | null;
  pattern: OperatingPattern | null;
  day: string; // YYYY-MM-DD
  /** True when an order, event or production is booked for that day. */
  hasScheduledWork?: boolean;
}): DayStatus {
  if (args.explicit) return args.explicit;

  // Work on the books means the kitchen is working, whatever the pattern says.
  if (args.hasScheduledWork) return "open";

  // No pattern configured = the pre-calendar behaviour: every day is a working
  // day. Sites that never set this up keep exactly what they had.
  if (!args.pattern) return "open";

  if (args.pattern.mode === "weekdays") {
    return args.pattern.weekdays.includes(isoWeekday(args.day)) ? "open" : "closed";
  }

  // scheduled_only with nothing booked: genuinely uncertain (a caterer may cook
  // for an order that is not in the system yet). One tap answers it.
  return "unknown";
}

/**
 * Next day at or after `day` that is not closed. Uncertain days count as open,
 * so a rolled check surfaces rather than disappearing.
 */
export function nextOpenDay(
  day: string,
  status: (day: string) => DayStatus,
  maxLookaheadDays = 14,
): string | null {
  let current = day;
  for (let i = 0; i <= maxLookaheadDays; i++) {
    if (status(current) !== "closed") return current;
    current = addDays(current, 1);
  }
  return null;
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return next.toISOString().slice(0, 10);
}

/**
 * Days in [from, to] with no records and no explicit status — the honest gaps.
 * Past gaps are never auto-filled (§3.5): they are surfaced so the owner
 * resolves them deliberately, either by confirming the day closed or by
 * recording the missing check late, flagged as late.
 */
export function findUnresolvedGaps(args: {
  from: string;
  to: string;
  daysWithRecords: Set<string>;
  daysWithStatus: Set<string>;
}): string[] {
  const gaps: string[] = [];
  let day = args.from;
  while (day <= args.to) {
    if (!args.daysWithRecords.has(day) && !args.daysWithStatus.has(day)) {
      gaps.push(day);
    }
    day = addDays(day, 1);
  }
  return gaps;
}
