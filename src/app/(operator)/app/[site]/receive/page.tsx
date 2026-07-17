import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Camera, PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { SiteNav } from "../site-nav";
import { InvoiceUpload } from "./invoice-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ReceivePage({
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
  if (!ctx) redirect("/");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, kind, status, invoice_number, total_amount, currency, duplicate_of_id, created_at, supplier:suppliers(name)")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(20);

  const t = await getTranslations("receive");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <SiteNav siteId={siteId} active="receive" />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <InvoiceUpload siteId={siteId} />
          <Button asChild variant="outline" size="lg" className="min-h-14" data-testid="quick-receive-link">
            <Link href={`/app/${siteId}/receive/quick`}>
              <PackagePlus className="size-4" />
              {t("quickButton")}
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">{t("quickHint")}</p>
        </CardContent>
      </Card>

      {(invoices ?? []).length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-medium">{t("recentTitle")}</h2>
          {(invoices ?? []).map((invoice) => (
            <Card key={invoice.id} data-testid="invoice-row">
              <CardContent className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {invoice.supplier?.name ?? t("unknownSupplier")}
                    {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`kinds.${invoice.kind}`)} ·{" "}
                    {new Date(invoice.created_at).toLocaleDateString("da-DK")}
                    {invoice.total_amount !== null
                      ? ` · ${invoice.total_amount} ${invoice.currency ?? ""}`
                      : ""}
                  </p>
                </div>
                {invoice.duplicate_of_id ? (
                  <Badge variant="destructive" data-testid="duplicate-badge">
                    {t("duplicateBadge")}
                  </Badge>
                ) : null}
                <Badge
                  variant={
                    invoice.status === "confirmed"
                      ? "default"
                      : invoice.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {t(`status.${invoice.status}`)}
                </Badge>
                {invoice.status === "needs_review" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/app/${siteId}/receive/review/${invoice.id}`}>
                      {t("reviewLink")}
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}
