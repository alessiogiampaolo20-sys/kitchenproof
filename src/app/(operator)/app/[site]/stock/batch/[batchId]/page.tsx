import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { ExternalLink, PackageSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { SiteNav } from "../../../site-nav";
import { PrintLabelButton } from "./print-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function BatchPage({
  params,
}: {
  params: Promise<{ site: string; batchId: string }>;
}) {
  const { site: siteId, batchId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");

  // §6.6 flattened provenance: batch → receipt → invoice → supplier
  const { data: trace } = await supabase
    .from("v_traceability_lookup")
    .select("*")
    .eq("batch_id", batchId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!trace) redirect(`/app/${siteId}/stock`);

  const [{ data: batch }, { data: moves }, { data: parents }] = await Promise.all([
    supabase
      .from("batches")
      .select("id, label_printed, expiry_kind, goods_receipt_id, parent_batch_ids")
      .eq("id", batchId)
      .single(),
    supabase
      .from("inventory_moves")
      .select("id, kind, quantity, reason, moved_at, mover:profiles!inventory_moves_moved_by_fkey(full_name)")
      .eq("batch_id", batchId)
      .order("moved_at", { ascending: false }),
    supabase
      .from("v_traceability_lookup")
      .select("batch_id, lot_code, product_name")
      .eq("site_id", siteId),
  ]);

  const parentIds = new Set(batch?.parent_batch_ids ?? []);
  const parentBatches = (parents ?? []).filter(
    (p) => p.batch_id !== null && parentIds.has(p.batch_id),
  );

  // invoice original: the inspector wow-moment — 2 taps from stock (§9.2)
  let invoiceUrl: string | null = null;
  if (trace.invoice_id) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("file_paths")
      .eq("id", trace.invoice_id)
      .single();
    if (invoice?.file_paths[0]) {
      const { data } = await supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.file_paths[0], 3600);
      invoiceUrl = data?.signedUrl ?? null;
    }
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const labelUrl = `${proto}://${host}/app/${siteId}/stock/batch/${batchId}`;
  const qrSvg = await QRCode.toString(labelUrl, { type: "svg", margin: 1, width: 120 });

  const [t, locale] = await Promise.all([getTranslations("stock"), getLocale()]);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <div className="print:hidden">
        <SiteNav siteId={siteId} active="stock" />

        <Card className="mb-4" data-testid="batch-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="size-5 text-primary" />
              {trace.product_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono" data-testid="batch-lot">
                {trace.lot_code}
              </Badge>
              <Badge variant="secondary">
                {trace.remaining} / {trace.quantity} {trace.unit}
              </Badge>
              {trace.expiry_date ? (
                <Badge variant={batch?.expiry_kind === "internal" ? "secondary" : "default"}>
                  {batch?.expiry_kind === "internal" ? t("internalExpiry") : t("expiry")}{" "}
                  {trace.expiry_date}
                </Badge>
              ) : null}
              <Badge variant="outline">{t(`origins.${trace.origin}`)}</Badge>
            </div>
            {(trace.allergens ?? []).length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("allergens")}: {(trace.allergens ?? []).join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* provenance chain (§9.2) */}
        <Card className="mb-4" data-testid="provenance-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("provenanceTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {trace.supplier_name ? (
              <p>
                {t("supplier")}: <span className="font-medium">{trace.supplier_name}</span>
                {trace.supplier_cvr ? ` · CVR ${trace.supplier_cvr}` : ""}
              </p>
            ) : null}
            {trace.received_at ? <p>{t("receivedAt")}: {fmt(trace.received_at)}</p> : null}
            {trace.invoice_number ? (
              <p>
                {t("invoice")}: {trace.invoice_number}
                {trace.invoice_date ? ` (${trace.invoice_date})` : ""}
              </p>
            ) : null}
            {invoiceUrl ? (
              <Button asChild variant="outline" size="sm" className="justify-self-start">
                <a href={invoiceUrl} target="_blank" rel="noreferrer" data-testid="invoice-original-link">
                  <ExternalLink className="size-3.5" />
                  {t("openInvoice")}
                </a>
              </Button>
            ) : null}
            {parentBatches.length > 0 ? (
              <div className="grid gap-1">
                <p className="font-medium">{t("madeFrom")}</p>
                {parentBatches.map((parent) => (
                  <Link
                    key={parent.batch_id}
                    className="text-primary underline-offset-4 hover:underline"
                    href={`/app/${siteId}/stock/batch/${parent.batch_id}`}
                    data-testid="parent-batch-link"
                  >
                    {parent.product_name} · {parent.lot_code}
                  </Link>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* movement ledger (append-only) */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("movesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {(moves ?? []).map((move) => (
              <p key={move.id} data-testid="move-row">
                {fmt(move.moved_at)} — {t(`moves.${move.kind}`)} {move.quantity > 0 ? "+" : ""}
                {move.quantity}
                {move.reason ? ` (${t(`wasteReasons.${move.reason}`)})` : ""} ·{" "}
                {(move.mover as { full_name: string } | null)?.full_name ?? ""}
              </p>
            ))}
          </CardContent>
        </Card>

        <PrintLabelButton
          siteId={siteId}
          batchId={batchId}
          alreadyPrinted={batch?.label_printed ?? false}
        />
      </div>

      {/* §9.2 printable label: QR + product + lot + expiry */}
      <div className="hidden print:block">
        <div className="grid w-64 gap-1 border p-3 text-center">
          <div
            className="mx-auto"
            // qrcode emits a self-contained SVG
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-lg font-bold">{trace.product_name}</p>
          <p className="font-mono text-sm">{trace.lot_code}</p>
          {trace.expiry_date ? (
            <p className="text-sm">
              {batch?.expiry_kind === "internal" ? t("internalExpiry") : t("expiry")}:{" "}
              {trace.expiry_date}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
