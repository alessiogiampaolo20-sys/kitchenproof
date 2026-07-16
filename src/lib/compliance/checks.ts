import { z } from "zod";
import { parseLimit } from "./limits";
import type { PackLimit } from "./pack-schema";

/**
 * Check value evaluation (§8.2) + severity suggestion (§8.3).
 * Pure and unit-tested — the server action is the only writer of `passed`.
 */

export const tempValueSchema = z.object({ temp_c: z.number().min(-60).max(300) }).strict();

export const checklistItemSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(["ok", "fail", "na"]),
    reason: z.string().max(500).optional(),
  })
  .strict()
  // §8.2: every ✗ requires a reason (chip) or photo — reason enforced here,
  // photo evidence optional alongside.
  .refine((i) => i.status !== "fail" || (i.reason && i.reason.length > 0), {
    message: "failed checklist items require a reason",
  });

export const checklistValueSchema = z
  .object({ checklist: z.array(checklistItemSchema).min(1) })
  .strict();

export const coolingValueSchema = z
  .object({
    cool_log: z
      .array(
        z.object({ at: z.string().datetime({ offset: true }), temp_c: z.number() }).strict(),
      )
      .min(2),
    blast_chiller: z.boolean().optional(),
  })
  .strict();

export const noteValueSchema = z.object({ note_text: z.string().min(1).max(4000) }).strict();

export const checkValueSchema = z.union([
  tempValueSchema,
  checklistValueSchema,
  coolingValueSchema,
  noteValueSchema,
]);
export type CheckValue = z.infer<typeof checkValueSchema>;

export function evaluateCheck(rawLimit: unknown, value: CheckValue): boolean {
  const limit: PackLimit = parseLimit(rawLimit);

  if ("temp_c" in value) {
    if ("max" in limit) return value.temp_c <= limit.max;
    if ("min" in limit) return value.temp_c >= limit.min;
    throw new Error("temperature value against non-temperature limit");
  }

  if ("checklist" in value) {
    return value.checklist.every((i) => i.status !== "fail");
  }

  if ("cool_log" in value) {
    if (!("coolFrom" in limit)) throw new Error("cooling log against non-cooling limit");
    const log = [...value.cool_log].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    const start = log[0]!;
    const end = log[log.length - 1]!;
    const elapsedMinutes =
      (new Date(end.at).getTime() - new Date(start.at).getTime()) / 60_000;
    // the clock starts at coolFrom (56 °C): reaching coolTo within the window
    return end.temp_c <= limit.coolTo && elapsedMinutes <= limit.withinMinutes;
  }

  // plain notes have no pass/fail semantics
  return true;
}

export type Severity = "minor" | "major" | "critical";

/**
 * §8.3 severity suggestion, e.g. fridge 6.5 °C → minor; 12 °C overnight →
 * major. Temperature: distance beyond the limit; cooling: final temperature.
 */
export function suggestSeverity(rawLimit: unknown, value: CheckValue): Severity {
  const limit: PackLimit = parseLimit(rawLimit);

  if ("temp_c" in value) {
    const delta =
      "max" in limit ? value.temp_c - limit.max : "min" in limit ? limit.min - value.temp_c : 0;
    if (delta <= 3) return "minor";
    if (delta <= 8) return "major";
    return "critical";
  }

  if ("cool_log" in value && "coolFrom" in limit) {
    const final = value.cool_log[value.cool_log.length - 1]!.temp_c;
    return final > 25 ? "critical" : "major";
  }

  return "minor"; // checklist / note deviations default
}

/** Human summary of a failed value for the deviation description. */
export function describeValue(value: CheckValue): string {
  if ("temp_c" in value) return `${value.temp_c} °C`;
  if ("cool_log" in value) {
    const final = value.cool_log[value.cool_log.length - 1]!;
    return `cool_log slut ${final.temp_c} °C`;
  }
  if ("checklist" in value) {
    const failed = value.checklist.filter((i) => i.status === "fail");
    return failed.map((f) => `${f.label}: ${f.reason ?? "✗"}`).join("; ");
  }
  return value.note_text.slice(0, 200);
}
