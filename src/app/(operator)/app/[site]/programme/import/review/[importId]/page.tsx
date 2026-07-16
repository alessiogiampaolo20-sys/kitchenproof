import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FileSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { loadPackVersion } from "@/lib/compliance/pack";
import { importExtractionSchema } from "@/lib/ai/schemas";
import type { ImportGapReport } from "@/lib/compliance/import-mapper";
import { pickText } from "@/lib/i18n/pick";
import { SiteNav } from "../../../../site-nav";
import { ImportReview } from "./review-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ site: string; importId: string }>;
}) {
  const { site: siteId, importId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, compliance_pack")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) redirect(`/app/${siteId}/programme`);

  const { data: imp } = await supabase
    .from("ra_imports")
    .select("id, status, extraction_json, gap_report_json, file_paths")
    .eq("id", importId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!imp || imp.status !== "needs_review") {
    redirect(`/app/${siteId}/programme/import`);
  }
  const extraction = importExtractionSchema.safeParse(imp.extraction_json);
  if (!extraction.success) redirect(`/app/${siteId}/programme/import`);
  const gapReport = (imp.gap_report_json ?? {
    missingSections: [],
    emptyCriticalCells: [],
    lowConfidenceRows: [],
    unreadableCheckboxes: [],
    unreadableNotes: [],
  }) as ImportGapReport;

  const [{ pack }, locale, t] = await Promise.all([
    loadPackVersion(supabase, site.compliance_pack),
    getLocale(),
    getTranslations("importRa"),
  ]);
  const sections = pack.officialSkema.sections.map((section) => ({
    key: section.key,
    label: pickText(section.name as never, locale) || section.key,
  }));

  // originals stay viewable during review (§7.5 provenance)
  const originals: { name: string; url: string }[] = [];
  for (const path of imp.file_paths) {
    const { data } = await supabase.storage.from("imports").createSignedUrl(path, 3600);
    if (data) originals.push({ name: path.split("/").pop() ?? path, url: data.signedUrl });
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <SiteNav siteId={siteId} active="programme" />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="size-5 text-primary" />
            {t("reviewTitle")}
          </CardTitle>
          <CardDescription>{t("reviewHint")}</CardDescription>
        </CardHeader>
      </Card>
      <ImportReview
        siteId={siteId}
        importId={importId}
        initialRows={extraction.data.rows}
        gapReport={gapReport}
        sections={sections}
        originals={originals}
      />
    </main>
  );
}
