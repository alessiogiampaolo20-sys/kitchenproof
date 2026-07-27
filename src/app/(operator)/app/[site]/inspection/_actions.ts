"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { verify as argonVerify } from "@node-rs/argon2";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { INSPECTOR_LINK_HOURS, type InspectorLinkHours } from "./link-options";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import {
  clearInspectionCookie,
  getInspectionSession,
  setInspectionCookie,
} from "@/lib/actor/session";

const INSPECTOR_LINK_TTL_HOURS = 4; // §10.1 time-boxed magic link

async function siteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return null;
  return { supabase, site, ctx };
}

const startSchema = z.object({ siteId: z.uuid() });

export type InspectionActionState =
  | { ok: true }
  | { error: "error" | "noManagerPin" }
  | null;

/**
 * §10.1 Kontrolbesøg: any site member can hand the device over — locks it
 * read-only (guest cookie + proxy gate), notifies org admins, audits.
 */
export async function startInspection(input: unknown): Promise<InspectionActionState> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  // never lock a device nobody can unlock: a manager PIN must exist first
  const { data: managerPins } = await sc.supabase.rpc("site_has_manager_pin", {
    p_site_id: sc.site.id,
  });
  if (!managerPins) return { error: "noManagerPin" };

  await setInspectionCookie({
    siteId: sc.site.id,
    startedAt: new Date().toISOString(),
  });

  // notify org admins ("inspection started at {site}")
  const { data: admins } = await sc.supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", sc.site.org_id)
    .in("role", ["org_owner", "org_admin"])
    .not("accepted_at", "is", null);
  for (const admin of admins ?? []) {
    if (!admin.user_id) continue;
    await sc.supabase.from("notifications").insert({
      user_id: admin.user_id,
      site_id: sc.site.id,
      kind: "inspection_started",
      payload: { site_name: sc.site.name },
      channels: ["in_app"],
    });
  }

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "inspection.started",
    entityTable: "sites",
    entityId: sc.site.id,
  });

  revalidatePath(`/app/${sc.site.id}/inspection`);
  return { ok: true };
}

const endSchema = z.object({
  siteId: z.uuid(),
  membershipId: z.uuid(),
  pin: z.string().regex(/^\d{4}$/),
});

export type EndInspectionState =
  | { ok: true }
  | { error: "error" | "wrongPin" | "locked" | "noPin" | "notManager" }
  | null;

/** §10.1: exiting the guest lock requires a MANAGER's PIN. */
export async function endInspection(input: unknown): Promise<EndInspectionState> {
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const lock = await getInspectionSession(parsed.data.siteId);
  if (!lock) return { error: "error" };

  const { data: member } = await sc.supabase
    .from("memberships")
    .select("id, role, org_id")
    .eq("id", parsed.data.membershipId)
    .eq("org_id", sc.site.org_id)
    .maybeSingle();
  if (!member) return { error: "error" };
  if (!MANAGER_ROLES.includes(member.role)) return { error: "notManager" };

  const { data: pinData } = await sc.supabase
    .rpc("get_pin_verification_data", { p_membership_id: member.id })
    .maybeSingle();
  if (!pinData) return { error: "noPin" };
  if (pinData.locked) return { error: "locked" };

  let success = false;
  try {
    success = await argonVerify(pinData.pin_hash, parsed.data.pin);
  } catch {
    success = false;
  }
  const { data: attempt } = await sc.supabase
    .rpc("record_pin_attempt", { p_membership_id: member.id, p_success: success })
    .maybeSingle();
  if (!success) {
    return { error: attempt?.locked ? "locked" : "wrongPin" };
  }

  await clearInspectionCookie();
  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "inspection.ended",
    entityTable: "sites",
    entityId: sc.site.id,
    diff: { unlocked_by_membership: member.id },
  });

  revalidatePath(`/app/${sc.site.id}/inspection`);
  return { ok: true };
}

const linkSchema = z.object({
  siteId: z.uuid(),
  hours: z.coerce
    .number()
    .refine((h): h is InspectorLinkHours =>
      (INSPECTOR_LINK_HOURS as readonly number[]).includes(h),
    )
    .default(INSPECTOR_LINK_TTL_HOURS),
});

export type InspectorLinkState =
  | { ok: true; url: string; expiresAt: string }
  | { error: "error" }
  | null;

/** §10.1 magic link for the inspector's own device (read-only, time-boxed). */
export async function createInspectorLink(input: unknown): Promise<InspectorLinkState> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + parsed.data.hours * 3_600_000);

  // RLS: site managers only — operators use the on-device mode
  const { data: link, error } = await sc.supabase
    .from("inspector_links")
    .insert({
      site_id: sc.site.id,
      token_hash: tokenHash,
      created_by: sc.ctx.user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !link) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "inspector_link.created",
    entityTable: "inspector_links",
    entityId: link.id,
    diff: { expires_at: expiresAt.toISOString(), hours: parsed.data.hours },
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return {
    ok: true,
    url: `${proto}://${host}/inspect/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

const revokeSchema = z.object({ siteId: z.uuid(), linkId: z.uuid() });

export type RevokeLinkState = { ok: true } | { error: "error" } | null;

/**
 * Ends an inspector's access before it expires. The link row stays — a revoked
 * visit is evidence of control, not something to erase — and `resolve_inspector_link`
 * refuses the token from this moment on.
 */
export async function revokeInspectorLink(input: unknown): Promise<RevokeLinkState> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc || !MANAGER_ROLES.includes(sc.ctx.role)) return { error: "error" };

  // RLS keeps this to the site's managers; scoping by site_id too so a link id
  // from another site cannot be revoked by guessing.
  const { data: revoked, error } = await sc.supabase
    .from("inspector_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by: sc.ctx.user.id })
    .eq("id", parsed.data.linkId)
    .eq("site_id", sc.site.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: "error" };
  if (!revoked) return { ok: true }; // already revoked or expired — nothing to do

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "inspector_link.revoked",
    entityTable: "inspector_links",
    entityId: revoked.id,
    diff: {},
  });

  revalidatePath(`/app/${sc.site.id}/inspection`);
  return { ok: true };
}

const uploadDocumentSchema = z.object({
  siteId: z.uuid(),
  kind: z.enum(["pest_control", "training_certificate", "water_test", "smiley_report", "other"]),
  title: z.string().trim().min(1).max(200),
  validUntil: z.string().nullable(),
});

/** §10.2 tab 5: managers keep contracts/certificates ready for inspection. */
export async function uploadSiteDocument(
  _prev: InspectionActionState,
  formData: FormData,
): Promise<InspectionActionState> {
  const parsed = uploadDocumentSchema.safeParse({
    siteId: formData.get("siteId"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    validUntil: (formData.get("validUntil") as string) || null,
  });
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc || !MANAGER_ROLES.includes(sc.ctx.role)) return { error: "error" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) {
    return { error: "error" };
  }
  const safeName = file.name.replace(/[^\w.\-æøåÆØÅ]/g, "_");
  const path = `${sc.site.id}/documents/${Date.now()}-${safeName}`;
  const { error: uploadError } = await sc.supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) return { error: "error" };

  const { data: doc, error } = await sc.supabase
    .from("site_documents")
    .insert({
      site_id: sc.site.id,
      kind: parsed.data.kind,
      title: parsed.data.title,
      file_path: path,
      uploaded_by: sc.ctx.user.id,
      valid_until: parsed.data.validUntil,
    })
    .select("id")
    .single();
  if (error || !doc) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "site_document.uploaded",
    entityTable: "site_documents",
    entityId: doc.id,
    diff: { kind: parsed.data.kind, title: parsed.data.title },
  });

  revalidatePath(`/app/${sc.site.id}/inspection`);
  return { ok: true };
}
