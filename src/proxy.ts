import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * §10.1 guest lock: while an inspection is running on this device, every
 * app/org route except the inspection surface redirects to it — the device
 * is read-only until a manager PIN ends the session (a server action clears
 * the cookie; the signed JWT cannot be forged client-side).
 */
async function inspectionRedirect(request: NextRequest): Promise<NextResponse | null> {
  const token = request.cookies.get("kp_inspection")?.value;
  if (!token) return null;
  const secretValue = process.env.ACTOR_SESSION_SECRET;
  if (!secretValue) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secretValue),
    );
    const siteId = payload.siteId as string | undefined;
    if (!siteId) return null;
    const path = request.nextUrl.pathname;
    const inspectionPrefix = `/app/${siteId}/inspection`;
    const isAppRoute = path.startsWith("/app/") || path.startsWith("/org");
    if (isAppRoute && !path.startsWith(inspectionPrefix)) {
      return NextResponse.redirect(new URL(inspectionPrefix, request.url));
    }
  } catch {
    return null; // expired/invalid lock cookie → normal flow
  }
  return null;
}

export default async function proxy(request: NextRequest) {
  const locked = await inspectionRedirect(request);
  if (locked) return locked;
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|manifest|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
