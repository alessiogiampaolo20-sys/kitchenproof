import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getInspectionSession } from "@/lib/actor/session";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SiteNav } from "./site-nav";
import { ProfileMenu } from "./profile-menu";
import { QuickAddFab } from "./quick-add-fab";

/**
 * Operator shell (§16 + §15): outbox sync, plus a sticky header mounted once —
 * nav scroll survives page navigations, and identity/role is always visible.
 */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ site: string }> }>) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, organizations(name)")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");

  // §10 guest lock: an inspector on this device must not see nav/profile/FAB
  const inspectionLocked = (await getInspectionSession(siteId)) !== null;

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

  const roleLabel = membership ? t(`members.roles.${membership.role}`) : "—";

  return (
    <SyncProvider>
      <div className="flex min-h-dvh flex-col">
        {inspectionLocked ? null : (
          <header className="sticky top-0 z-40 border-b bg-background">
            <div className="mx-auto flex w-full max-w-4xl items-center gap-1 px-4">
              <SiteNav siteId={site.id} />
              <ProfileMenu
                name={profile?.full_name ?? user.email ?? ""}
                email={user.email ?? ""}
                roleLabel={roleLabel}
                orgName={site.organizations?.name ?? ""}
                siteName={site.name}
                localeSwitcher={<LocaleSwitcher />}
              />
            </div>
          </header>
        )}
        {children}
        {inspectionLocked ? null : <QuickAddFab siteId={site.id} />}
      </div>
    </SyncProvider>
  );
}
