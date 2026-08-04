// Queries behind the investigation view (§1.4). Works with the authenticated
// client and with the token-scoped service client, so the inspector sees the
// same chain — every query filters by site_id explicitly.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { describeValue } from "@/lib/compliance/checks";
import type {
  ChainOrder,
  ChainProduction,
  ChainPurchase,
  ChainRecord,
} from "./investigation";

type Client = SupabaseClient<Database>;

const PRODUCTION_SELECT =
  "id, produced_on, product_name, quantity, unit, producer:profiles!productions_produced_by_fkey(full_name)";

/** Ingredients consumed by these productions, with their paperwork. */
async function loadPurchases(
  supabase: Client,
  productionIds: string[],
): Promise<Map<string, ChainPurchase[]>> {
  const byProduction = new Map<string, ChainPurchase[]>();
  if (productionIds.length === 0) return byProduction;

  const { data: links } = await supabase
    .from("production_batches")
    .select(
      "production_id, batch:batches(id, lot_code, product:products(name), receipt:goods_receipts(received_at, supplier:suppliers(id, name), invoice:invoices(invoice_number, file_paths)))",
    )
    .in("production_id", productionIds);

  for (const link of links ?? []) {
    const batch = link.batch;
    if (!batch) continue;
    const purchase: ChainPurchase = {
      batchId: batch.id,
      lotCode: batch.lot_code,
      productName: batch.product?.name ?? "—",
      supplier: batch.receipt?.supplier
        ? { id: batch.receipt.supplier.id, name: batch.receipt.supplier.name }
        : null,
      invoiceNumber: batch.receipt?.invoice?.invoice_number ?? null,
      // the stored document itself: first page is the invoice image/PDF
      invoicePath: batch.receipt?.invoice?.file_paths?.[0] ?? null,
      receivedAt: batch.receipt?.received_at ?? null,
    };
    const list = byProduction.get(link.production_id) ?? [];
    list.push(purchase);
    byProduction.set(link.production_id, list);
  }
  return byProduction;
}

/**
 * Own-check records covering these productions: the ones explicitly attached,
 * plus everything recorded on the same day. The day fallback is what makes the
 * chain useful for records made before productions existed, and for fridge
 * checks that cover the food without naming it.
 */
async function loadRecords(
  supabase: Client,
  siteId: string,
  productions: { id: string; produced_on: string }[],
): Promise<Map<string, ChainRecord[]>> {
  const byProduction = new Map<string, ChainRecord[]>();
  if (productions.length === 0) return byProduction;

  const days = [...new Set(productions.map((p) => p.produced_on))].sort();
  const from = `${days[0]}T00:00:00Z`;
  const to = `${days[days.length - 1]}T23:59:59Z`;

  const { data: completions } = await supabase
    .from("task_completions")
    .select(
      "id, production_id, value_json, passed, is_late, measurement_kind, created_at, control_point:control_points(name_i18n), performer:profiles!task_completions_performed_by_fkey(full_name)",
    )
    .eq("site_id", siteId)
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at");

  for (const production of productions) {
    const covering = (completions ?? []).filter(
      (c) =>
        c.production_id === production.id ||
        (c.production_id === null && c.created_at.slice(0, 10) === production.produced_on),
    );
    byProduction.set(
      production.id,
      covering.map((c) => ({
        id: c.id,
        controlPointName:
          (c.control_point?.name_i18n as { da?: string } | null)?.da ?? "—",
        value: describeValue(c.value_json as never),
        passed: c.passed ?? true,
        measurementKind: c.measurement_kind,
        performedAt: c.created_at,
        performedBy: c.performer?.full_name ?? null,
        isLate: c.is_late ?? false,
      })),
    );
  }
  return byProduction;
}

async function hydrate(
  supabase: Client,
  siteId: string,
  rows: { id: string; produced_on: string; product_name: string; quantity: number | null; unit: string | null; producer?: { full_name: string } | null }[],
): Promise<ChainProduction[]> {
  const ids = rows.map((r) => r.id);
  const [purchases, records] = await Promise.all([
    loadPurchases(supabase, ids),
    loadRecords(supabase, siteId, rows),
  ]);
  return rows.map((row) => ({
    id: row.id,
    producedOn: row.produced_on,
    productName: row.product_name,
    quantity: row.quantity,
    unit: row.unit,
    producedBy: row.producer?.full_name ?? null,
    purchases: purchases.get(row.id) ?? [],
    records: records.get(row.id) ?? [],
  }));
}

/** ONE STEP BACK: from a delivered order to everything behind it. */
export async function investigateOrder(
  supabase: Client,
  siteId: string,
  orderId: string,
): Promise<{ order: ChainOrder | null; productions: ChainProduction[] }> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_ref, client_name, contact, event_date, destination, portions")
    .eq("id", orderId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!order) return { order: null, productions: [] };

  const { data: links } = await supabase
    .from("production_orders")
    .select(`production:productions(${PRODUCTION_SELECT})`)
    .eq("order_id", orderId);

  const rows = (links ?? []).flatMap((l) => (l.production ? [l.production] : []));
  return {
    order: {
      id: order.id,
      orderRef: order.order_ref,
      clientName: order.client_name,
      contact: order.contact,
      eventDate: order.event_date,
      destination: order.destination,
      portions: order.portions,
    },
    productions: await hydrate(supabase, siteId, rows),
  };
}

/**
 * ONE STEP FORWARD: from a supplier's batch to the clients who received it.
 * This is the recall question, and it must be answerable from stored records
 * alone.
 */
export async function investigateBatch(
  supabase: Client,
  siteId: string,
  batchId: string,
): Promise<{ productions: ChainProduction[]; orders: ChainOrder[] }> {
  const { data: usedIn } = await supabase
    .from("production_batches")
    .select(`production:productions(${PRODUCTION_SELECT}, site_id)`)
    .eq("batch_id", batchId);

  const rows = (usedIn ?? [])
    .flatMap((l) => (l.production ? [l.production] : []))
    .filter((p) => p.site_id === siteId);
  if (rows.length === 0) return { productions: [], orders: [] };

  const { data: orderLinks } = await supabase
    .from("production_orders")
    .select(
      "order:orders(id, order_ref, client_name, contact, event_date, destination, portions)",
    )
    .in(
      "production_id",
      rows.map((r) => r.id),
    );

  const orders = (orderLinks ?? []).flatMap((l) =>
    l.order
      ? [
          {
            id: l.order.id,
            orderRef: l.order.order_ref,
            clientName: l.order.client_name,
            contact: l.order.contact,
            eventDate: l.order.event_date,
            destination: l.order.destination,
            portions: l.order.portions,
          },
        ]
      : [],
  );

  return { productions: await hydrate(supabase, siteId, rows), orders };
}

/** Every batch received on a given invoice — the start of a supplier recall. */
export async function batchesFromInvoice(
  supabase: Client,
  siteId: string,
  invoiceId: string,
): Promise<{ id: string; lotCode: string; productName: string; remaining: number; status: string }[]> {
  const { data } = await supabase
    .from("batches")
    .select("id, lot_code, remaining, status, product:products(name), receipt:goods_receipts!inner(invoice_id)")
    .eq("site_id", siteId)
    .eq("receipt.invoice_id", invoiceId);

  return (data ?? []).map((b) => ({
    id: b.id,
    lotCode: b.lot_code,
    productName: b.product?.name ?? "—",
    remaining: Number(b.remaining),
    status: b.status,
  }));
}
