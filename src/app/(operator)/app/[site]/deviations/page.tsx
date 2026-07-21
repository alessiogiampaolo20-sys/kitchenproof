import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function DeviationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { site: siteId } = await params;
  const { filter } = await searchParams;
  const showAll = filter === "all";

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");

  let query = supabase
    .from("deviations")
    .select(
      "id, description, severity, status, detected_at, food_assessment, corrective_action_text, verification_text, detected_by_profile:profiles!deviations_detected_by_fkey(full_name), corrected_by_profile:profiles!deviations_corrective_action_by_fkey(full_name), verified_by_profile:profiles!deviations_verified_by_fkey(full_name)",
    )
    .eq("site_id", siteId)
    .order("detected_at", { ascending: false })
    .limit(100);
  if (!showAll) {
    query = query.in("status", ["open", "corrected"]);
  }
  const { data: deviations } = await query;

  // pending follow-up verification tasks per deviation (§8.3 step 3)
  const { data: followUps } = await supabase
    .from("tasks")
    .select("id, verifies_deviation_id")
    .eq("site_id", siteId)
    .eq("status", "pending")
    .not("verifies_deviation_id", "is", null);
  const followUpByDeviation = new Map(
    (followUps ?? []).map((task) => [task.verifies_deviation_id, task.id]),
  );

  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("deviation.listTitle")}</h1>
        <div className="flex gap-1">
          <Button asChild size="sm" variant={showAll ? "ghost" : "default"}>
            <Link href={`/app/${siteId}/deviations`}>{t("deviation.filterOpen")}</Link>
          </Button>
          <Button asChild size="sm" variant={showAll ? "default" : "ghost"}>
            <Link href={`/app/${siteId}/deviations?filter=all`}>
              {t("deviation.filterAll")}
            </Link>
          </Button>
        </div>
      </header>

      {(deviations ?? []).length === 0 ? (
        <p className="text-muted-foreground">{t("deviation.empty")}</p>
      ) : (
        <div className="grid gap-2">
          {(deviations ?? []).map((deviation) => (
            <Card key={deviation.id} data-testid="deviation-row">
              <CardContent className="grid gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle
                    className={
                      deviation.severity === "minor"
                        ? "size-5 text-warning"
                        : "size-5 text-destructive"
                    }
                  />
                  <span className="min-w-0 flex-1 font-medium">
                    {deviation.description}
                  </span>
                  <Badge
                    variant={deviation.severity === "minor" ? "secondary" : "destructive"}
                  >
                    {t(`deviation.severity.${deviation.severity}`)}
                  </Badge>
                  <Badge
                    variant={
                      deviation.status === "verified" || deviation.status === "closed"
                        ? "default"
                        : "outline"
                    }
                    data-testid="deviation-status"
                  >
                    {t(`deviation.status.${deviation.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(deviation.detected_at), {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: site.timezone,
                  })}{" "}
                  · {t("deviation.detectedBy", { name: deviation.detected_by_profile?.full_name ?? "—" })}
                </p>
                {deviation.corrective_action_text ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {t("deviation.correctiveLabel")}:{" "}
                    </span>
                    {deviation.corrective_action_text}
                    {deviation.corrected_by_profile ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({t("deviation.correctedBy", { name: deviation.corrected_by_profile.full_name })})
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {followUpByDeviation.has(deviation.id) ? (
                  <Button asChild size="sm" variant="outline" className="w-fit">
                    <Link
                      href={`/app/${siteId}/check/${followUpByDeviation.get(deviation.id)}`}
                      data-testid="deviation-followup-link"
                    >
                      {t("deviation.goToFollowUp")}
                    </Link>
                  </Button>
                ) : null}
                {deviation.verification_text ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {t("check.verification")}:{" "}
                    </span>
                    {deviation.verification_text}
                    {deviation.verified_by_profile ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({t("deviation.verifiedBy", { name: deviation.verified_by_profile.full_name })})
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
