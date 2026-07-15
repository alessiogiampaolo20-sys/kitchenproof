"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createInviteSchema, setPinSchema } from "@/lib/schemas/tenancy";
import { getOrgContext } from "@/lib/tenancy";
import { writeAudit } from "@/lib/audit/log";

export type InviteFormState =
  | { url: string }
  | { error: string }
  | null;

export async function createInvite(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = createInviteSchema.safeParse({
    orgId: formData.get("orgId"),
    email: formData.get("email"),
    role: formData.get("role"),
    siteIds: formData.getAll("siteIds"),
  });
  if (!parsed.success) {
    return { error: "error" };
  }

  const supabase = await createClient();
  // create_invite() RPC validates the caller's role and writes the audit row.
  const { data: token, error } = await supabase.rpc("create_invite", {
    p_org_id: parsed.data.orgId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_site_ids:
      parsed.data.siteIds.length > 0 ? parsed.data.siteIds : undefined,
  });
  if (error || !token) {
    return { error: "error" };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";

  revalidatePath("/org/members");
  return { url: `${proto}://${host}/invite/${token}` };
}

const membershipIdSchema = z.object({ membershipId: z.uuid() });

export async function revokeMember(formData: FormData): Promise<void> {
  const parsed = membershipIdSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("memberships")
    .select("id, org_id, accepted_at, role, user_id")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!member) return;

  const ctx = await getOrgContext(supabase, member.org_id);
  if (!ctx) return;
  // Never revoke yourself or an org_owner from here.
  if (member.user_id === ctx.user.id || member.role === "org_owner") return;

  if (member.accepted_at === null) {
    const { error } = await supabase
      .from("memberships")
      .delete()
      .eq("id", member.id);
    if (error) return;
    await writeAudit(supabase, {
      orgId: member.org_id,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      action: "membership.invite_revoked",
      entityTable: "memberships",
      entityId: member.id,
    });
  } else {
    // Access is ended via expires_at; the row (and record attribution) stays (§17).
    const { error } = await supabase
      .from("memberships")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", member.id);
    if (error) return;
    await writeAudit(supabase, {
      orgId: member.org_id,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      action: "membership.revoked",
      entityTable: "memberships",
      entityId: member.id,
    });
  }

  revalidatePath("/org/members");
}

export type PinFormState = { ok: true } | { error: string } | null;

export async function setMemberPin(
  _prev: PinFormState,
  formData: FormData,
): Promise<PinFormState> {
  const parsed = setPinSchema.safeParse({
    membershipId: formData.get("membershipId"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return { error: "error" };
  }

  // §17: PIN hashed with argon2 app-side; the RPC checks self-or-manager,
  // stores the hash in the deny-all side table and writes the audit row.
  const pinHash = await hash(parsed.data.pin);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_pin", {
    p_membership_id: parsed.data.membershipId,
    p_pin_hash: pinHash,
  });
  if (error) {
    return { error: "error" };
  }

  revalidatePath("/org/members");
  return { ok: true };
}

export async function unlockMemberPin(formData: FormData): Promise<void> {
  const parsed = membershipIdSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.rpc("unlock_member_pin", {
    p_membership_id: parsed.data.membershipId,
  });
  revalidatePath("/org/members");
}
