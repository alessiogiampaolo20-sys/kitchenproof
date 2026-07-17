"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { getActorSession } from "@/lib/actor/session";
import { EU_ALLERGENS } from "@/lib/ai/schemas";
import { normalizeName } from "@/lib/inventory/similarity";
import type { Json } from "@/lib/supabase/database.types";

export type StockActionState = { ok: true } | { error: "error" } | null;

async function siteContext(siteId: string, managerOnly = false) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return null;
  if (managerOnly && !MANAGER_ROLES.includes(ctx.role)) return null;
  return { supabase, site, ctx };
}

const labelPrintedSchema = z.object({ siteId: z.uuid(), batchId: z.uuid() });

export async function markLabelPrinted(input: unknown): Promise<StockActionState> {
  const parsed = labelPrintedSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  await sc.supabase
    .from("batches")
    .update({ label_printed: true })
    .eq("id", parsed.data.batchId)
    .eq("site_id", sc.site.id);
  revalidatePath(`/app/${sc.site.id}/stock/batch/${parsed.data.batchId}`);
  return { ok: true };
}

const updateProductSchema = z.object({
  siteId: z.uuid(),
  productId: z.uuid(),
  category: z.enum([
    "meat", "fish", "dairy", "produce", "dry", "frozen",
    "beverage", "bakery", "packaging", "nonfood", "other",
  ]),
  storageType: z.enum(["fridge", "freezer", "dry", "ambient"]),
  shelfLifeDays: z.coerce.number().int().positive().nullable(),
  allergens: z.array(z.enum(EU_ALLERGENS)).max(14),
  favourite: z.boolean(),
});

/** §9.2 catalog edit — saving confirms AI-suggested allergens (human-reviewed). */
export async function updateProduct(input: unknown): Promise<StockActionState> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId, true);
  if (!sc) return { error: "error" };

  const { error } = await sc.supabase
    .from("products")
    .update({
      category: parsed.data.category,
      storage_type: parsed.data.storageType,
      default_shelf_life_days: parsed.data.shelfLifeDays,
      allergens: parsed.data.allergens,
      allergens_ai_suggested: false, // human has reviewed (§9.1)
      favourite: parsed.data.favourite,
    })
    .eq("id", parsed.data.productId)
    .eq("org_id", sc.site.org_id);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "product.updated",
    entityTable: "products",
    entityId: parsed.data.productId,
    diff: { allergens: parsed.data.allergens as unknown as Json, shelf_life: parsed.data.shelfLifeDays },
  });
  revalidatePath(`/app/${sc.site.id}/stock/products`);
  return { ok: true };
}

const mergeSchema = z.object({
  siteId: z.uuid(),
  sourceId: z.uuid(),
  targetId: z.uuid(),
});

/**
 * §9.2 merge tool: the duplicate is hidden from matching/pickers via
 * merged_into_id; ACTIVE batches are repointed so stock groups correctly;
 * confirmed invoice lines keep the original id (frozen paper history).
 */
export async function mergeProducts(input: unknown): Promise<StockActionState> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success || parsed.data.sourceId === parsed.data.targetId) {
    return { error: "error" };
  }
  const sc = await siteContext(parsed.data.siteId, true);
  if (!sc) return { error: "error" };

  const { data: target } = await sc.supabase
    .from("products")
    .select("id, merged_into_id")
    .eq("id", parsed.data.targetId)
    .eq("org_id", sc.site.org_id)
    .maybeSingle();
  if (!target || target.merged_into_id) return { error: "error" };

  const { error } = await sc.supabase
    .from("products")
    .update({ merged_into_id: parsed.data.targetId })
    .eq("id", parsed.data.sourceId)
    .eq("org_id", sc.site.org_id);
  if (error) return { error: "error" };

  await sc.supabase
    .from("batches")
    .update({ product_id: parsed.data.targetId })
    .eq("product_id", parsed.data.sourceId);

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "product.merged",
    entityTable: "products",
    entityId: parsed.data.sourceId,
    diff: { merged_into: parsed.data.targetId },
  });
  revalidatePath(`/app/${sc.site.id}/stock/products`);
  return { ok: true };
}

const prepSchema = z.object({
  siteId: z.uuid(),
  outputName: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(100000),
  unit: z.enum(["kg", "g", "l", "ml", "pcs", "box"]),
  expiryDays: z.number().int().min(1).max(30),
  inputs: z
    .array(z.object({ batchId: z.uuid(), quantity: z.number().positive() }))
    .min(1)
    .max(30),
});

export type PrepActionState =
  | { ok: true; batchId: string }
  | { error: "error" | "noActor" }
  | null;

/**
 * §9.4 prep batch: input batches → produced output with parent_batch_ids
 * (ingredient-level trace both directions). Internal expiry defaults to
 * 3 days [DEFAULT]; inputs get append-only 'use' moves.
 */
export async function createPrepBatch(input: unknown): Promise<PrepActionState> {
  const parsed = prepSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" }; // production is person-attributed

  // output product: reuse by normalized name, else create in the org catalog
  const normalized = normalizeName(parsed.data.outputName);
  const { data: existing } = await sc.supabase
    .from("products")
    .select("id")
    .eq("org_id", sc.site.org_id)
    .eq("normalized_name", normalized)
    .is("merged_into_id", null)
    .limit(1)
    .maybeSingle();
  let productId = existing?.id;
  if (!productId) {
    const { data: created, error } = await sc.supabase
      .from("products")
      .insert({
        org_id: sc.site.org_id,
        name: parsed.data.outputName,
        normalized_name: normalized,
        category: "other",
        storage_type: "fridge",
        default_shelf_life_days: parsed.data.expiryDays,
        unit_default: parsed.data.unit,
        is_food: true,
      })
      .select("id")
      .single();
    if (error || !created) return { error: "error" };
    productId = created.id;
  }

  // consume inputs (validated against remaining; ledger stays append-only)
  const parentIds: string[] = [];
  for (const inputLine of parsed.data.inputs) {
    const { data: batch } = await sc.supabase
      .from("batches")
      .select("id, remaining")
      .eq("id", inputLine.batchId)
      .eq("site_id", sc.site.id)
      .eq("status", "active")
      .maybeSingle();
    if (!batch) return { error: "error" };
    const used = Math.min(Number(batch.remaining), inputLine.quantity);
    if (used <= 0) continue;
    const { error: moveError } = await sc.supabase.from("inventory_moves").insert({
      site_id: sc.site.id,
      batch_id: batch.id,
      kind: "use",
      quantity: used,
      moved_by: actor.profileId,
      note: `prep: ${parsed.data.outputName}`,
    });
    if (moveError) return { error: "error" };
    const remaining = Number(batch.remaining) - used;
    await sc.supabase
      .from("batches")
      .update({ remaining, status: remaining === 0 ? "finished" : "active" })
      .eq("id", batch.id);
    parentIds.push(batch.id);
  }
  if (parentIds.length === 0) return { error: "error" };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const expiry = new Date();
  expiry.setUTCDate(expiry.getUTCDate() + parsed.data.expiryDays);
  const { data: output, error: outputError } = await sc.supabase
    .from("batches")
    .insert({
      site_id: sc.site.id,
      product_id: productId,
      lot_code: `PREP-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      remaining: parsed.data.quantity,
      expiry_date: expiry.toISOString().slice(0, 10),
      expiry_kind: "internal",
      origin: "produced",
      parent_batch_ids: parentIds,
    })
    .select("id")
    .single();
  if (outputError || !output) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: actor.profileId,
    actorRole: actor.role,
    action: "batch.produced",
    entityTable: "batches",
    entityId: output.id,
    diff: { output: parsed.data.outputName, inputs: parentIds.length },
  });

  revalidatePath(`/app/${sc.site.id}/stock`);
  return { ok: true, batchId: output.id };
}
