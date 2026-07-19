// §11 portfolio data: batched org-wide queries → ScoreInputs per site.
// A handful of grouped queries serves 2–50 sites without N+1.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeComplianceScore, type ScoreBreakdown } from "./score";

type Client = SupabaseClient<Database>;

export type SitePortfolioRow = {
  siteId: string;
  siteName: string;
  status: string;
  score: ScoreBreakdown;
  dueToday: number;
  doneToday: number;
  openDeviations: number;
  openMajor: number;
  programmeStatus: string | null;
  latestSmiley: number | null;
  redFlags: string[]; // i18n keys under orgDashboard.flags.*
};

export async function getPortfolio(
  supabase: Client,
  orgId: string,
): Promise<SitePortfolioRow[]> {
  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, status")
    .eq("org_id", orgId)
    .neq("status", "archived")
    .order("name");
  if (!sites || sites.length === 0) return [];
  const siteIds = sites.map((site) => site.id);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data: today },
    { data: tasks30 },
    { data: deviations },
    { data: approvedRas },
    { data: pendingInvoices },
    { data: sessions },
    { data: smileys },
  ] = await Promise.all([
    supabase.from("v_site_compliance_today").select("*").in("site_id", siteIds),
    supabase
      .from("tasks")
      .select("site_id, status")
      .in("site_id", siteIds)
      .gte("due_at", since30)
      .lte("due_at", new Date().toISOString()),
    supabase
      .from("deviations")
      .select("site_id, severity, status, detected_at, corrective_action_at")
      .in("site_id", siteIds)
      .gte("detected_at", since90),
    supabase
      .from("risk_analyses")
      .select("site_id, status, approved_at")
      .in("site_id", siteIds)
      .eq("status", "approved"),
    supabase
      .from("invoices")
      .select("site_id")
      .in("site_id", siteIds)
      .in("status", ["needs_review", "failed"]),
    supabase
      .from("leftover_sessions")
      .select("site_id, completed_at")
      .in("site_id", siteIds)
      .gte("started_at", since7),
    supabase
      .from("smiley_inspections")
      .select("site_id, result, inspected_on")
      .in("site_id", siteIds)
      .order("inspected_on", { ascending: false }),
  ]);

  return sites.map((site) => {
    const todayRow = (today ?? []).find((row) => row.site_id === site.id);
    const siteTasks = (tasks30 ?? []).filter((task) => task.site_id === site.id);
    const done30 = siteTasks.filter((task) => task.status === "done").length;
    const total30 = siteTasks.filter((task) => task.status !== "skipped_justified").length;

    const siteDeviations = (deviations ?? []).filter((d) => d.site_id === site.id);
    const openMajor = siteDeviations.filter(
      (d) =>
        (d.severity === "major" || d.severity === "critical") &&
        (d.status === "open" || d.status === "corrected"),
    ).length;
    const resolved = siteDeviations.filter((d) => d.corrective_action_at);
    const avgResolutionHours =
      resolved.length === 0
        ? null
        : resolved.reduce(
            (sum, d) =>
              sum +
              (new Date(d.corrective_action_at!).getTime() -
                new Date(d.detected_at).getTime()) /
                3_600_000,
            0,
          ) / resolved.length;

    const approved = (approvedRas ?? []).find((ra) => ra.site_id === site.id);
    const unconfirmedInvoices = (pendingInvoices ?? []).filter(
      (invoice) => invoice.site_id === site.id,
    ).length;
    const missedSessions = (sessions ?? []).filter(
      (session) => session.site_id === site.id && session.completed_at === null,
    ).length;
    const smiley = (smileys ?? []).find((row) => row.site_id === site.id);

    const score = computeComplianceScore({
      tasksDone30d: done30,
      tasksTotal30d: total30,
      openMajorDeviations: openMajor,
      avgResolutionHours,
      programmeApprovedAt: approved?.approved_at ?? null,
      unconfirmedInvoices,
      missedLeftoverSessions7d: missedSessions,
    });

    const redFlags: string[] = [];
    if (!approved) redFlags.push("noProgramme");
    if (openMajor > 0) redFlags.push("openMajor");
    if (score.score < 70) redFlags.push("lowScore");
    if ((todayRow?.missed_total ?? 0) > 0 && score.components.completion < 0.8) {
      redFlags.push("missedTasks");
    }

    return {
      siteId: site.id,
      siteName: site.name,
      status: site.status,
      score,
      dueToday: Number(todayRow?.due_today ?? 0),
      doneToday: Number(todayRow?.done_today ?? 0),
      openDeviations: Number(todayRow?.open_deviations ?? 0),
      openMajor,
      programmeStatus: approved ? "approved" : null,
      latestSmiley: smiley?.result ?? null,
      redFlags,
    };
  });
}
