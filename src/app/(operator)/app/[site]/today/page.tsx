import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  Bug,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  HandHeart,
  PackageCheck,
  Sparkles,
  Thermometer,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActorSession, getDeviceSession } from "@/lib/actor/session";
import { pickText } from "@/lib/i18n/pick";
import { wallTimeToUtc } from "@/lib/compliance/materializer";
import { SiteNav } from "../site-nav";
import { PinSwitcher, type SwitcherMember } from "./pin-switcher";
import { RegisterDeviceForm } from "./register-device-form";
import { AdHocLauncher } from "./adhoc-launcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS = {
  temperature: Thermometer,
  cleaning: Sparkles,
  receiving: PackageCheck,
  pest: Bug,
  hygiene: HandHeart,
  other: ClipboardCheck,
} as const;

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
  const dayStart = wallTimeToUtc(y, m, d, 0, 0, site.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const yesterdayStart = new Date(dayStart.getTime() - 24 * 3_600_000);

  const taskSelect =
    "id, due_at, due_window_minutes, status, verifies_deviation_id, control_point:control_points(name_i18n, category, equipment:equipment(name))";

  const [
    { data: pendingTasks },
    { data: doneTasks },
    { data: missedTasks },
    { data: members },
    { data: pinStatus },
    { data: equipment },
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
    timeZone: site.timezone,
  });

  const overdue = [
    ...(missedTasks ?? []),
    ...(pendingTasks ?? []).filter(
      (task) =>
        now.getTime() >
        new Date(task.due_at).getTime() + task.due_window_minutes * 60_000,
    ),
  ];
  const dueNow = (pendingTasks ?? []).filter((task) => {
    const due = new Date(task.due_at).getTime();
    return (
      now.getTime() >= due - 30 * 60_000 &&
      now.getTime() <= due + task.due_window_minutes * 60_000
    );
  });
  const later = (pendingTasks ?? []).filter(
    (task) =>
      new Date(task.due_at).getTime() - 30 * 60_000 > now.getTime() &&
      new Date(task.due_at) < dayEnd,
  );
  const doneCount = (doneTasks ?? []).length;
  const totalToday =
    doneCount +
    (pendingTasks ?? []).filter((task) => new Date(task.due_at) >= dayStart).length;
  const progress = totalToday > 0 ? doneCount / totalToday : 0;

  function TaskRow({
    task,
    tone,
  }: {
    task: NonNullable<typeof pendingTasks>[number];
    tone: "overdue" | "now" | "later" | "done";
  }) {
    const category = (task.control_point?.category ?? "other") as keyof typeof CATEGORY_ICONS;
    const Icon = CATEGORY_ICONS[category] ?? ClipboardCheck;
    const time = format.dateTime(new Date(task.due_at), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    const row = (
      <Card
        className={cn(
          "transition-colors",
          tone === "overdue" && "border-destructive/50",
          tone === "done" ? "opacity-60" : "hover:border-primary",
        )}
        data-testid={`task-${tone}`}
      >
        <CardContent className="flex min-h-14 items-center gap-3 py-3">
          <Icon
            className={cn(
              "size-6 shrink-0",
              tone === "overdue" ? "text-destructive" : "text-primary",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {pickText(task.control_point?.name_i18n, locale)}
              {task.control_point?.equipment ? (
                <span className="text-muted-foreground">
                  {" "}
                  — {task.control_point.equipment.name}
                </span>
              ) : null}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("todayScreen.dueAt", { time })}
              {task.verifies_deviation_id ? ` · ${t("check.verification")}` : ""}
              {task.status === "missed" ? ` · ${t("todayScreen.logLate")}` : ""}
            </p>
          </div>
          {tone !== "done" ? <ChevronRight className="size-5 text-muted-foreground" /> : null}
        </CardContent>
      </Card>
    );
    return tone === "done" ? row : <Link href={`/app/${siteId}/check/${task.id}`}>{row}</Link>;
  }

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    // Kitchen mode (§15.1): base font 18px, ≥56px touch targets.
    <main className="mx-auto w-full max-w-xl flex-1 p-4 text-[18px]">
      <SiteNav siteId={site.id} active="today" />
      <header className="mb-6 grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{site.name}</h1>
            <p className="text-sm capitalize text-muted-foreground">{today}</p>
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
              <h2 className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-5" /> {t("todayScreen.overdue")}
              </h2>
              {overdue.map((task) => (
                <TaskRow key={task.id} task={task} tone="overdue" />
              ))}
            </section>
          ) : null}

          {dueNow.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="font-medium">{t("todayScreen.dueNow")}</h2>
              {dueNow.map((task) => (
                <TaskRow key={task.id} task={task} tone="now" />
              ))}
            </section>
          ) : null}

          {later.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="font-medium text-muted-foreground">{t("todayScreen.later")}</h2>
              {later.map((task) => (
                <TaskRow key={task.id} task={task} tone="later" />
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

          {(doneTasks ?? []).length > 0 ? (
            <section className="grid gap-2">
              <h2 className="font-medium text-muted-foreground">
                {t("todayScreen.doneSection")} ({doneCount})
              </h2>
              {(doneTasks ?? []).map((task) => (
                <TaskRow key={task.id} task={task} tone="done" />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
