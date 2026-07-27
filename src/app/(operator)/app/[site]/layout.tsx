import { cn } from "@/lib/utils";
import { getInspectionSession } from "@/lib/actor/session";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SiteNav } from "./site-nav";
import { ProfileMenu } from "./profile-menu";
import { QuickAddFab } from "./quick-add-fab";

/**
 * Operator shell (§16 + §15): outbox sync, plus a sticky header mounted once —
 * nav scroll survives page navigations. Kept free of data fetching: the pages
 * below already query what they show, and identity loads when the profile menu
 * is opened. §10 guest lock hides the whole chrome from an inspector.
 */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ site: string }> }>) {
  const { site: siteId } = await params;
  const inspectionLocked = (await getInspectionSession(siteId)) !== null;

  return (
    <SyncProvider>
      {/* bottom padding keeps the last action clear of the floating + button */}
      <div className={cn("flex min-h-dvh flex-col", inspectionLocked || "pb-20")}>
        {inspectionLocked ? null : (
          <header className="sticky top-0 z-40 border-b bg-background">
            <div className="mx-auto flex w-full max-w-4xl items-center gap-1 px-4">
              <SiteNav siteId={siteId} />
              <ProfileMenu siteId={siteId} localeSwitcher={<LocaleSwitcher />} />
            </div>
          </header>
        )}
        {children}
        {inspectionLocked ? null : <QuickAddFab siteId={siteId} />}
      </div>
    </SyncProvider>
  );
}
