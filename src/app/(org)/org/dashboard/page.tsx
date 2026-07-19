import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Gauge, Smile } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { getPortfolio } from "@/lib/compliance/score-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-red-600";
}

/** §11 portfolio dashboard: every site at a glance, red flags first. */
export default async function OrgDashboardPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/");
  const supabase = await createClient();
  const portfolio = await getPortfolio(supabase, orgId);
  const t = await getTranslations("orgDashboard");

  const flagged = portfolio.filter((site) => site.redFlags.length > 0);

  return (
    <div className="grid gap-4">
      <header className="flex items-center gap-2">
        <Gauge className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <span className="ml-auto text-sm text-muted-foreground">
          {t("siteCount", { count: portfolio.length })}
        </span>
      </header>

      {/* red-flag rail (§11) */}
      {flagged.length > 0 ? (
        <section className="grid gap-2" data-testid="red-flag-rail">
          {flagged.map((site) => (
            <Link key={site.siteId} href={`/app/${site.siteId}/today`}>
              <Card className="border-destructive">
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {site.siteName}
                  </span>
                  {site.redFlags.map((flag) => (
                    <Badge key={flag} variant="destructive">
                      {t(`flags.${flag}`)}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2">
        {portfolio.map((site) => (
          <Link key={site.siteId} href={`/app/${site.siteId}/today`} data-testid="portfolio-card">
            <Card className="h-full">
              <CardContent className="grid gap-2 py-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {site.siteName}
                  </span>
                  <span
                    className={`text-2xl font-bold tabular-nums ${scoreTone(site.score.score)}`}
                    data-testid="site-score"
                  >
                    {site.score.score}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span data-testid="today-progress">
                    {t("todayProgress", { done: site.doneToday, due: site.dueToday + site.doneToday })}
                  </span>
                  <span>·</span>
                  <span>
                    {t("openDeviations", { count: site.openDeviations })}
                  </span>
                  {site.latestSmiley !== null ? (
                    <Badge variant={site.latestSmiley === 1 ? "default" : "secondary"}>
                      <Smile className="mr-1 size-3.5" />
                      {t(`smiley.${site.latestSmiley}`)}
                    </Badge>
                  ) : null}
                  {!site.programmeStatus ? (
                    <Badge variant="destructive">{t("flags.noProgramme")}</Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">{t("scoreHint")}</p>
    </div>
  );
}
