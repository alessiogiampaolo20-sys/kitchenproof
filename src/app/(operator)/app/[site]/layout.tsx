import { SyncProvider } from "@/lib/offline/sync-provider";

/** Operator shell: outbox sync + offline status wrap every site route (§16). */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <SyncProvider>{children}</SyncProvider>;
}
