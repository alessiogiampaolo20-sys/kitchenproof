// Server/script-side glue between the operating calendar and the database.
// Kept apart from operating-days.ts so the decision logic stays pure.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  parsePattern,
  resolveDayStatus,
  type DayStatus,
  type OperatingPattern,
} from "./operating-days";

type Client = SupabaseClient<Database>;

export type SiteCalendar = {
  pattern: OperatingPattern | null;
  /** Days a human explicitly confirmed. */
  explicit: Map<string, "open" | "closed">;
  status: (isoDay: string) => DayStatus;
};

/**
 * Loads a site's calendar for [from, to] and returns a status resolver.
 *
 * Booked work is not read here yet — orders and productions arrive with the
 * traceability block; until then a `scheduled_only` site simply reports
 * "unknown" and the Today screen asks. Nothing is guessed on the site's behalf.
 */
export async function loadSiteCalendar(
  supabase: Client,
  siteId: string,
  range: { from: string; to: string },
): Promise<SiteCalendar> {
  const [{ data: site }, { data: days }] = await Promise.all([
    supabase.from("sites").select("operating_pattern").eq("id", siteId).maybeSingle(),
    supabase
      .from("site_operating_days")
      .select("day, status")
      .eq("site_id", siteId)
      .gte("day", range.from)
      .lte("day", range.to),
  ]);

  const pattern = parsePattern(site?.operating_pattern ?? null);
  const explicit = new Map<string, "open" | "closed">();
  for (const row of days ?? []) explicit.set(row.day, row.status);

  return {
    pattern,
    explicit,
    status: (isoDay: string) =>
      resolveDayStatus({ explicit: explicit.get(isoDay) ?? null, pattern, day: isoDay }),
  };
}
