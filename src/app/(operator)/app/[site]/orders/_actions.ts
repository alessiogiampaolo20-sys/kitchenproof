"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext } from "@/lib/tenancy";
import { normalizeName } from "@/lib/inventory/similarity";
import { uniqueShortCode } from "@/lib/inventory/short-code";

export type OrderState = { ok: true; id?: string } | { error: "error" } | null;

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

const orderSchema = z.object({
  siteId: z.uuid(),
  orderRef: z.string().trim().min(1).max(200),
  clientName: z.string().trim().min(1).max(200),
  contact: z.string().trim().max(200).optional().or(z.literal("")),
  destination: z.enum(["catering", "private", "event", "community_delivery", "other"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venueAddress: z.string().trim().max(300).optional().or(z.literal("")),
  deliveryMode: z.enum(["cold", "warm", "mixed", "none"]),
  portions: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/** §3.4 Order Log: who ordered what, for when, and where it went. */
export async function createOrder(
  _prev: OrderState,
  formData: FormData,
): Promise<OrderState> {
  const parsed = orderSchema.safeParse({
    siteId: formData.get("siteId"),
    orderRef: formData.get("orderRef"),
    clientName: formData.get("clientName"),
    contact: formData.get("contact") ?? "",
    destination: formData.get("destination"),
    eventDate: formData.get("eventDate"),
    venueAddress: formData.get("venueAddress") ?? "",
    deliveryMode: formData.get("deliveryMode"),
    portions: formData.get("portions") || undefined,
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: order, error } = await sc.supabase
    .from("orders")
    .insert({
      site_id: sc.site.id,
      order_ref: parsed.data.orderRef,
      client_name: parsed.data.clientName,
      contact: parsed.data.contact || null,
      destination: parsed.data.destination,
      event_date: parsed.data.eventDate,
      venue_address: parsed.data.venueAddress || null,
      delivery_mode: parsed.data.deliveryMode,
      portions: parsed.data.portions ?? null,
      notes: parsed.data.notes || null,
      created_by: sc.ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !order) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "order.created",
    entityTable: "orders",
    entityId: order.id,
    diff: { order_ref: parsed.data.orderRef, event_date: parsed.data.eventDate },
  });

  revalidatePath(`/app/${sc.site.id}/orders`);
  return { ok: true, id: order.id };
}

const productionSchema = z.object({
  siteId: z.uuid(),
  productName: z.string().trim().min(1).max(200),
  producedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.coerce.number().min(0).optional(),
  unit: z.string().trim().max(40).optional().or(z.literal("")),
  /** §26.6: the business sets its own shelf life. Empty stays empty. */
  useBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  batchIds: z.array(z.uuid()).default([]),
  orderIds: z.array(z.uuid()).default([]),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * §1.4: "today I cooked ragù, for these orders" — the operator never sees the
 * word batch. The links are created for them from what they ticked, and the
 * cooking and cooling records made the same day attach to this production.
 */
export async function logProduction(input: unknown): Promise<OrderState> {
  const parsed = productionSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const { data: production, error } = await sc.supabase
    .from("productions")
    .insert({
      site_id: sc.site.id,
      produced_on: parsed.data.producedOn,
      product_name: parsed.data.productName,
      quantity: parsed.data.quantity ?? null,
      unit: parsed.data.unit || null,
      produced_by: sc.ctx.user.id,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();
  if (error || !production) return { error: "error" };

  if (parsed.data.batchIds.length > 0) {
    await sc.supabase.from("production_batches").insert(
      parsed.data.batchIds.map((batchId) => ({
        production_id: production.id,
        batch_id: batchId,
      })),
    );
  }
  if (parsed.data.orderIds.length > 0) {
    await sc.supabase.from("production_orders").insert(
      parsed.data.orderIds.map((orderId) => ({
        production_id: production.id,
        order_id: orderId,
      })),
    );
  }

  // ── the pot of ragù becomes a real thing in the kitchen ──────────────────
  // §3.4: inventory items are created as a by-product of work already
  // recorded, never from an empty form — the reference spreadsheet's own
  // Inventories sheet is empty, which is what happens when entering an item is
  // a separate chore.
  const outputBatchId = await createPreparation(sc, parsed.data, production.id);

  // records made today about this food belong to this production (the real
  // forms already work this way: "Lasagna, 80 °C" on the production's date)
  await sc.supabase
    .from("task_completions")
    .update({ production_id: production.id })
    .eq("site_id", sc.site.id)
    .is("production_id", null)
    .gte("created_at", `${parsed.data.producedOn}T00:00:00Z`)
    .lte("created_at", `${parsed.data.producedOn}T23:59:59Z`)
    .in("control_point_id", await heatAndCoolingControlPoints(sc.supabase, sc.site.id));

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "production.logged",
    entityTable: "productions",
    entityId: production.id,
    diff: {
      product: parsed.data.productName,
      batches: parsed.data.batchIds.length,
      orders: parsed.data.orderIds.length,
      output_batch: outputBatchId,
    },
  });

  revalidatePath(`/app/${sc.site.id}/orders`);
  return { ok: true, id: production.id };
}

/** Control points whose records describe a production rather than a room. */
async function heatAndCoolingControlPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("control_points")
    .select("id, template_key")
    .eq("site_id", siteId)
    .in("template_key", ["heating_core_temp", "cooling_56_10_4h", "hot_holding_56"]);
  return (data ?? []).map((cp) => cp.id);
}


/**
 * Creates the preparation the production put in the fridge, and gives it a
 * code short enough to write on masking tape (§9.1 — no printer required).
 *
 * Two deliberate departures from the prep flow:
 *
 *  - the inputs are LINKED, not consumed. The operator ticked which goods went
 *    in; they never said how much. Writing a quantity nobody stated would be
 *    inventing data (§7.5), so stock depletion stays a separate, deliberate
 *    act. Provenance is complete either way — parent_batch_ids carries it.
 *  - the use-by comes from the business's own rule or from what the operator
 *    typed. If neither exists it stays EMPTY: §26.6 makes the durability period
 *    the business's own responsibility, and a guessed date on food is exactly
 *    the kind of invention this product refuses.
 */
async function createPreparation(
  sc: NonNullable<Awaited<ReturnType<typeof siteContext>>>,
  input: z.infer<typeof productionSchema>,
  productionId: string,
): Promise<string | null> {
  const normalized = normalizeName(input.productName);
  const { data: existing } = await sc.supabase
    .from("products")
    .select("id, default_shelf_life_days")
    .eq("org_id", sc.site.org_id)
    .eq("normalized_name", normalized)
    .is("merged_into_id", null)
    .limit(1)
    .maybeSingle();

  let productId = existing?.id;
  if (!productId) {
    const { data: created } = await sc.supabase
      .from("products")
      .insert({
        org_id: sc.site.org_id,
        name: input.productName,
        normalized_name: normalized,
        category: "other",
        storage_type: "fridge",
        unit_default: input.unit || "portioner",
        is_food: true,
      })
      .select("id")
      .single();
    if (!created) return null;
    productId = created.id;
  }

  // a code the cook can copy onto the tape, unique among what is in the fridge
  const { data: activeCodes } = await sc.supabase
    .from("batches")
    .select("lot_code")
    .eq("site_id", sc.site.id)
    .eq("status", "active");
  const code = uniqueShortCode(new Set((activeCodes ?? []).map((b) => b.lot_code)));
  if (!code) return null; // never silently reuse a code

  let useBy = input.useBy || null;
  if (!useBy && existing?.default_shelf_life_days) {
    const date = new Date(`${input.producedOn}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + existing.default_shelf_life_days);
    useBy = date.toISOString().slice(0, 10);
  }

  const { data: batch } = await sc.supabase
    .from("batches")
    .insert({
      site_id: sc.site.id,
      product_id: productId,
      production_id: productionId,
      lot_code: code,
      quantity: input.quantity ?? 0,
      unit: input.unit || "portioner",
      remaining: input.quantity ?? 0,
      expiry_date: useBy,
      expiry_kind: useBy ? "internal" : null,
      origin: "produced",
      parent_batch_ids: input.batchIds.length > 0 ? input.batchIds : null,
    })
    .select("id")
    .single();
  return batch?.id ?? null;
}
