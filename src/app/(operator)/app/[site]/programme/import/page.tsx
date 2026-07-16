import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { SiteNav } from "../../site-nav";
import { ImportUpload } from "./import-upload";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) redirect(`/app/${siteId}/programme`);

  const { data: imports } = await supabase
    .from("ra_imports")
    .select("id, kind, status, file_paths, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(20);

  const t = await getTranslations("importRa");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <SiteNav siteId={siteId} active="programme" />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportUpload siteId={siteId} />
        </CardContent>
      </Card>

      {(imports ?? []).length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-medium">{t("previousTitle")}</h2>
          {(imports ?? []).map((imp) => (
            <Card key={imp.id} data-testid="import-row">
              <CardContent className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t(`kinds.${imp.kind}`)} · {imp.file_paths.length}{" "}
                    {t("filesSuffix")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(imp.created_at).toLocaleDateString("da-DK")}
                  </p>
                </div>
                <Badge
                  variant={
                    imp.status === "confirmed"
                      ? "default"
                      : imp.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {t(`status.${imp.status}`)}
                </Badge>
                {imp.status === "needs_review" ? (
                  <Link
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href={`/app/${siteId}/programme/import/review/${imp.id}`}
                  >
                    {t("reviewLink")}
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}
