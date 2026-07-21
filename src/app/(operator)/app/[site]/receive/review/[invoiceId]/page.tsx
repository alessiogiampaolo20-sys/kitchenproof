import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { totalMismatch } from "@/lib/inventory/matching";
import { invoiceExtractionSchema } from "@/lib/ai/schemas";
import { InvoiceReview } from "./review-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ site: string; invoiceId: string }>;
}) {
  const { site: siteId, invoiceId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, kind, status, invoice_number, invoice_date, total_amount, currency, duplicate_of_id, extraction_json, file_paths, supplier:suppliers(id, name, ai_created)",
    )
    .eq("id", invoiceId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!invoice || invoice.status !== "needs_review") {
    redirect(`/app/${siteId}/receive`);
  }

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select(
      "id, line_no, raw_text, description, quantity, unit, unit_price, lot_code, is_food, match_confidence, needs_review, page, product_id, product:products(id, name, ai_created, allergens, allergens_ai_suggested)",
    )
    .eq("invoice_id", invoiceId)
    .order("line_no");

  // candidate products for corrections (org catalog, unmerged)
  const { data: catalog } = await supabase
    .from("products")
    .select("id, name")
    .eq("org_id", site.org_id)
    .is("merged_into_id", null)
    .order("name");

  const originals: { name: string; url: string }[] = [];
  for (const path of invoice.file_paths) {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 3600);
    if (data) originals.push({ name: path.split("/").pop() ?? path, url: data.signedUrl });
  }

  const extraction = invoiceExtractionSchema.safeParse(invoice.extraction_json);
  const mismatch = extraction.success ? totalMismatch(extraction.data) : null;

  const t = await getTranslations("receive");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="size-5 text-primary" />
            {invoice.supplier?.name ?? t("unknownSupplier")}
            {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
          </CardTitle>
          <CardDescription>
            {t(`kinds.${invoice.kind}`)}
            {invoice.invoice_date ? ` · ${invoice.invoice_date}` : ""}
            {invoice.total_amount !== null
              ? ` · ${invoice.total_amount} ${invoice.currency ?? ""}`
              : ""}
          </CardDescription>
        </CardHeader>
      </Card>
      <InvoiceReview
        siteId={siteId}
        invoiceId={invoiceId}
        kind={invoice.kind}
        isDuplicate={invoice.duplicate_of_id !== null}
        totalMismatchPct={mismatch !== null && mismatch > 0.02 ? Math.round(mismatch * 100) : null}
        lines={(lines ?? []).map((line) => ({
          id: line.id,
          lineNo: line.line_no,
          rawText: line.raw_text,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          lotCode: line.lot_code,
          isFood: line.is_food,
          confidence: line.match_confidence,
          needsReview: line.needs_review,
          page: line.page,
          productId: line.product_id,
          productName: line.product?.name ?? null,
          productIsNew: line.product?.ai_created ?? false,
          allergens: line.product?.allergens ?? [],
          allergensAiSuggested: line.product?.allergens_ai_suggested ?? false,
        }))}
        catalog={catalog ?? []}
        originals={originals}
      />
    </main>
  );
}

// AI extractions can run long — lift the Vercel function limit (fluid compute).
export const maxDuration = 300;
