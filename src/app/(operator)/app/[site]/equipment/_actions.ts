"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext } from "@/lib/tenancy";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const createEquipmentSchema = z.object({
  siteId: z.uuid(),
  kind: z.enum(["fridge", "freezer", "hot_holding", "dishwasher", "probe", "oven", "blast_chiller", "other"]),
  name: z.string().trim().min(1).max(120),
  brandModel: z.string().trim().max(200).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
});

const updateEquipmentSchema = createEquipmentSchema.extend({
  equipmentId: z.uuid(),
}).omit({ kind: true });

export type EquipmentActionState = { ok: true } | { error: string } | null;

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

async function uploadPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string,
  file: File,
): Promise<string | null> {
  if (file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES || !file.type.startsWith("image/")) {
    throw new Error("invalid_photo");
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // Path convention {site_id}/… drives the storage RLS policy.
  const path = `${siteId}/equipment/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  return path;
}

export async function createEquipment(
  _prev: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  const parsed = createEquipmentSchema.safeParse({
    siteId: formData.get("siteId"),
    kind: formData.get("kind"),
    name: formData.get("name"),
    brandModel: formData.get("brandModel") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  let photoPath: string | null = null;
  const photo = formData.get("photo");
  try {
    if (photo instanceof File) {
      photoPath = await uploadPhoto(sc.supabase, sc.site.id, photo);
    }
  } catch {
    return { error: "error" };
  }

  const { data: created, error } = await sc.supabase
    .from("equipment")
    .insert({
      site_id: sc.site.id,
      kind: parsed.data.kind,
      name: parsed.data.name,
      brand_model: parsed.data.brandModel || null,
      location_note: parsed.data.location || null,
      photo_path: photoPath,
    })
    .select("id")
    .single();
  if (error || !created) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "equipment.created",
    entityTable: "equipment",
    entityId: created.id,
    diff: { name: parsed.data.name, kind: parsed.data.kind },
  });

  revalidatePath(`/app/${sc.site.id}/equipment`);
  return { ok: true };
}

export async function updateEquipment(
  _prev: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  const parsed = updateEquipmentSchema.safeParse({
    siteId: formData.get("siteId"),
    equipmentId: formData.get("equipmentId"),
    name: formData.get("name"),
    brandModel: formData.get("brandModel") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  let photoPath: string | undefined;
  const photo = formData.get("photo");
  try {
    if (photo instanceof File && photo.size > 0) {
      photoPath = (await uploadPhoto(sc.supabase, sc.site.id, photo)) ?? undefined;
    }
  } catch {
    return { error: "error" };
  }

  const { error } = await sc.supabase
    .from("equipment")
    .update({
      name: parsed.data.name,
      brand_model: parsed.data.brandModel || null,
      location_note: parsed.data.location || null,
      ...(photoPath ? { photo_path: photoPath } : {}),
    })
    .eq("id", parsed.data.equipmentId);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "equipment.updated",
    entityTable: "equipment",
    entityId: parsed.data.equipmentId,
    diff: { name: parsed.data.name },
  });

  revalidatePath(`/app/${sc.site.id}/equipment`);
  revalidatePath(`/app/${sc.site.id}/equipment/${parsed.data.equipmentId}`);
  return { ok: true };
}

const retireSchema = z.object({ siteId: z.uuid(), equipmentId: z.uuid() });

export async function retireEquipment(formData: FormData): Promise<void> {
  const parsed = retireSchema.safeParse({
    siteId: formData.get("siteId"),
    equipmentId: formData.get("equipmentId"),
  });
  if (!parsed.success) return;
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return;

  const { error } = await sc.supabase
    .from("equipment")
    .update({ active: false, retired_at: new Date().toISOString() })
    .eq("id", parsed.data.equipmentId);
  if (error) return;

  // Deactivate CPs targeting this unit and drop their future pending tasks.
  const { data: cps } = await sc.supabase
    .from("control_points")
    .update({ active: false })
    .eq("equipment_id", parsed.data.equipmentId)
    .eq("active", true)
    .select("id");
  for (const cp of cps ?? []) {
    await sc.supabase
      .from("tasks")
      .delete()
      .eq("control_point_id", cp.id)
      .eq("status", "pending")
      .gt("due_at", new Date().toISOString());
  }

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "equipment.retired",
    entityTable: "equipment",
    entityId: parsed.data.equipmentId,
    diff: { deactivated_control_points: (cps ?? []).length },
  });

  revalidatePath(`/app/${sc.site.id}/equipment`);
}
