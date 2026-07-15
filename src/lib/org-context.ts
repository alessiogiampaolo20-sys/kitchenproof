import "server-only";
import { cookies } from "next/headers";

export const ORG_COOKIE = "kp_org";

/** Active-org context for /org/* pages (§15.2 routes are org-scoped without a URL param). */
export async function getActiveOrgId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ORG_COOKIE)?.value ?? null;
}
