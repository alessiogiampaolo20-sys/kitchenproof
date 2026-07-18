import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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
import { Card, CardContent } from "@/components/ui/card";

function defaultRange(): { fromDate: string; toDate: string } {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(today) - 89 * 86_400_000).toISOString().slice(0, 10);
  return { fromDate: from, toDate: today };
}

/**
 * §10.1 inspector magic link — unauthenticated, read-only, 4h. The token is
 * the credential (definer RPC); reads go through a service client ALWAYS
 * scoped to the resolved site (CLAUDE.md decision log). Every view audited.
 */
export default async function InspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await getTranslations("inspection");

  const anon = await createClient();
  const { data: resolved } = await anon.rpc("resolve_inspector_link", { p_token: token });
  const link = resolved?.[0];
  if (!link) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 p-6">
        <Card>
          <CardContent className="py-8 text-center text-sm" data-testid="inspect-invalid">
            {t("linkInvalid")}
          </CardContent>
        </Card>
      </main>
    );
  }

  const siteId = link.site_id;
  const service = createServiceClient();

  // audit the access (actor = the manager who issued the link, role = guest)
  const { data: linkRow } = await service
    .from("inspector_links")
    .select("id, created_by, site:sites(org_id)")
    .eq("site_id", siteId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkRow?.site) {
    await service.from("audit_log").insert({
      org_id: linkRow.site.org_id,
      site_id: siteId,
      actor_id: linkRow.created_by,
      actor_role: "inspector_guest",
      action: "inspection.link_viewed",
      entity_table: "inspector_links",
      entity_id: linkRow.id,
      diff: { tab: sp.tab ?? "programme" },
    });
  }

  const tab = ((sp.tab as InspectionTab) ?? "programme") as InspectionTab;
  const range = {
    fromDate: sp.from ?? defaultRange().fromDate,
    toDate: sp.to ?? defaultRange().toDate,
    category: sp.cat,
  };
  const basePath = `/inspect/${token}`;
  const tabCtx: TabContext = {
    basePath,
    locale: "da", // Danish-first for the inspector (§10.2)
    params: { tab, from: sp.from, to: sp.to, cat: sp.cat, q: sp.q },
    fileHref: (bucket, path) =>
      `${basePath}/file?bucket=${bucket}&path=${encodeURIComponent(path)}`,
    exportHref: (exportTab) =>
      `${basePath}/export?tab=${exportTab}&from=${range.fromDate}&to=${range.toDate}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`,
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary p-3 text-primary-foreground" data-testid="inspect-header">
        <ShieldCheck className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{link.site_name}</p>
          <p className="text-xs opacity-90">
            {t("guestBanner", { time: (link.expires_at as string).slice(11, 16) })}
          </p>
        </div>
      </div>

      <InspectionNav ctx={tabCtx} active={tab} />
      <ExportBar ctx={tabCtx} tab={tab} />

      {tab === "programme" ? (
        <ProgrammeTab ctx={tabCtx} data={await getProgrammeData(service, siteId)} />
      ) : null}
      {tab === "records" ? (
        <RecordsTab
          ctx={tabCtx}
          data={await getRecordsData(service, siteId, range)}
          range={range}
        />
      ) : null}
      {tab === "deviations" ? (
        <DeviationsTab ctx={tabCtx} data={await getDeviationsData(service, siteId)} />
      ) : null}
      {tab === "trace" ? (
        <TraceTab
          ctx={tabCtx}
          query={sp.q ?? ""}
          results={sp.q ? await searchTrace(service, siteId, { query: sp.q }) : null}
        />
      ) : null}
      {tab === "documents" ? (
        <DocumentsTab ctx={tabCtx} data={await getDocumentsData(service, siteId)} />
      ) : null}
    </main>
  );
}
