import { RRule } from "rrule";
import { frequencySchema, type PackFrequency } from "./pack-schema";
import { nextOpenDay, type DayStatus } from "./operating-days";

/**
 * Task materializer (§8.4, Phase 1 scope): expands control point frequencies
 * (rrule day pattern + wall-clock times) into concrete task instances in the
 * site's timezone. Pure and deterministic — idempotency comes from the
 * (control_point_id, due_at) unique constraint at insert time.
 */

export type MaterializableControlPoint = {
  id: string;
  site_id: string;
  frequency_json: unknown;
  responsible_role: string | null;
  active: boolean;
};

export type TaskInsert = {
  control_point_id: string;
  site_id: string;
  due_at: string; // ISO UTC
  due_window_minutes: number;
  assigned_role: string | null;
};

/** Offset of a timezone at a given UTC instant, in ms (Intl-based, no deps). */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcMs;
}

/** UTC instant for a wall-clock time in a timezone (DST-safe, two-pass). */
export function wallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess - tzOffsetMs(guess, timeZone);
  const offset2 = tzOffsetMs(ts, timeZone);
  if (guess - offset2 !== ts) ts = guess - offset2;
  return new Date(ts);
}

function localDateParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = dtf.format(instant).split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

/** Wall-clock hour/minute of an instant in a timezone. */
function localTimeParts(instant: Date, timeZone: string): { hour: number; minute: number } {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant)) {
    parts[p.type] = p.value;
  }
  return {
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Expand one frequency into UTC due instants within [from, to). */
export function expandFrequency(
  rawFrequency: unknown,
  window: { from: Date; to: Date },
  timeZone: string,
): { dueAt: Date; dueWindowMinutes: number }[] {
  const frequency: PackFrequency = frequencySchema.parse(rawFrequency);
  if ("perEvent" in frequency) return []; // event-driven: recorded from flows, never scheduled

  // Day-pattern expansion on "floating" UTC-midnight days anchored at the
  // local calendar day of the window start.
  const start = localDateParts(window.from, timeZone);
  const end = localDateParts(window.to, timeZone);
  const rule = RRule.fromString(
    `DTSTART:${String(start.year).padStart(4, "0")}${String(start.month).padStart(2, "0")}${String(start.day).padStart(2, "0")}T000000Z\nRRULE:${frequency.rrule}`,
  );
  const days = rule.between(
    new Date(Date.UTC(start.year, start.month - 1, start.day)),
    new Date(Date.UTC(end.year, end.month - 1, end.day)),
    true,
  );

  const out: { dueAt: Date; dueWindowMinutes: number }[] = [];
  for (const day of days) {
    for (const time of frequency.times) {
      const [hh, mm] = time.split(":").map(Number);
      const dueAt = wallTimeToUtc(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        hh!,
        mm!,
        timeZone,
      );
      if (dueAt >= window.from && dueAt < window.to) {
        out.push({ dueAt, dueWindowMinutes: frequency.dueWindowMinutes });
      }
    }
  }
  out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return out;
}

/** True when the frequency repeats more often than once a day. */
function isDailyRule(rawFrequency: unknown): boolean {
  const parsed = frequencySchema.safeParse(rawFrequency);
  if (!parsed.success || "perEvent" in parsed.data) return false;
  return /FREQ=(DAILY|HOURLY|MINUTELY|SECONDLY)/i.test(parsed.data.rrule);
}

/**
 * Expand all active scheduled control points into task inserts.
 *
 * `dayStatus` brings in the operating calendar (§3.5). A closed day produces
 * no tasks — the kitchen was not working, and nagging about it is how the app
 * gets abandoned. A weekly or monthly check that lands on a closed day is not
 * dropped but ROLLED to the next open day, so the cadence survives; a daily
 * check simply skips, because tomorrow brings its own occurrence.
 *
 * Uncertainty never suppresses: only a day that is explicitly or patternly
 * closed removes work. Anything unknown keeps its tasks.
 */
export function materializeTasks(
  controlPoints: MaterializableControlPoint[],
  window: { from: Date; to: Date },
  timeZone: string,
  dayStatus?: (isoDay: string) => DayStatus,
): TaskInsert[] {
  const inserts: TaskInsert[] = [];
  const statusOf = dayStatus ?? (() => "open" as DayStatus);

  for (const cp of controlPoints) {
    if (!cp.active) continue;
    const daily = isDailyRule(cp.frequency_json);

    for (const occ of expandFrequency(cp.frequency_json, window, timeZone)) {
      const parts = localDateParts(occ.dueAt, timeZone);
      const isoDay = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

      let dueAt = occ.dueAt;
      if (statusOf(isoDay) === "closed") {
        if (daily) continue; // tomorrow has its own occurrence
        const rolled = nextOpenDay(isoDay, statusOf);
        if (!rolled) continue;
        // keep the original wall-clock time, move only the date
        const { hour, minute } = localTimeParts(occ.dueAt, timeZone);
        const [ry, rm, rd] = rolled.split("-").map(Number);
        dueAt = wallTimeToUtc(ry!, rm!, rd!, hour, minute, timeZone);
        if (dueAt >= window.to) continue; // rolled past the horizon
      }

      inserts.push({
        control_point_id: cp.id,
        site_id: cp.site_id,
        due_at: dueAt.toISOString(),
        due_window_minutes: occ.dueWindowMinutes,
        assigned_role: cp.responsible_role,
      });
    }
  }

  // rolling can collide with an occurrence already scheduled on the target day
  const seen = new Set<string>();
  return inserts.filter((task) => {
    const key = `${task.control_point_id}|${task.due_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
