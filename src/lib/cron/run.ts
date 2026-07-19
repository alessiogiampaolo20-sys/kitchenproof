// Scheduled maintenance (§8.4), extracted as a lib so the integration suite
// can exercise it directly. Runs with the service client — a scheduled job,
// not a user request path (§17). Web-push channel joins in Phase 3 (Serwist SW).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { materializeSiteTasks } from "@/lib/compliance/materialize-runner";
import { processPackUpdates } from "@/lib/compliance/pack-update";
import { sendPushToSite } from "@/lib/push";
import daMessages from "@/messages/da.json";
import enMessages from "@/messages/en.json";
import itMessages from "@/messages/it.json";

type Client = SupabaseClient<Database>;

const MESSAGES: Record<string, typeof daMessages> = {
  da: daMessages,
  en: enMessages,
  it: itMessages,
};

function pushTexts(locale: string | null | undefined) {
  return (MESSAGES[locale ?? "da"] ?? daMessages).push;
}

export type CronReport = {
  sitesMaterialized: number;
  tasksMissed: number;
  dueReminders: number;
  overdueReminders: number;
  summaries: number;
  packUpdates: number;
  reviewTasks: number;
};

async function notifyOnce(
  supabase: Client,
  args: { siteId: string; kind: string; taskId: string; payload: Json },
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("kind", args.kind)
    .eq("site_id", args.siteId)
    .eq("payload->>task_id", args.taskId)
    .limit(1);
  if (existing && existing.length > 0) return false;
  await supabase.from("notifications").insert({
    site_id: args.siteId,
    kind: args.kind,
    payload: args.payload,
    channels: ["in_app", "push"],
  });
  return true;
}

export async function runCron(supabase: Client, now = new Date()): Promise<CronReport> {
  const report: CronReport = {
    sitesMaterialized: 0,
    tasksMissed: 0,
    dueReminders: 0,
    overdueReminders: 0,
    summaries: 0,
    packUpdates: 0,
    reviewTasks: 0,
  };

  // §13: fan out newly published pack versions as review tasks (idempotent)
  try {
    const fanOut = await processPackUpdates(supabase);
    report.packUpdates = fanOut.updates;
    report.reviewTasks = fanOut.reviewTasks;
  } catch {
    // pack fan-out must never block reminders/materialization
  }

  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, timezone, org:organizations(default_locale)")
    .eq("status", "active");

  for (const site of sites ?? []) {
    const texts = pushTexts(site.org?.default_locale);
    const todayUrl = `/app/${site.id}/today`;
    // 1 — rolling 7-day materialization (idempotent)
    await materializeSiteTasks(supabase, site.id);
    report.sitesMaterialized += 1;

    // 2 — mark pending tasks past their window as missed (§8.4: honesty is a
    // feature — misses are recorded, never fabricated away)
    const { data: pending } = await supabase
      .from("tasks")
      .select("id, due_at, due_window_minutes")
      .eq("site_id", site.id)
      .eq("status", "pending")
      .lt("due_at", now.toISOString());
    const missedIds = (pending ?? [])
      .filter(
        (task) =>
          now.getTime() >
          new Date(task.due_at).getTime() + task.due_window_minutes * 60_000,
      )
      .map((task) => task.id);
    if (missedIds.length > 0) {
      await supabase.from("tasks").update({ status: "missed" }).in("id", missedIds);
      report.tasksMissed += missedIds.length;
    }

    // 3 — reminders [DEFAULT]: at due time and +30 min if not done
    const { data: dueTasks } = await supabase
      .from("tasks")
      .select("id, due_at")
      .eq("site_id", site.id)
      .eq("status", "pending")
      .lte("due_at", now.toISOString());
    for (const task of dueTasks ?? []) {
      const overdueMinutes =
        (now.getTime() - new Date(task.due_at).getTime()) / 60_000;
      if (overdueMinutes >= 30) {
        if (
          await notifyOnce(supabase, {
            siteId: site.id,
            kind: "task_overdue",
            taskId: task.id,
            payload: { task_id: task.id } as Json,
          })
        ) {
          report.overdueReminders += 1;
          await sendPushToSite(supabase, site.id, {
            title: "KitchenProof",
            body: texts.overdue,
            url: todayUrl,
          });
        }
      } else if (
        await notifyOnce(supabase, {
          siteId: site.id,
          kind: "task_due",
          taskId: task.id,
          payload: { task_id: task.id } as Json,
        })
      ) {
        report.dueReminders += 1;
        await sendPushToSite(supabase, site.id, {
          title: "KitchenProof",
          body: texts.due,
          url: todayUrl,
        });
      }
    }

    // 4 — 20:00 site-local manager summary if anything was missed today [DEFAULT]
    const localHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: site.timezone,
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
    if (localHour === 20) {
      const { count: missedToday } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("site_id", site.id)
        .eq("status", "missed")
        .gte("due_at", new Date(now.getTime() - 24 * 3_600_000).toISOString());
      if ((missedToday ?? 0) > 0) {
        const dateKey = now.toISOString().slice(0, 10);
        const { data: already } = await supabase
          .from("notifications")
          .select("id")
          .eq("kind", "daily_summary")
          .eq("site_id", site.id)
          .eq("payload->>date", dateKey)
          .limit(1);
        if (!already || already.length === 0) {
          await supabase.from("notifications").insert({
            site_id: site.id,
            kind: "daily_summary",
            payload: { date: dateKey, missed: missedToday } as Json,
            channels: ["in_app", "email", "push"],
          });
          report.summaries += 1;
          await sendPushToSite(supabase, site.id, {
            title: "KitchenProof",
            body: texts.summary.replace("{missed}", String(missedToday ?? 0)),
            url: todayUrl,
          });
        }
      }
    }
  }

  return report;
}
