import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export type OrgContext = {
  user: User;
  role: OrgRole;
  membershipId: string;
};

/** Resolves the caller's accepted membership in an org, or null. */
export async function getOrgContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<OrgContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("id, role, expires_at")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;

  return { user, role: data.role, membershipId: data.id };
}

export const MANAGER_ROLES: readonly OrgRole[] = [
  "org_owner",
  "org_admin",
  "site_manager",
  "consultant",
];
