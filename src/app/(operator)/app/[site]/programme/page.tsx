import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpenCheck, FileCheck2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { pickText } from "@/lib/i18n/pick";
import { formatLimit, parseLimit } from "@/lib/compliance/limits";
import { frequencySchema } from "@/lib/compliance/pack-schema";
import { SiteNav } from "../site-nav";
import { ApproveButton, StartTemplateButton } from "./programme-buttons";
import { CreateCpDialog, EditCpDialog, ToggleCpButton, type CpLimitShape } from "./cp-dialogs";
import { RowEditDialog } from "./row-edit-dialog";
import { ProposalCard } from "./proposal-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function limitShape(raw: unknown): CpLimitShape {
  const limit = parseLimit(raw);
  if ("max" in limit) return { kind: "max", max: limit.max };
  if ("min" in limit) return { kind: "min", min: limit.min };
  if ("coolFrom" in limit)
    return {
      kind: "cooling",
      coolFrom: limit.coolFrom,
      coolTo: limit.coolTo,
      withinMinutes: limit.withinMinutes,
    };
  return { kind: "checklist" };
}

export default async function ProgrammePage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, activity_type, pack_version_pinned")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const { data: ra } = await supabase
    .from("risk_analyses")
    .select("id, version, status, approved_at")
    .eq("site_id", siteId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  // §13: open regulatory review tasks surface above everything
  const { data: reviewTasks } = await supabase
    .from("site_review_tasks")
    .select("id, trigger, due_at")
    .eq("site_id", siteId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  // §11: pending central-template proposals need a local decision
  const { data: proposals } = await supabase
    .from("programme_change_proposals")
    .select("id, diff_json, template:org_programme_templates(name)")
    .eq("site_id", siteId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const proposalCards =
    isManager && (proposals ?? []).length > 0 ? (
      <div className="mb-4 grid gap-2">
        {(proposals ?? []).map((proposal) => (
          <ProposalCard
            key={proposal.id}
            siteId={siteId}
            proposalId={proposal.id}
            templateName={proposal.template?.name ?? ""}
            items={(proposal.diff_json ?? []) as never}
          />
        ))}
      </div>
    ) : null;

  const reviewBanner =
    (reviewTasks ?? []).length > 0 ? (
      <div className="mb-4 grid gap-2">
        {(reviewTasks ?? []).map((reviewTask) => (
          <Link
            key={reviewTask.id}
            href={`/app/${siteId}/programme/review/${reviewTask.id}`}
            data-testid="review-task-banner"
          >
            <Card className="border-amber-400">
              <CardContent className="flex items-center gap-2 py-3 text-sm">
                <span className="min-w-0 flex-1 font-medium">
                  {t(`programme.reviewTriggers.${reviewTask.trigger}`)}
                </span>
                {reviewTask.due_at ? (
                  <Badge variant="secondary">
                    {t("programme.reviewDue", { date: reviewTask.due_at.slice(0, 10) })}
                  </Badge>
                ) : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    ) : null;

  if (!ra) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <SiteNav siteId={siteId} active="programme" />
        {reviewBanner}
        {proposalCards}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpenCheck className="size-5 text-primary" />
              {t("programme.startTitle")}
            </CardTitle>
            <CardDescription>{t("programme.startHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {isManager ? (
              <>
                <Button asChild size="lg" className="min-h-14" data-testid="start-wizard">
                  <Link href={`/app/${siteId}/programme/wizard`}>
                    <Sparkles className="size-4" />
                    {t("programme.startWizardButton")}
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("programme.startWizardHint")}
                </p>
                <StartTemplateButton siteId={siteId} />
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="min-h-14"
                  data-testid="start-import"
                >
                  <Link href={`/app/${siteId}/programme/import`}>
                    {t("programme.startImportButton")}
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("programme.startImportHint")}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  const [{ data: steps }, { data: rows }, { data: cps }, { count: taskCount }] =
    await Promise.all([
      supabase
        .from("process_steps")
        .select("id, key, position, name_i18n")
        .eq("risk_analysis_id", ra.id)
        .order("position"),
      supabase
        .from("ra_activity_rows")
        .select(
          "id, process_step_id, position, activity_key, applies, is_critical, ai_suggested, human_edited, what_you_do_i18n, what_can_go_wrong_i18n, control_measures_i18n, if_it_goes_wrong_i18n",
        )
        .eq("risk_analysis_id", ra.id)
        .order("position"),
      supabase
        .from("control_points")
        .select(
          "id, template_key, name_i18n, category, limit_json, limit_loosened, frequency_json, monitoring_method, source_ref, active, equipment:equipment(id, name)",
        )
        .eq("risk_analysis_id", ra.id)
        .order("category"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .eq("status", "pending"),
    ]);

  const statusVariant =
    ra.status === "approved" ? "default" : ra.status === "draft" ? "outline" : "secondary";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <SiteNav siteId={siteId} active="programme" />
        {reviewBanner}
        {proposalCards}

      <header className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t("programme.title")}</h1>
        <Button asChild variant="outline" size="sm" data-testid="assistant-link">
          <Link href={`/app/${siteId}/assistant`}>
            {t("programme.assistantLink")}
          </Link>
        </Button>
        <Badge variant={statusVariant} data-testid="ra-status">
          {t(`programme.status.${ra.status}`)}
        </Badge>
        <Badge variant="secondary">
          {t("programme.version", { version: ra.version })}
        </Badge>
        {site.pack_version_pinned ? (
          <Badge variant="secondary">
            {t("programme.packVersion", { version: site.pack_version_pinned })}
          </Badge>
        ) : null}
        {ra.status === "approved" ? (
          <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground">
            <FileCheck2 className="size-4 text-primary" />
            {t("programme.tasksTitle")}: {taskCount ?? 0}
          </span>
        ) : null}
      </header>

      {ra.status === "draft" && isManager ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <ApproveButton siteId={siteId} riskAnalysisId={ra.id} />
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-8 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{t("programme.cpTitle")}</h2>
          {isManager ? (
            <CreateCpDialog
              siteId={siteId}
              equipment={(cps ?? [])
                .filter((c) => c.equipment)
                .map((c) => ({ id: c.equipment!.id, name: c.equipment!.name }))
                .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)}
            />
          ) : null}
        </div>
        <div className="grid gap-2">
          {(cps ?? []).map((cp) => {
            const frequency = frequencySchema.safeParse(cp.frequency_json);
            const perEvent = frequency.success && "perEvent" in frequency.data;
            const times =
              frequency.success && !("perEvent" in frequency.data)
                ? frequency.data.times.join(",")
                : null;
            const sourceRef = cp.source_ref as
              | { docId: string; section: string; page: number }
              | null;
            return (
              <Card key={cp.id} className={cp.active ? "" : "opacity-50"} data-testid="cp-row">
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {pickText(cp.name_i18n, locale)}
                      {cp.equipment ? (
                        <span className="text-muted-foreground"> — {cp.equipment.name}</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(`programme.categories.${cp.category}`)} ·{" "}
                      {t(`programme.monitoring.${cp.monitoring_method}`)} ·{" "}
                      {perEvent ? t("programme.perEvent") : times}
                    </p>
                    {sourceRef ? (
                      <p className="text-xs text-muted-foreground" data-testid="cp-source">
                        {t("programme.source")}: {sourceRef.docId} §{sourceRef.section}, s. {sourceRef.page}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="outline" className="font-mono" data-testid="cp-limit">
                    {formatLimit(cp.limit_json)}
                  </Badge>
                  {cp.limit_loosened ? (
                    <Badge variant="destructive">{t("programme.loosened")}</Badge>
                  ) : null}
                  {!cp.active ? <Badge variant="secondary">{t("programme.inactive")}</Badge> : null}
                  {isManager ? (
                    <div className="flex items-center gap-1">
                      <EditCpDialog
                        siteId={siteId}
                        controlPointId={cp.id}
                        cpName={pickText(cp.name_i18n, locale)}
                        limit={limitShape(cp.limit_json)}
                        times={times}
                        isPackTemplate={cp.template_key !== null}
                      />
                      <ToggleCpButton
                        siteId={siteId}
                        controlPointId={cp.id}
                        active={cp.active}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator className="mb-6" />

      <section className="grid gap-4">
        <h2 className="font-medium">{t("programme.sectionsTitle")}</h2>
        {(steps ?? []).map((step) => {
          const stepRows = (rows ?? []).filter(
            (r) => r.process_step_id === step.id && r.applies,
          );
          if (stepRows.length === 0) return null;
          return (
            <Card key={step.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {pickText(step.name_i18n, locale)}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {stepRows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      {pickText(row.what_you_do_i18n, locale) || row.activity_key}
                    </span>
                    {/* §7.3: AI origin stays visible until a human has edited */}
                    {row.ai_suggested && !row.human_edited ? (
                      <Badge variant="secondary" className="shrink-0" data-testid="ai-badge">
                        {t("programme.aiSuggested")}
                      </Badge>
                    ) : null}
                    {row.is_critical ? (
                      <Badge variant="destructive" className="shrink-0">
                        {t("programme.critical")}
                      </Badge>
                    ) : null}
                    {isManager && ra.status === "draft" ? (
                      <RowEditDialog
                        siteId={siteId}
                        rowId={row.id}
                        rowName={pickText(row.what_you_do_i18n, locale) || row.activity_key}
                        applies={row.applies}
                        critical={row.is_critical}
                        texts={{
                          whatYouDo: pickText(row.what_you_do_i18n, locale),
                          whatCanGoWrong: pickText(row.what_can_go_wrong_i18n, locale),
                          controlMeasures: pickText(row.control_measures_i18n, locale),
                          ifItGoesWrong: pickText(row.if_it_goes_wrong_i18n, locale),
                        }}
                      />
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
