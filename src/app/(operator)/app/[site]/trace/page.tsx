import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SearchCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { searchTrace } from "@/lib/inventory/trace";
import { SiteNav } from "../site-nav";
import { RecallButton } from "./recall-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function TracePage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const { site: siteId } = await params;
  const { q, from, to } = await searchParams;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const hasQuery = Boolean(q?.trim());
  const results = hasQuery
    ? await searchTrace(supabase, siteId, {
        query: q!.trim(),
        fromDate: from,
        toDate: to,
      })
    : null;

  const t = await getTranslations("trace");
  const fmt = (iso: string | null) =>
    iso ? iso.slice(0, 16).replace("T", " ") : "";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <SiteNav siteId={siteId} active="stock" />

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <SearchCheck className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* GET form: shareable, server-rendered, no client state */}
          <form className="grid gap-2" action={`/app/${siteId}/trace`} method="get">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchPlaceholder")}
              className="min-h-12"
              data-testid="trace-query"
            />
            <div className="flex gap-2">
              <Input name="from" type="date" defaultValue={from ?? ""} className="min-h-12" />
              <Input name="to" type="date" defaultValue={to ?? ""} className="min-h-12" />
              <Button type="submit" size="lg" className="min-h-12" data-testid="trace-search">
                {t("searchButton")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {results ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground" data-testid="trace-count">
              {t("resultCount", { batches: results.batches.length, moves: results.moves.length })}
            </p>
            {isManager && results.batches.length > 0 ? (
              <RecallButton
                siteId={siteId}
                query={q!.trim()}
                fromDate={from ?? null}
                toDate={to ?? null}
              />
            ) : null}
          </div>

          <section className="mb-6 grid gap-2">
            <h2 className="font-medium">{t("inTitle")}</h2>
            {results.batches.map((batch) => (
              <Card key={batch.batchId} data-testid="trace-batch">
                <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      href={`/app/${siteId}/stock/batch/${batch.batchId}`}
                    >
                      {batch.productName} · {batch.lotCode}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {batch.supplierName ?? t("inHouse")}
                      {batch.invoiceNumber ? ` · ${t("invoice")} ${batch.invoiceNumber}` : ""}
                      {" · "}
                      {fmt(batch.receivedAt ?? batch.batchCreatedAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {batch.remaining}/{batch.quantity} {batch.unit}
                  </Badge>
                  <Badge variant={batch.status === "active" ? "default" : "outline"}>
                    {t(`status.${batch.status}`)}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </section>

          {results.moves.length > 0 ? (
            <section className="grid gap-1">
              <h2 className="font-medium">{t("outTitle")}</h2>
              {results.moves.map((move, i) => (
                <p key={i} className="text-sm" data-testid="trace-move">
                  {fmt(move.movedAt)} — {move.productName} ({move.lotCode}):{" "}
                  {t(`moves.${move.kind}`)} {move.quantity}
                  {move.b2bCustomerName ? ` → ${move.b2bCustomerName}` : ""}
                  {move.reason ? ` (${t(`wasteReasons.${move.reason}`)})` : ""} ·{" "}
                  {move.movedBy}
                </p>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
      )}
    </main>
  );
}
