"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verify as argonVerify } from "@node-rs/argon2";
import { createClient } from "@/lib/supabase/server";
import {
  registerDeviceSchema,
  verifyPinSchema,
} from "@/lib/schemas/tenancy";
import {
  getDeviceSession,
  setActorCookie,
  setDeviceCookie,
} from "@/lib/actor/session";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext } from "@/lib/tenancy";

export type RegisterDeviceState =
  | { ok: true }
  | { error: "onlyManager" | "error" }
  | null;

export async function registerDevice(
  _prev: RegisterDeviceState,
  formData: FormData,
): Promise<RegisterDeviceState> {
  const parsed = registerDeviceSchema.safeParse({
    siteId: formData.get("siteId"),
    deviceName: formData.get("deviceName"),
  });
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "error" };

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };

  // RLS allows this insert only for site_manager+ on this site (§4.2).
  const { data: device, error } = await supabase
    .from("device_sessions")
    .insert({
      site_id: site.id,
      device_name: parsed.data.deviceName,
      registered_by: user.id,
    })
    .select("id")
    .single();
  if (error || !device) {
    return { error: "onlyManager" };
  }

  const ctx = await getOrgContext(supabase, site.org_id);
  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: user.id,
    actorRole: ctx?.role ?? "operator",
    action: "device.registered",
    entityTable: "device_sessions",
    entityId: device.id,
    diff: { device_name: parsed.data.deviceName },
  });

  await setDeviceCookie({ deviceSessionId: device.id, siteId: site.id });
  revalidatePath(`/app/${site.id}/today`);
  return { ok: true };
}

const pushSubscriptionSchema = z.object({
  siteId: z.uuid(),
  endpoint: z.url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

/** §8.4 push channel: stores the device-user's subscription for this site. */
export async function savePushSubscription(input: {
  siteId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: true } | { error: "error" }> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "error" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      site_id: parsed.data.siteId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: "error" };
  return { ok: true };
}

export type PinVerifyState =
  | { ok: true; fullName: string }
  | { error: "wrongPin"; remaining: number }
  | { error: "locked" | "noPin" | "error" };

export async function verifyPin(input: {
  membershipId: string;
  siteId: string;
  pin: string;
}): Promise<PinVerifyState> {
  const parsed = verifyPinSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  // PIN switching only makes sense on a registered device for this site.
  const device = await getDeviceSession(parsed.data.siteId);
  if (!device) return { error: "error" };

  const supabase = await createClient();

  const { data: pinData } = await supabase
    .rpc("get_pin_verification_data", {
      p_membership_id: parsed.data.membershipId,
    })
    .maybeSingle();
  if (!pinData) return { error: "noPin" };
  if (pinData.locked) return { error: "locked" };

  let success = false;
  try {
    success = await argonVerify(pinData.pin_hash, parsed.data.pin);
  } catch {
    success = false;
  }

  const { data: attempt } = await supabase
    .rpc("record_pin_attempt", {
      p_membership_id: parsed.data.membershipId,
      p_success: success,
    })
    .maybeSingle();

  if (!success) {
    if (attempt?.locked) return { error: "locked" };
    return { error: "wrongPin", remaining: attempt?.remaining_attempts ?? 0 };
  }

  const { data: member } = await supabase
    .from("memberships")
    .select("id, user_id, role, profile:profiles(full_name)")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!member || !member.user_id) return { error: "error" };

  await setActorCookie({
    membershipId: member.id,
    profileId: member.user_id,
    fullName: member.profile?.full_name ?? "",
    role: member.role,
    siteId: parsed.data.siteId,
  });

  revalidatePath(`/app/${parsed.data.siteId}/today`);
  return { ok: true, fullName: member.profile?.full_name ?? "" };
}
