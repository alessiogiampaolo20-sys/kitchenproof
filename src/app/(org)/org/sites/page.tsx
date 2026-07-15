import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { getOrgContext } from "@/lib/tenancy";
import { NewSiteForm } from "./new-site-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SitesPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/");

  const supabase = await createClient();
  const ctx = await getOrgContext(supabase, orgId);
  if (!ctx) redirect("/");

  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, city, activity_type, status")
    .eq("org_id", orgId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  const t = await getTranslations();

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("sites.title")}</h1>

      {(sites ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sites.empty")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(sites ?? []).map((s) => (
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

      {ctx.role === "org_owner" ? <NewSiteForm orgId={orgId} /> : null}
    </div>
  );
}
