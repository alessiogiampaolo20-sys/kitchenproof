// §9.6 trace search: one query over the flattened provenance view + one over
// the movement ledger. Shared by the trace page and the recall-report action.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type TraceFilters = {
  query: string;
  fromDate?: string; // ISO date, on received_at/batch creation
  toDate?: string;
};

export type TraceBatch = {
  batchId: string;
  productName: string;
  lotCode: string;
  quantity: number;
  remaining: number;
  unit: string;
  status: string;
  origin: string;
  expiryDate: string | null;
  batchCreatedAt: string;
  supplierName: string | null;
  supplierCvr: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  receivedAt: string | null;
};

export type TraceMove = {
  batchId: string;
  productName: string;
  lotCode: string;
  kind: string;
  quantity: number;
  reason: string | null;
  movedAt: string;
  movedBy: string;
  b2bCustomerName: string | null;
};

export async function searchTrace(
  supabase: Client,
  siteId: string,
  filters: TraceFilters,
): Promise<{ batches: TraceBatch[]; moves: TraceMove[] }> {
  const term = filters.query.replace(/[%_]/g, "").trim();
  let query = supabase
    .from("v_traceability_lookup")
    .select("*")
    .eq("site_id", siteId)
    .order("batch_created_at", { ascending: false })
    .limit(200);
  if (term) {
    query = query.or(
      `product_name.ilike.%${term}%,supplier_name.ilike.%${term}%,lot_code.ilike.%${term}%`,
    );
  }
  if (filters.fromDate) query = query.gte("batch_created_at", filters.fromDate);
  if (filters.toDate) {
    query = query.lte("batch_created_at", `${filters.toDate}T23:59:59Z`);
  }
  const { data: rows, error } = await query;
  if (error) throw new Error(`trace search: ${error.message}`);

  const batches: TraceBatch[] = (rows ?? [])
    .filter((row) => row.batch_id !== null)
    .map((row) => ({
      batchId: row.batch_id!,
      productName: row.product_name ?? "",
      lotCode: row.lot_code ?? "",
      quantity: Number(row.quantity ?? 0),
      remaining: Number(row.remaining ?? 0),
      unit: row.unit ?? "",
      status: row.status ?? "",
      origin: row.origin ?? "",
      expiryDate: row.expiry_date,
      batchCreatedAt: row.batch_created_at ?? "",
      supplierName: row.supplier_name,
      supplierCvr: row.supplier_cvr,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      receivedAt: row.received_at,
    }));

  const batchIds = batches.map((batch) => batch.batchId);
  const byId = new Map(batches.map((batch) => [batch.batchId, batch]));
  let moves: TraceMove[] = [];
  if (batchIds.length > 0) {
    const { data: moveRows } = await supabase
      .from("inventory_moves")
      .select(
        "batch_id, kind, quantity, reason, moved_at, mover:profiles!inventory_moves_moved_by_fkey(full_name), customer:b2b_customers(name)",
      )
      .in("batch_id", batchIds)
      .order("moved_at", { ascending: false })
      .limit(500);
    moves = (moveRows ?? []).map((move) => ({
      batchId: move.batch_id,
      productName: byId.get(move.batch_id)?.productName ?? "",
      lotCode: byId.get(move.batch_id)?.lotCode ?? "",
      kind: move.kind,
      quantity: Number(move.quantity),
      reason: move.reason,
      movedAt: move.moved_at,
      movedBy: (move.mover as { full_name: string } | null)?.full_name ?? "",
      b2bCustomerName: (move.customer as { name: string } | null)?.name ?? null,
    }));
  }

  return { batches, moves };
}
