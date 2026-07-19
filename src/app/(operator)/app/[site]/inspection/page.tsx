import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { getInspectionSession } from "@/lib/actor/session";
import {
  getDeviationsData,
  getDocumentsData,
  getProgrammeData,
  getRecordsData,
} from "@/lib/inspection/data";
import { searchTrace } from "@/lib/inventory/trace";
import {
  DeviationsTab,
  DocumentsTab,
  ExportBar,
  InspectionNav,
  ProgrammeTab,
  RecordsTab,
  TraceTab,
  type InspectionTab,
  type TabContext,
} from "@/components/inspection/tabs";
import { EntryControls, ExitLockDialog, TrainingForm, UploadDocumentForm } from "./inspection-controls";
import { SiteNav } from "../site-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function defaultRange(): { fromDate: string; toDate: string } {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(today) - 89 * 86_400_000).toISOString().slice(0, 10);
  return { fromDate: from, toDate: today }; // "last 3 months" preset (§10.2)
}

export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { site: siteId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);
  const locked = (await getInspectionSession(siteId)) !== null;

  const [t, locale] = await Promise.all([getTranslations("inspection"), getLocale()]);

  const tab = ((sp.tab as InspectionTab) ?? "programme") as InspectionTab;
  const range = {
    fromDate: sp.from ?? defaultRange().fromDate,
    toDate: sp.to ?? defaultRange().toDate,
    category: sp.cat,
  };
  const basePath = `/app/${siteId}/inspection`;
  const tabCtx: TabContext = {
    basePath,
    locale,
    params: { tab, from: sp.from, to: sp.to, cat: sp.cat, q: sp.q },
    fileHref: (bucket, path) =>
      `${basePath}/file?bucket=${bucket}&path=${encodeURIComponent(path)}`,
    exportHref: (exportTab) =>
      `${basePath}/export?tab=${exportTab}&from=${range.fromDate}&to=${range.toDate}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`,
  };

  // managers who can unlock (exit requires manager PIN, §10.1)
  const { data: managers } = await supabase
    .from("memberships")
    .select("id, role, profile:profiles(full_name), site_ids")
    .eq("org_id", site.org_id)
    .in("role", [...MANAGER_ROLES])
    .not("accepted_at", "is", null);
  const unlockers = (managers ?? [])
    .filter((m) => m.site_ids === null || m.site_ids.includes(siteId))
    .map((m) => ({ id: m.id, name: m.profile?.full_name ?? "" }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      {locked ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary p-3 text-primary-foreground" data-testid="inspection-banner">
          <ShieldCheck className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm font-medium">{t("lockedBanner")}</p>
          <ExitLockDialog siteId={siteId} managers={unlockers} />
        </div>
      ) : (
        <SiteNav siteId={siteId} active="today" />
      )}

      {!locked ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("hint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <EntryControls siteId={siteId} isManager={isManager} />
            {isManager ? <UploadDocumentForm siteId={siteId} /> : null}
            {isManager ? <TrainingForm siteId={siteId} /> : null}
          </CardContent>
        </Card>
      ) : null}

      <InspectionNav ctx={tabCtx} active={tab} />
      <ExportBar ctx={tabCtx} tab={tab} />

      {tab === "programme" ? (
        <ProgrammeTab ctx={tabCtx} data={await getProgrammeData(supabase, siteId)} />
      ) : null}
      {tab === "records" ? (
        <RecordsTab
          ctx={tabCtx}
          data={await getRecordsData(supabase, siteId, range)}
          range={range}
        />
      ) : null}
      {tab === "deviations" ? (
        <DeviationsTab ctx={tabCtx} data={await getDeviationsData(supabase, siteId)} />
      ) : null}
      {tab === "trace" ? (
        <TraceTab
          ctx={tabCtx}
          query={sp.q ?? ""}
          results={sp.q ? await searchTrace(supabase, siteId, { query: sp.q }) : null}
        />
      ) : null}
      {tab === "documents" ? (
        <DocumentsTab ctx={tabCtx} data={await getDocumentsData(supabase, siteId)} />
      ) : null}
    </main>
  );
}
