import { SignJWT, jwtVerify } from "jose";

/** Pure JWT helpers for actor/device cookies — no Next.js dependencies (unit-testable). */

export async function signSession(
  payload: Record<string, string>,
  ttlSeconds: number,
  secret: Uint8Array,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function verifySession<T>(
  token: string,
  secret: Uint8Array,
): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as T;
  } catch {
    return null;
  }
}
