import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Boxes,
  Check,
  ClipboardList,
  FileText,
  KeyRound,
  Refrigerator,
  ShoppingBasket,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { computeOnboarding, type OnboardingKey } from "@/lib/onboarding/steps";
import { parsePattern } from "@/lib/compliance/operating-days";
import { OperatingPatternForm } from "./operating-pattern-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICONS: Record<OnboardingKey, typeof ClipboardList> = {
  programme: ClipboardList,
  equipment: Refrigerator,
  pins: KeyRound,
  catalog: ShoppingBasket,
  stock: Boxes,
  documents: FileText,
};

/** Counts rows without transferring them (head request + exact count). */
async function countRows(
  query: PromiseLike<{ count: number | null }>,
): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

export default async function SetupPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, operating_pattern")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const [
    { data: approvedRa },
    equipmentCount,
    { data: hasManagerPin },
    productCount,
    batchCount,
    documentCount,
  ] = await Promise.all([
    supabase
      .from("risk_analyses")
      .select("id")
      .eq("site_id", site.id)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle(),
    countRows(
      supabase
        .from("equipment")
        .select("id", { count: "exact", head: true })
        .eq("site_id", site.id),
    ),
    supabase.rpc("site_has_manager_pin", { p_site_id: site.id }),
    countRows(
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("org_id", site.org_id)
        .is("merged_into_id", null),
    ),
    countRows(
      supabase
        .from("batches")
        .select("id", { count: "exact", head: true })
        .eq("site_id", site.id)
        .eq("status", "active"),
    ),
    countRows(
      supabase
        .from("site_documents")
        .select("id", { count: "exact", head: true })
        .eq("site_id", site.id),
    ),
  ]);

  const state = computeOnboarding({
    programmeApproved: approvedRa !== null,
    equipmentCount,
    hasManagerPin: hasManagerPin === true,
    productCount,
    batchCount,
    documentCount,
  });

  const t = await getTranslations("setup");
  const basics = state.steps.filter((step) => step.required);
  const takeover = state.steps.filter((step) => !step.required);

  function href(path: string): string {
    return path.startsWith("/org") ? path : `/app/${site!.id}${path}`;
  }

  function renderStep(step: (typeof state.steps)[number]) {
    const Icon = ICONS[step.key];
    return (
      <div
        key={step.key}
        className="flex items-start gap-3 border-t p-4 first:border-t-0"
        data-testid={`setup-step-${step.key}`}
        data-done={step.done}
      >
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
            step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {step.done ? <Check className="size-5" /> : <Icon className="size-5" />}
        </span>
        {/* actions sit under the text, never beside it — on a phone a button
            column squeezes the description down to one word per line */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{t(`steps.${step.key}.title`)}</p>
            {step.done ? (
              <Badge variant="secondary" className="shrink-0">
                {t("done")}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {t(`steps.${step.key}.description`)}
          </p>
          {step.done ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={href(step.path)}
                className="inline-flex min-h-12 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                {t(`steps.${step.key}.action`)}
              </Link>
              {step.altPath ? (
                <Link
                  href={href(step.altPath)}
                  className="inline-flex min-h-12 items-center rounded-xl border px-4 text-sm font-medium"
                >
                  {t(`steps.${step.key}.altAction`)}
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-2 text-sm font-medium" data-testid="setup-progress">
          {t("progress", { done: state.doneCount, total: state.totalCount })}
        </p>
      </header>

      {isManager ? null : (
        <p className="mb-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          {t("managerOnlyHint")}
        </p>
      )}

      {/* §3.5: the rhythm shapes every schedule below it, so it comes first */}
      {isManager ? (
        <OperatingPatternForm
          siteId={site.id}
          pattern={parsePattern(site.operating_pattern)}
        />
      ) : null}

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("basicsTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("basicsHint")}</p>
        </CardHeader>
        <CardContent className="p-0">{basics.map(renderStep)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("takeoverTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("takeoverHint")}</p>
        </CardHeader>
        <CardContent className="p-0">{takeover.map(renderStep)}</CardContent>
      </Card>
    </main>
  );
}
