// Server/script-side only (server actions, seed, tests) — no Next.js deps.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { materializeTasks } from "./materializer";

type Client = SupabaseClient<Database>;

const DEFAULT_WINDOW_DAYS = 7;

/**
 * Materializes scheduled tasks for a site over [now, now + days). Idempotent:
 * duplicates are dropped on the (control_point_id, due_at) unique constraint.
 * Runs under the caller's RLS (manager on approve/edit paths; the nightly
 * cron lands in Phase 2 alongside reminders).
 */
export async function materializeSiteTasks(
  supabase: Client,
  siteId: string,
  days = DEFAULT_WINDOW_DAYS,
): Promise<{ inserted: number; window: { from: string; to: string } }> {
  const { data: site } = await supabase
    .from("sites")
    .select("id, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) throw new Error("site not found or not accessible");

  const { data: cps } = await supabase
    .from("control_points")
    .select("id, site_id, frequency_json, responsible_role, active")
    .eq("site_id", siteId)
    .eq("active", true);

  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const inserts = materializeTasks(cps ?? [], { from, to }, site.timezone);

  if (inserts.length > 0) {
    const { error } = await supabase.from("tasks").upsert(inserts, {
      onConflict: "control_point_id,due_at",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`task upsert failed: ${error.message}`);
  }

  return {
    inserted: inserts.length,
    window: { from: from.toISOString(), to: to.toISOString() },
  };
}

/** Drops FUTURE PENDING tasks for a control point (frequency/limit changed). */
export async function rescheduleControlPoint(
  supabase: Client,
  controlPointId: string,
  siteId: string,
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("control_point_id", controlPointId)
    .eq("status", "pending")
    .gt("due_at", new Date().toISOString());
  if (error) throw new Error(`task reschedule delete failed: ${error.message}`);
  await materializeSiteTasks(supabase, siteId);
}
