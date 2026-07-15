import "server-only";
import { cookies } from "next/headers";
import { signSession, verifySession } from "./token";

/**
 * Shared-device identity layer (§4.2): the device holds a normal Supabase
 * session; the acting person is identified per-action via PIN and carried in
 * a short-lived signed cookie. Every record stores the actual person.
 */

export const ACTOR_COOKIE = "kp_actor";
export const DEVICE_COOKIE = "kp_device";

const ACTOR_TTL_SECONDS = 60 * 60 * 12; // one work day
const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 180;

export type ActorSession = {
  membershipId: string;
  profileId: string;
  fullName: string;
  role: string;
  siteId: string;
};

export type DeviceSession = {
  deviceSessionId: string;
  siteId: string;
};

function secret(): Uint8Array {
  const value = process.env.ACTOR_SESSION_SECRET;
  if (!value) throw new Error("Missing environment variable: ACTOR_SESSION_SECRET");
  return new TextEncoder().encode(value);
}

export async function setActorCookie(session: ActorSession): Promise<void> {
  const store = await cookies();
  store.set(ACTOR_COOKIE, await signSession(session, ACTOR_TTL_SECONDS, secret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTOR_TTL_SECONDS,
  });
}

export async function getActorSession(
  siteId?: string,
): Promise<ActorSession | null> {
  const store = await cookies();
  const token = store.get(ACTOR_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession<ActorSession>(token, secret());
  if (!session) return null;
  if (siteId && session.siteId !== siteId) return null;
  return session;
}

export async function setDeviceCookie(session: DeviceSession): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_COOKIE, await signSession(session, DEVICE_TTL_SECONDS, secret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TTL_SECONDS,
  });
}

export async function getDeviceSession(
  siteId?: string,
): Promise<DeviceSession | null> {
  const store = await cookies();
  const token = store.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession<DeviceSession>(token, secret());
  if (!session) return null;
  if (siteId && session.siteId !== siteId) return null;
  return session;
}
