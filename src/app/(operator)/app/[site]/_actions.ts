"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type SiteIdentity = {
  name: string;
  email: string;
  roleLabel: string;
  orgName: string;
  siteName: string;
};

/**
 * Identity for the profile menu. Deliberately NOT fetched in the layout: doing
 * it there cost an auth round-trip plus three queries on every single page
 * render (measured: ~3x slower navigation). The menu asks for it when opened.
 */
export async function loadSiteIdentity(siteId: string): Promise<SiteIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, organizations(name)")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;

  const [{ data: profile }, { data: membership }, t] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("role")
      .eq("org_id", site.org_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    getTranslations(),
  ]);

  return {
    name: profile?.full_name ?? user.email ?? "",
    email: user.email ?? "",
    roleLabel: membership ? t(`members.roles.${membership.role}`) : "—",
    orgName: site.organizations?.name ?? "",
    siteName: site.name,
  };
}
