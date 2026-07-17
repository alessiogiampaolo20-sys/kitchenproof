"use server";

import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { searchTrace } from "@/lib/inventory/trace";
import { RecallReportPdf, type RecallPdfData } from "@/lib/pdf/trace-docs";
import type { Json } from "@/lib/supabase/database.types";

const recallSchema = z.object({
  siteId: z.uuid(),
  query: z.string().trim().min(1).max(120),
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
  reason: z.string().trim().min(1).max(500),
});

export type RecallState =
  | { ok: true; url: string }
  | { error: "error" }
  | null;

/** §9.6: one-tap recall report — recall_events row + PDF in the exports bucket. */
export async function createRecallReport(input: unknown): Promise<RecallState> {
  const parsed = recallSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, address, city, postal_code, cvr_p_number")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) return { error: "error" };

  const { batches, moves } = await searchTrace(supabase, site.id, {
    query: parsed.data.query,
    fromDate: parsed.data.fromDate ?? undefined,
    toDate: parsed.data.toDate ?? undefined,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.user.id)
    .single();

  const t = await getTranslations("trace");
  const fmt = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");
  const pdfData: RecallPdfData = {
    siteName: site.name,
    siteAddress: [site.address, site.postal_code, site.city].filter(Boolean).join(", "),
    cvr: site.cvr_p_number ?? "",
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    initiatedBy: profile?.full_name ?? "",
    reason: parsed.data.reason,
    scopeDescription: [
      `"${parsed.data.query}"`,
      parsed.data.fromDate ? `${t("pdf.from")} ${parsed.data.fromDate}` : null,
      parsed.data.toDate ? `${t("pdf.to")} ${parsed.data.toDate}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    batches: batches.map((batch) => ({
      productName: batch.productName,
      lotCode: batch.lotCode,
      supplierName: batch.supplierName ?? "",
      invoiceNumber: batch.invoiceNumber ?? "",
      receivedAt: fmt(batch.receivedAt ?? batch.batchCreatedAt),
      quantity: `${batch.quantity} ${batch.unit}`,
      remaining: `${batch.remaining} ${batch.unit}`,
      status: batch.status,
    })),
    moves: moves.map((move) => ({
      productName: move.productName,
      lotCode: move.lotCode,
      kind: move.kind,
      quantity: String(move.quantity),
      movedAt: fmt(move.movedAt),
      detail: move.b2bCustomerName ?? move.reason ?? "",
    })),
    labels: {
      title: t("pdf.title"),
      scope: t("pdf.scope"),
      reason: t("pdf.reason"),
      initiatedBy: t("pdf.initiatedBy"),
      batchesTitle: t("pdf.batchesTitle"),
      movesTitle: t("pdf.movesTitle"),
      colProduct: t("pdf.colProduct"),
      colLot: t("pdf.colLot"),
      colSupplier: t("pdf.colSupplier"),
      colInvoice: t("pdf.colInvoice"),
      colReceived: t("pdf.colReceived"),
      colQty: t("pdf.colQty"),
      colRemaining: t("pdf.colRemaining"),
      colStatus: t("pdf.colStatus"),
      colKind: t("pdf.colKind"),
      colWhen: t("pdf.colWhen"),
      colDetail: t("pdf.colDetail"),
      footer: t("pdf.footer"),
    },
  };

  const buffer = await renderToBuffer(
    React.createElement(RecallReportPdf, { data: pdfData }) as React.ReactElement<DocumentProps>,
  );
  const path = `${site.id}/recalls/${Date.now()}-recall.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("exports")
    .upload(path, buffer, { contentType: "application/pdf" });
  if (uploadError) return { error: "error" };

  const { data: recall, error } = await supabase
    .from("recall_events")
    .insert({
      org_id: site.org_id,
      scope_json: {
        site_id: site.id,
        query: parsed.data.query,
        from: parsed.data.fromDate,
        to: parsed.data.toDate,
        batch_ids: batches.map((batch) => batch.batchId),
      } as Json,
      reason: parsed.data.reason,
      initiated_by: ctx.user.id,
      report_pdf_path: path,
    })
    .select("id")
    .single();
  if (error || !recall) return { error: "error" };

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "recall.initiated",
    entityTable: "recall_events",
    entityId: recall.id,
    diff: { query: parsed.data.query, batches: batches.length },
  });

  const { data: signed } = await supabase.storage
    .from("exports")
    .createSignedUrl(path, 3600);
  if (!signed) return { error: "error" };
  return { ok: true, url: signed.signedUrl };
}
