import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { pickText } from "@/lib/i18n/pick";
import { parseLimit } from "@/lib/compliance/limits";
import { SiteNav } from "../site-nav";
import { TempChart, type TempPoint } from "./temp-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ equipment?: string }>;
}) {
  const { site: siteId } = await params;
  const { equipment: equipmentFilter } = await searchParams;

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");

  const { data: units } = await supabase
    .from("equipment")
    .select("id, name, kind")
    .eq("site_id", siteId)
    .eq("active", true)
    .in("kind", ["fridge", "freezer", "hot_holding"])
    .order("created_at");

  const selectedId = equipmentFilter ?? units?.[0]?.id;

  const [t, locale, format] = await Promise.all([
    getTranslations(),
    getLocale(),
    getFormatter(),
  ]);

  let points: TempPoint[] = [];
  let limitMax: number | undefined;
  let limitMin: number | undefined;
  if (selectedId) {
    const [{ data: history }, { data: cp }] = await Promise.all([
      supabase
        .from("v_temperature_history")
        .select("temp_c, server_received_at")
        .eq("equipment_id", selectedId)
        .order("server_received_at", { ascending: true })
        .limit(60),
      supabase
        .from("control_points")
        .select("limit_json")
        .eq("equipment_id", selectedId)
        .eq("category", "temperature")
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
    ]);
    points = (history ?? []).map((row) => ({
      at: row.server_received_at ?? "",
      label: format.dateTime(new Date(row.server_received_at ?? 0), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: site.timezone,
      }),
      temp: Number(row.temp_c),
    }));
    if (cp) {
      const limit = parseLimit(cp.limit_json);
      if ("max" in limit) limitMax = limit.max;
      if ("min" in limit) limitMin = limit.min;
    }
  }

  const [{ data: missed }, { data: latest }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, due_at, control_point:control_points(name_i18n, equipment:equipment(name))")
      .eq("site_id", siteId)
      .eq("status", "missed")
      .order("due_at", { ascending: false })
      .limit(20),
    supabase
      .from("task_completions")
      .select(
        "id, value_json, passed, is_late, server_received_at, performer:profiles!task_completions_performed_by_fkey(full_name), control_point:control_points(name_i18n), equipment:equipment(name)",
      )
      .eq("site_id", siteId)
      .order("server_received_at", { ascending: false })
      .limit(15),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <SiteNav siteId={siteId} active="reports" />
      <h1 className="mb-4 text-xl font-semibold">{t("reports.title")}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("reports.tempHistory")}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(units ?? []).map((unit) => (
              <Button
                key={unit.id}
                asChild
                size="sm"
                variant={unit.id === selectedId ? "default" : "outline"}
              >
                <Link href={`/app/${siteId}/reports?equipment=${unit.id}`}>
                  {unit.name}
                </Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {points.length > 0 ? (
            <TempChart points={points} limitMax={limitMax} limitMin={limitMin} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("reports.misses")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(missed ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noMisses")}</p>
          ) : (
            (missed ?? []).map((task) => (
              <div key={task.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {pickText(task.control_point?.name_i18n, locale)}
                  {task.control_point?.equipment
                    ? ` — ${task.control_point.equipment.name}`
                    : ""}
                </span>
                <span className="text-muted-foreground">
                  {t("reports.missedAt", {
                    time: format.dateTime(new Date(task.due_at), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: site.timezone,
                    }),
                  })}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.records")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(latest ?? []).map((record) => {
            const value = record.value_json as Record<string, unknown>;
            const valueLabel =
              typeof value?.temp_c === "number"
                ? `${value.temp_c} °C`
                : Array.isArray(value?.checklist)
                  ? "✓"
                  : Array.isArray(value?.cool_log)
                    ? "56→10"
                    : "—";
            return (
              <div
                key={record.id}
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid="record-row"
              >
                <span className="min-w-0 flex-1">
                  {pickText(record.control_point?.name_i18n, locale) || t("todayScreen.adHoc")}
                  {record.equipment ? ` — ${record.equipment.name}` : ""}
                </span>
                <span className="font-mono">{valueLabel}</span>
                {record.passed === false ? (
                  <Badge variant="destructive">{t("check.failed")}</Badge>
                ) : null}
                {record.is_late ? (
                  <Badge variant="outline">{t("check.lateBadge")}</Badge>
                ) : null}
                <span className="text-muted-foreground" data-testid="record-by">
                  {t("reports.recordBy", { name: record.performer?.full_name ?? "—" })}
                </span>
              </div>
            );
          })}
          {(latest ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
