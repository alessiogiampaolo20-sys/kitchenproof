"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { EU_ALLERGENS } from "@/lib/ai/schemas";
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
