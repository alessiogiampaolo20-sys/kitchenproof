"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext } from "@/lib/tenancy";
import { getActorSession } from "@/lib/actor/session";
import { AiError } from "@/lib/ai/provider";
import { markAiOutcome } from "@/lib/ai/run";
import {
  enrichNewProducts,
  extractInvoiceFiles,
  invoiceFixtureKey,
} from "@/lib/ai/runners/invoice";
import {
  matchProduct,
  matchSupplier,
  totalNeedsReview,
  type PurchaseHistoryEntry,
} from "@/lib/inventory/matching";
import { normalizeName } from "@/lib/inventory/similarity";
import { planBatch } from "@/lib/inventory/batch-plan";
import {
  confirmInvoiceInputSchema,
  extractInvoiceInputSchema,
  quickReceiveInputSchema,
} from "@/lib/schemas/receive";
import { invoiceExtractionSchema, type InvoiceLine } from "@/lib/ai/schemas";
import type { Json } from "@/lib/supabase/database.types";

const FILE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type ReceiveActionState =
  | { ok: true; invoiceId: string }
  | { error: "error" | "aiUnavailable" | "badFile" | "noActor" }
  | null;

async function siteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return null;
  return { supabase, site, ctx };
}

/** §9.1: upload the original (permanent) and open the invoice record. */
export async function createInvoiceAction(
  _prev: ReceiveActionState,
  formData: FormData,
): Promise<ReceiveActionState> {
  const siteId = z.uuid().safeParse(formData.get("siteId"));
  if (!siteId.success) return { error: "error" };
  const sc = await siteContext(siteId.data);
  if (!sc) return { error: "error" };

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0 || files.length > 10) return { error: "badFile" };
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTENSIONS.has(ext) || file.size > MAX_FILE_BYTES) {
      return { error: "badFile" };
    }
  }

  const ref = randomUUID();
  const filePaths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-æøåÆØÅ]/g, "_");
    const path = `${sc.site.id}/invoices/${ref}/${safeName}`;
    const { error } = await sc.supabase.storage
      .from("invoices")
      .upload(path, file, { contentType: file.type || undefined });
    if (error) return { error: "error" };
    filePaths.push(path);
  }

  const { data: invoice, error } = await sc.supabase
    .from("invoices")
    .insert({ site_id: sc.site.id, file_paths: filePaths, page_count: files.length })
    .select("id")
    .single();
  if (error || !invoice) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "invoice.uploaded",
    entityTable: "invoices",
    entityId: invoice.id,
    diff: { files: filePaths.length },
  });

  revalidatePath(`/app/${sc.site.id}/receive`);
  return { ok: true, invoiceId: invoice.id };
}

/** §9.1: extraction → supplier/product matching → enrichment → needs_review. */
export async function extractInvoiceAction(input: unknown): Promise<ReceiveActionState> {
  const parsed = extractInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: invoice } = await sc.supabase
    .from("invoices")
    .select("id, file_paths, status")
    .eq("id", parsed.data.invoiceId)
    .eq("site_id", sc.site.id)
    .maybeSingle();
  if (!invoice || invoice.status === "confirmed") return { error: "error" };

  await sc.supabase.from("invoices").update({ status: "extracting" }).eq("id", invoice.id);

  let extraction;
  try {
    extraction = await extractInvoiceFiles({
      supabase: sc.supabase,
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      invoiceId: invoice.id,
      filePaths: invoice.file_paths,
    });
  } catch (err) {
    await sc.supabase.from("invoices").update({ status: "failed" }).eq("id", invoice.id);
    await writeAudit(sc.supabase, {
      orgId: sc.site.org_id,
      siteId: sc.site.id,
      actorId: sc.ctx.user.id,
      actorRole: sc.ctx.role,
      action: "invoice.extraction_failed",
      entityTable: "invoices",
      entityId: invoice.id,
      diff: { error: err instanceof Error ? err.message : "unknown" },
    });
    return { error: err instanceof AiError ? "aiUnavailable" : "error" };
  }

  // ── supplier match (deterministic, §9.1 step 1) ────────────────────────────
  const { data: supplierCandidates } = await sc.supabase
    .from("suppliers")
    .select("id, name, cvr, postal_code")
    .eq("org_id", sc.site.org_id);
  const supplierMatch = matchSupplier(extraction.supplier, supplierCandidates ?? []);
  let supplierId: string;
  if (supplierMatch.action === "matched") {
    supplierId = supplierMatch.supplierId;
  } else {
    const { data: created, error } = await sc.supabase
      .from("suppliers")
      .insert({
        org_id: sc.site.org_id,
        name: extraction.supplier.name,
        cvr: extraction.supplier.cvr,
        address: extraction.supplier.address,
        city: extraction.supplier.city,
        postal_code: extraction.supplier.postal,
        country: extraction.supplier.country ?? "DK",
        email: extraction.supplier.email,
        ai_created: true, // §9.1: review-optional
      })
      .select("id")
      .single();
    if (error || !created) return { error: "error" };
    supplierId = created.id;
  }

  // ── duplicate detection (§9.1 edge case: warn & diff, never block) ─────────
  let duplicateOfId: string | null = null;
  if (extraction.invoiceNumber) {
    const { data: dup } = await sc.supabase
      .from("invoices")
      .select("id")
      .eq("site_id", sc.site.id)
      .eq("supplier_id", supplierId)
      .eq("invoice_number", extraction.invoiceNumber)
      .in("status", ["needs_review", "confirmed"])
      .neq("id", invoice.id)
      .limit(1)
      .maybeSingle();
    duplicateOfId = dup?.id ?? null;
  }

  // ── product match (deterministic, §9.1 step 2) ─────────────────────────────
  const [{ data: catalog }, { data: historyRows }] = await Promise.all([
    sc.supabase
      .from("products")
      .select("id, normalized_name, merged_into_id")
      .eq("org_id", sc.site.org_id),
    sc.supabase
      .from("invoice_lines")
      .select("raw_text, product_id, invoice:invoices!inner(supplier_id)")
      .eq("invoice.site_id", sc.site.id)
      .eq("invoice.supplier_id", supplierId)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const history: PurchaseHistoryEntry[] = (historyRows ?? []).map((row) => ({
    supplier_id: supplierId,
    raw_text: row.raw_text,
    product_id: row.product_id!,
  }));

  const matches = extraction.lines.map((line) =>
    matchProduct(line, supplierId, catalog ?? [], history),
  );

  // ── new-product enrichment (AI, §9.1 step 3) — human confirms in review ────
  const newFoodLines = matches.filter((m) => m.action === "create" && m.line.isFood);
  const productIdByDescription = new Map<string, string>();
  if (newFoodLines.length > 0) {
    let enrichment;
    try {
      enrichment = await enrichNewProducts({
        supabase: sc.supabase,
        orgId: sc.site.org_id,
        siteId: sc.site.id,
        invoiceId: invoice.id,
        descriptions: [...new Set(newFoodLines.map((m) => m.line.description))],
        fixtureKey: `enrich-${invoiceFixtureKey(invoice.file_paths)}`,
      });
    } catch {
      enrichment = { products: [] }; // enrichment is optional — defaults below
    }
    for (const description of new Set(newFoodLines.map((m) => m.line.description))) {
      const enriched = enrichment.products.find((p) => p.description === description);
      const { data: created, error } = await sc.supabase
        .from("products")
        .insert({
          org_id: sc.site.org_id,
          name: description,
          normalized_name: normalizeName(description),
          category: enriched?.category ?? "other",
          storage_type: enriched?.storageType ?? "ambient",
          default_shelf_life_days: enriched?.shelfLifeDays ?? null,
          allergens: enriched?.allergens ?? [],
          allergens_ai_suggested: (enriched?.allergens.length ?? 0) > 0,
          unit_default: enriched?.unitDefault ?? "pcs",
          is_food: true,
          ai_created: true,
        })
        .select("id")
        .single();
      if (error || !created) return { error: "error" };
      productIdByDescription.set(description, created.id);
    }
  }

  // ── persist lines with match state ─────────────────────────────────────────
  const reviewAll = totalNeedsReview(extraction); // §9.1: >2% mismatch
  const lineInserts = matches.map((match, index) => {
    const line = match.line;
    const productId =
      match.productId ??
      (line.isFood ? (productIdByDescription.get(line.description) ?? null) : null);
    return {
      invoice_id: invoice.id,
      line_no: index + 1,
      raw_text: line.rawText,
      product_id: productId,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unitPrice,
      lot_code: line.lotCode,
      gtin: line.gtin,
      is_food: line.isFood,
      match_confidence: match.confidence,
      needs_review:
        reviewAll ||
        match.action !== "auto" ||
        line.confidence < 0.6,
      page: line.page,
    };
  });
  if (lineInserts.length > 0) {
    const { error } = await sc.supabase.from("invoice_lines").insert(lineInserts);
    if (error) return { error: "error" };
  }

  const { error: updateError } = await sc.supabase
    .from("invoices")
    .update({
      status: "needs_review",
      kind: extraction.documentKind,
      supplier_id: supplierId,
      invoice_number: extraction.invoiceNumber,
      invoice_date: extraction.invoiceDate,
      total_amount: extraction.totalAmount,
      currency: extraction.currency,
      duplicate_of_id: duplicateOfId,
      extraction_json: extraction as unknown as Json,
    })
    .eq("id", invoice.id);
  if (updateError) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "invoice.extracted",
    entityTable: "invoices",
    entityId: invoice.id,
    diff: {
      kind: extraction.documentKind,
      lines: extraction.lines.length,
      new_products: productIdByDescription.size,
      duplicate_of: duplicateOfId,
    },
  });

  revalidatePath(`/app/${sc.site.id}/receive`);
  return { ok: true, invoiceId: invoice.id };
}

/** Shared: goods receipt + optional §9.3 receiving-check completion. */
async function writeReceiptWithCheck(args: {
  sc: NonNullable<Awaited<ReturnType<typeof siteContext>>>;
  actorProfileId: string;
  actorRole: string;
  supplierId: string | null;
  invoiceId: string | null;
  receiving: { tempReading: number | null; transportTempOk: boolean | null; packagingOk: boolean | null } | null;
}): Promise<string | null> {
  const { sc } = args;
  const { data: receipt, error } = await sc.supabase
    .from("goods_receipts")
    .insert({
      site_id: sc.site.id,
      supplier_id: args.supplierId,
      invoice_id: args.invoiceId,
      received_by: args.actorProfileId,
      transport_temp_ok: args.receiving?.transportTempOk ?? null,
      packaging_ok: args.receiving?.packagingOk ?? null,
      temp_reading: args.receiving?.tempReading ?? null,
    })
    .select("id")
    .single();
  if (error || !receipt) return null;

  // §9.3: one action, two obligations — the receiving check is also a CP record
  if (args.receiving) {
    const { data: cp } = await sc.supabase
      .from("control_points")
      .select("id")
      .eq("site_id", sc.site.id)
      .eq("template_key", "receiving_check")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (cp) {
      const passed =
        args.receiving.transportTempOk !== false &&
        args.receiving.packagingOk !== false;
      await sc.supabase.from("task_completions").insert({
        site_id: sc.site.id,
        control_point_id: cp.id,
        performed_by: args.actorProfileId,
        value_json: {
          receiving: true,
          temp_c: args.receiving.tempReading,
          transport_temp_ok: args.receiving.transportTempOk,
          packaging_ok: args.receiving.packagingOk,
        } as Json,
        passed,
      });
    }
  }

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: args.actorProfileId,
    actorRole: args.actorRole,
    action: "goods_receipt.created",
    entityTable: "goods_receipts",
    entityId: receipt.id,
    diff: { invoice_id: args.invoiceId, with_check: args.receiving !== null },
  });
  return receipt.id;
}

export type ConfirmInvoiceState =
  | { ok: true; batches: number }
  | { error: "error" | "noActor" }
  | null;

/** §9.1 confirm: goods receipt + batches + moves; credit notes adjust stock. */
export async function confirmInvoiceAction(input: unknown): Promise<ConfirmInvoiceState> {
  const parsed = confirmInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" }; // receiving is person-attributed (§4.2)

  const { data: invoice } = await sc.supabase
    .from("invoices")
    .select("id, status, kind, supplier_id, invoice_number, extraction_json")
    .eq("id", parsed.data.invoiceId)
    .eq("site_id", sc.site.id)
    .maybeSingle();
  if (!invoice || invoice.status !== "needs_review") return { error: "error" };

  const { data: lines } = await sc.supabase
    .from("invoice_lines")
    .select("id, line_no, product_id, quantity, unit, lot_code, is_food, description")
    .eq("invoice_id", invoice.id)
    .order("line_no");
  if (!lines) return { error: "error" };

  const extraction = invoiceExtractionSchema.safeParse(invoice.extraction_json);
  const extractionLines: InvoiceLine[] = extraction.success ? extraction.data.lines : [];

  // apply review corrections (lines are frozen after confirm — do this first)
  let edited = false;
  const decisions = new Map(parsed.data.lines.map((l) => [l.lineId, l]));
  for (const line of lines) {
    const decision = decisions.get(line.id);
    if (!decision) continue;
    if (decision.productId !== line.product_id) {
      edited = true;
      const { error } = await sc.supabase
        .from("invoice_lines")
        .update({ product_id: decision.productId, needs_review: false })
        .eq("id", line.id);
      if (error) return { error: "error" };
      line.product_id = decision.productId;
    }
  }

  const receiptId = await writeReceiptWithCheck({
    sc,
    actorProfileId: actor.profileId,
    actorRole: actor.role,
    supplierId: invoice.supplier_id,
    invoiceId: invoice.id,
    receiving: parsed.data.receiving,
  });
  if (!receiptId) return { error: "error" };

  const included = lines.filter((line) => {
    const decision = decisions.get(line.id);
    const include = decision ? decision.include : line.is_food;
    return include && line.product_id !== null;
  });

  let batchCount = 0;
  for (const line of included) {
    const extractionLine = extractionLines[line.line_no - 1] ?? null;

    if (invoice.kind === "credit_note") {
      // §9.1: credit notes create negative adjustments against existing stock
      const quantity = Math.abs(line.quantity ?? 0);
      if (quantity === 0) continue;
      let query = sc.supabase
        .from("batches")
        .select("id, remaining")
        .eq("site_id", sc.site.id)
        .eq("product_id", line.product_id!)
        .eq("status", "active")
        .gt("remaining", 0);
      if (line.lot_code) query = query.eq("lot_code", line.lot_code);
      const { data: batch } = await query
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!batch) continue; // nothing in stock to adjust — receipt keeps the paper trail
      const adjusted = Math.min(Number(batch.remaining), quantity);
      await sc.supabase.from("inventory_moves").insert({
        site_id: sc.site.id,
        batch_id: batch.id,
        kind: "correction",
        quantity: -adjusted,
        moved_by: actor.profileId,
        note: `credit note ${invoice.invoice_number ?? ""}`.trim(),
      });
      const remaining = Number(batch.remaining) - adjusted;
      await sc.supabase
        .from("batches")
        .update({ remaining, status: remaining === 0 ? "finished" : "active" })
        .eq("id", batch.id);
      continue;
    }

    // §9.1 step 4: batch per food line
    const { data: product } = await sc.supabase
      .from("products")
      .select("default_shelf_life_days")
      .eq("id", line.product_id!)
      .single();
    const plan = planBatch({
      line:
        extractionLine ??
        ({
          rawText: line.description,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit as InvoiceLine["unit"],
          unitsPerBox: null,
          unitPrice: null,
          lineTotal: null,
          lotCode: line.lot_code,
          expiryDate: null,
          gtin: null,
          isFood: line.is_food,
          confidence: 1,
          page: 1,
        } satisfies InvoiceLine),
      lineNo: line.line_no,
      invoiceNumber: invoice.invoice_number,
      receivedAtIso: new Date().toISOString(),
      defaultShelfLifeDays: product?.default_shelf_life_days ?? null,
    });
    const { data: batch, error: batchError } = await sc.supabase
      .from("batches")
      .insert({
        site_id: sc.site.id,
        product_id: line.product_id!,
        goods_receipt_id: receiptId,
        lot_code: plan.lotCode,
        quantity: plan.quantity,
        unit: plan.unit,
        remaining: plan.quantity,
        expiry_date: plan.expiryDate,
        expiry_kind: plan.expiryKind,
        origin: "received",
      })
      .select("id")
      .single();
    if (batchError || !batch) return { error: "error" };
    await sc.supabase.from("inventory_moves").insert({
      site_id: sc.site.id,
      batch_id: batch.id,
      kind: "receive",
      quantity: plan.quantity,
      moved_by: actor.profileId,
    });
    batchCount++;
  }

  const { error: confirmError } = await sc.supabase
    .from("invoices")
    .update({ status: "confirmed", confirmed_by: actor.profileId })
    .eq("id", invoice.id);
  if (confirmError) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: actor.profileId,
    actorRole: actor.role,
    action: "invoice.confirmed",
    entityTable: "invoices",
    entityId: invoice.id,
    diff: { batches: batchCount, kind: invoice.kind, edited },
  });
  await markAiOutcome(
    sc.supabase,
    { orgId: sc.site.org_id, feature: "invoice_extract", inputRef: `invoice:${invoice.id}` },
    { accepted: true, edited },
  );

  revalidatePath(`/app/${sc.site.id}/receive`);
  revalidatePath(`/app/${sc.site.id}/stock`);
  return { ok: true, batches: batchCount };
}

export type QuickReceiveState =
  | { ok: true }
  | { error: "error" | "noActor" }
  | null;

/** §9.3: deliveries without invoice — still 100% traceable. */
export async function quickReceiveAction(input: unknown): Promise<QuickReceiveState> {
  const parsed = quickReceiveInputSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  let supplierId = parsed.data.supplierId;
  if (!supplierId && parsed.data.supplierName) {
    const { data: created, error } = await sc.supabase
      .from("suppliers")
      .insert({ org_id: sc.site.org_id, name: parsed.data.supplierName })
      .select("id")
      .single();
    if (error || !created) return { error: "error" };
    supplierId = created.id;
  }
  if (!supplierId) return { error: "error" };

  const receiptId = await writeReceiptWithCheck({
    sc,
    actorProfileId: actor.profileId,
    actorRole: actor.role,
    supplierId,
    invoiceId: null,
    receiving: parsed.data.receiving,
  });
  if (!receiptId) return { error: "error" };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (const [index, line] of parsed.data.lines.entries()) {
    const { data: product } = await sc.supabase
      .from("products")
      .select("default_shelf_life_days")
      .eq("id", line.productId)
      .single();
    const plan = planBatch({
      line: {
        rawText: "quick receive",
        description: "quick receive",
        quantity: line.quantity,
        unit: line.unit,
        unitsPerBox: null,
        unitPrice: null,
        lineTotal: null,
        lotCode: null,
        expiryDate: null,
        gtin: null,
        isFood: true,
        confidence: 1,
        page: 1,
      },
      lineNo: index + 1,
      invoiceNumber: `QR-${stamp}`,
      receivedAtIso: new Date().toISOString(),
      defaultShelfLifeDays: product?.default_shelf_life_days ?? null,
    });
    const { data: batch, error } = await sc.supabase
      .from("batches")
      .insert({
        site_id: sc.site.id,
        product_id: line.productId,
        goods_receipt_id: receiptId,
        lot_code: plan.lotCode,
        quantity: plan.quantity,
        unit: plan.unit,
        remaining: plan.quantity,
        expiry_date: plan.expiryDate,
        expiry_kind: plan.expiryKind,
        origin: "received",
      })
      .select("id")
      .single();
    if (error || !batch) return { error: "error" };
    await sc.supabase.from("inventory_moves").insert({
      site_id: sc.site.id,
      batch_id: batch.id,
      kind: "receive",
      quantity: plan.quantity,
      moved_by: actor.profileId,
    });
  }

  revalidatePath(`/app/${sc.site.id}/receive`);
  revalidatePath(`/app/${sc.site.id}/stock`);
  return { ok: true };
}
