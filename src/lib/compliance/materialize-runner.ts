// Server/script-side only (server actions, seed, tests) — no Next.js deps.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { materializeTasks } from "./materializer";

type Client = SupabaseClient<Database>;

const DEFAULT_WINDOW_DAYS = 7;

/**
 * Materializes scheduled tasks for a site over [now − 24h, now + days),
 * keeping past occurrences only while their completion window is still open —
 * approving a programme in the evening must still surface tonight's tasks
 * (they show as due/overdue; §17 lateness flags apply on completion as usual).
 * Idempotent: duplicates are dropped on the (control_point_id, due_at) unique
 * constraint. Runs under the caller's RLS (manager on approve/edit paths;
 * nightly cron since Phase 2).
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

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const inserts = materializeTasks(cps ?? [], { from, to }, site.timezone).filter(
    (task) => {
      const due = new Date(task.due_at).getTime();
      const windowEnd = due + (task.due_window_minutes ?? 0) * 60 * 1000;
      return due >= now.getTime() || windowEnd > now.getTime();
    },
  );

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
