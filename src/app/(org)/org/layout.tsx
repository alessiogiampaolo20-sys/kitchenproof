import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { signOut } from "@/app/_actions";
import { Button } from "@/components/ui/button";

export default async function OrgLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/");

  const supabase = await createClient();
  const ctx = await getOrgContext(supabase, orgId);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) redirect("/");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) redirect("/");

  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-4 p-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("nav.chooseSite")}
          </Link>
          <span className="font-medium">{org.name}</span>
          <nav className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/org/dashboard">{t("nav.dashboard")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/org/sites">{t("nav.sites")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/org/members">{t("nav.members")}</Link>
            </Button>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">
                {t("auth.signOut")}
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
