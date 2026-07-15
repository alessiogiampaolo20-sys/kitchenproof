import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { setActiveOrg, signOut } from "./_actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, role, org:organizations(id, name)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  if (!memberships || memberships.length === 0) redirect("/welcome");

  const { data: sites } = await supabase
    .from("sites")
    .select("id, org_id, name, city, activity_type")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const t = await getTranslations();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          {t("common.appName")}
        </h1>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            {t("auth.signOut")}
          </Button>
        </form>
      </header>

      <div className="grid gap-8">
        {memberships.map((m) => {
          const orgSites = (sites ?? []).filter((s) => s.org_id === m.org.id);
          const canManage =
            m.role === "org_owner" ||
            m.role === "org_admin" ||
            m.role === "consultant";
          return (
            <section key={m.id} className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="size-5 text-muted-foreground" />
                  <h2 className="text-lg font-medium">{m.org.name}</h2>
                  <Badge variant="secondary">
                    {t(`members.roles.${m.role}`)}
                  </Badge>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <form action={setActiveOrg}>
                      <input type="hidden" name="orgId" value={m.org.id} />
                      <input type="hidden" name="next" value="/org/sites" />
                      <Button variant="outline" size="sm" type="submit">
                        <MapPin /> {t("nav.sites")}
                      </Button>
                    </form>
                    <form action={setActiveOrg}>
                      <input type="hidden" name="orgId" value={m.org.id} />
                      <input type="hidden" name="next" value="/org/members" />
                      <Button variant="outline" size="sm" type="submit">
                        <Users /> {t("nav.members")}
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>

              {orgSites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("sites.empty")}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {orgSites.map((s) => (
                    <Link key={s.id} href={`/app/${s.id}/today`}>
                      <Card className="transition-colors hover:border-primary">
                        <CardHeader>
                          <CardTitle className="text-base">{s.name}</CardTitle>
                          <CardDescription>
                            {t(`sites.activityTypes.${s.activity_type}`)}
                            {s.city ? ` · ${s.city}` : ""}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <span className="text-sm font-medium text-primary">
                            {t("sites.open")} →
                          </span>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
