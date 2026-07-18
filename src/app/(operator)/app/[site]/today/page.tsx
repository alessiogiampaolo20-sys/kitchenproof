import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CalendarCheck, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActorSession, getDeviceSession } from "@/lib/actor/session";
import { pickText } from "@/lib/i18n/pick";
import { wallTimeToUtc } from "@/lib/compliance/materializer";
import { formatLimit, parseLimit } from "@/lib/compliance/limits";
import { SiteNav } from "../site-nav";
import { PinSwitcher, type SwitcherMember } from "./pin-switcher";
import { RegisterDeviceForm } from "./register-device-form";
import { AdHocLauncher } from "./adhoc-launcher";
import { PushSubscribe } from "./push-subscribe";
import {
  OfflineCacheMirror,
  OverdueHeader,
  TaskRowClient,
  type TaskRowData,
} from "./task-row-client";
import { OfflinePill } from "@/lib/offline/sync-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function localDate(now: Date, timeZone: string): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return { y: y!, m: m!, d: d! };
}

export default async function TodayPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");

  const [device, actor] = await Promise.all([
    getDeviceSession(site.id),
    getActorSession(site.id),
  ]);

  let deviceActive = false;
  if (device) {
    const { data: deviceRow } = await supabase
      .from("device_sessions")
      .select("id, revoked_at")
      .eq("id", device.deviceSessionId)
      .maybeSingle();
    deviceActive = !!deviceRow && deviceRow.revoked_at === null;
  }

  const timeZone = site.timezone;
  const now = new Date();
  const { y, m, d } = localDate(now, timeZone);
  const dayStart = wallTimeToUtc(y, m, d, 0, 0, timeZone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const yesterdayStart = new Date(dayStart.getTime() - 24 * 3_600_000);

  const taskSelect =
    "id, due_at, due_window_minutes, status, verifies_deviation_id, control_point:control_points(name_i18n, category, limit_json, equipment:equipment(name))";

  const [
    { data: pendingTasks },
    { data: doneTasks },
    { data: missedTasks },
    { data: members },
    { data: pinStatus },
    { data: equipment },
    { data: cleaningAreas },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(taskSelect)
      .eq("site_id", site.id)
      .eq("status", "pending")
      .lt("due_at", dayEnd.toISOString())
      .order("due_at"),
    supabase
      .from("tasks")
      .select(taskSelect)
      .eq("site_id", site.id)
      .eq("status", "done")
      .gte("due_at", dayStart.toISOString())
      .lt("due_at", dayEnd.toISOString())
      .order("due_at"),
    supabase
      .from("tasks")
      .select(taskSelect)
      .eq("site_id", site.id)
      .eq("status", "missed")
      .gte("due_at", yesterdayStart.toISOString())
      .order("due_at"),
    supabase
      .from("memberships")
      .select("id, user_id, role, site_ids, profile:profiles(full_name)")
      .eq("org_id", site.org_id)
      .not("accepted_at", "is", null),
    supabase.rpc("site_pin_status", { p_site_id: site.id }),
    supabase
      .from("equipment")
      .select("id, name")
      .eq("site_id", site.id)
      .eq("active", true),
    supabase
      .from("cleaning_areas")
      .select("id, name_i18n")
      .eq("site_id", site.id)
      .eq("active", true)
      .order("position"),
  ]);

  const pinById = new Map((pinStatus ?? []).map((p) => [p.membership_id, p]));
  const switcherMembers: SwitcherMember[] = (members ?? [])
    .filter((member) => member.site_ids === null || member.site_ids.includes(site.id))
    .map((member) => ({
      membershipId: member.id,
      fullName: member.profile?.full_name ?? "",
      hasPin: pinById.get(member.id)?.has_pin ?? false,
      locked: pinById.get(member.id)?.locked ?? false,
    }));

  const [t, locale, format] = await Promise.all([
    getTranslations(),
    getLocale(),
    getFormatter(),
  ]);
  const today = format.dateTime(now, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });

  const cleaningItems = (cleaningAreas ?? []).map((area) => ({
    key: area.id,
    label: pickText(area.name_i18n, locale),
  }));

  type RawTask = NonNullable<typeof pendingTasks>[number];
  function toRowData(task: RawTask, tone: TaskRowData["tone"]): TaskRowData {
    const limitJson = task.control_point?.limit_json ?? { checklist: true };
    let flow: TaskRowData["flow"] = "temp";
    try {
      const limit = parseLimit(limitJson);
      flow = "coolFrom" in limit ? "cooling" : "checklist" in limit ? "checklist" : "temp";
    } catch {
      flow = "temp";
    }
    const isCleaning = task.control_point?.category === "cleaning";
    const checklistItems =
      flow === "checklist"
        ? isCleaning && cleaningItems.length > 0
          ? cleaningItems
          : [{ key: "main", label: pickText(task.control_point?.name_i18n, locale) }]
        : [];
    return {
      taskId: task.id,
      siteId: site!.id,
      name: `${pickText(task.control_point?.name_i18n, locale)}${
        task.control_point?.equipment ? ` — ${task.control_point.equipment.name}` : ""
      }`,
      dueLabel: t("todayScreen.dueAt", {
        time: format.dateTime(new Date(task.due_at), {
          hour: "2-digit",
          minute: "2-digit",
          timeZone,
        }),
      }),
      tone,
      category: task.control_point?.category ?? "other",
      isVerification: task.verifies_deviation_id !== null,
      isMissed: task.status === "missed",
      flow,
      limitJson,
      limitLabel: formatLimit(limitJson),
      checklistItems,
    };
  }

  const overdueRaw = [
    ...(missedTasks ?? []),
    ...(pendingTasks ?? []).filter(
      (task) =>
        now.getTime() >
        new Date(task.due_at).getTime() + task.due_window_minutes * 60_000,
    ),
  ];
  const dueNowRaw = (pendingTasks ?? []).filter((task) => {
    const due = new Date(task.due_at).getTime();
    return (
      now.getTime() >= due - 30 * 60_000 &&
      now.getTime() <= due + task.due_window_minutes * 60_000
    );
  });
  const laterRaw = (pendingTasks ?? []).filter(
    (task) =>
      new Date(task.due_at).getTime() - 30 * 60_000 > now.getTime() &&
      new Date(task.due_at) < dayEnd,
  );

  const overdue = overdueRaw.map((task) => toRowData(task, "overdue"));
  const dueNow = dueNowRaw.map((task) => toRowData(task, "now"));
  const later = laterRaw.map((task) => toRowData(task, "later"));
  const done = (doneTasks ?? []).map((task) => toRowData(task, "done"));

  const doneCount = done.length;
  const totalToday =
    doneCount +
    (pendingTasks ?? []).filter((task) => new Date(task.due_at) >= dayStart).length;
  const progress = totalToday > 0 ? doneCount / totalToday : 0;

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    // Kitchen mode (§15.1): base font 18px, ≥56px touch targets.
    <main className="mx-auto w-full max-w-xl flex-1 p-4 text-[18px]">
      <SiteNav siteId={site.id} active="today" />
      <OfflineCacheMirror
        siteId={site.id}
        checks={[...overdue, ...dueNow, ...later].map((row) => ({
          taskId: row.taskId,
          siteId: row.siteId,
          dueAt: "",
          dueWindowMinutes: 0,
          status: "pending",
          verifiesDeviation: row.isVerification,
          cpName: row.name,
          category: row.category,
          limitJson: row.limitJson,
          equipmentName: null,
          checklistItems: row.checklistItems,
        }))}
      />
      <header className="mb-6 grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{site.name}</h1>
            <p className="text-sm capitalize text-muted-foreground">{today}</p>
            {/* §10.1 persistent Kontrolbesøg entry (shield) */}
            <Link
              href={`/app/${site.id}/inspection`}
              className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
              data-testid="kontrolbesog-button"
            >
              <ShieldCheck className="size-4" />
              {t("inspection.entryLink")}
            </Link>
          </div>
          {deviceActive ? (
            <div className="flex items-center gap-3">
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0 -rotate-90">
                <circle cx="32" cy="32" r={ringRadius} fill="none" strokeWidth="6" className="stroke-muted" />
                <circle
                  cx="32"
                  cy="32"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className="stroke-primary"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - progress)}
                />
              </svg>
              <PinSwitcher siteId={site.id} members={switcherMembers} />
            </div>
          ) : null}
        </div>
        {deviceActive ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="active-actor">
            <span className="text-muted-foreground">{t("pin.actingAs")}:</span>
            {actor ? (
              <Badge className="text-sm">{actor.fullName}</Badge>
            ) : (
              <Badge variant="outline">{t("pin.nobodyActive")}</Badge>
            )}
            <OfflinePill />
            <PushSubscribe siteId={site.id} />
            <span className="ml-auto text-sm text-muted-foreground" data-testid="progress-label">
              {t("todayScreen.progress", { done: doneCount, total: totalToday })}
            </span>
          </div>
        ) : null}
      </header>

      {!deviceActive ? (
        <RegisterDeviceForm siteId={site.id} />
      ) : (
        <div className="grid gap-6">
          {overdue.length > 0 ? (
            <section className="grid gap-2">
              <OverdueHeader />
              {overdue.map((task) => (
                <TaskRowClient key={task.taskId} task={task} />
              ))}
            </section>
          ) : null}

          {dueNow.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="font-medium">{t("todayScreen.dueNow")}</h2>
              {dueNow.map((task) => (
                <TaskRowClient key={task.taskId} task={task} />
              ))}
            </section>
          ) : null}

          {later.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="font-medium text-muted-foreground">{t("todayScreen.later")}</h2>
              {later.map((task) => (
                <TaskRowClient key={task.taskId} task={task} />
              ))}
            </section>
          ) : null}

          {overdue.length + dueNow.length + later.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
                <CalendarCheck className="size-6 text-primary" />
                {totalToday > 0 ? t("todayScreen.allDone") : t("todayScreen.noTasks")}
              </CardContent>
            </Card>
          ) : null}

          <AdHocLauncher siteId={site.id} equipment={equipment ?? []} />

          {done.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="font-medium text-muted-foreground">
                {t("todayScreen.doneSection")} ({doneCount})
              </h2>
              {done.map((task) => (
                <TaskRowClient key={task.taskId} task={task} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
