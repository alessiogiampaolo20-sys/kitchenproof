import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CookingPot } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { SiteNav } from "../../site-nav";
import { PrepForm } from "./prep-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PrepPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");

  const { data: batches } = await supabase
    .from("batches")
    .select("id, lot_code, remaining, unit, product:products(name)")
    .eq("site_id", siteId)
    .eq("status", "active")
    .gt("remaining", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  const t = await getTranslations("prep");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <SiteNav siteId={siteId} active="stock" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CookingPot className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PrepForm
            siteId={siteId}
            batches={(batches ?? []).map((batch) => ({
              id: batch.id,
              name: batch.product?.name ?? "",
              lotCode: batch.lot_code,
              remaining: Number(batch.remaining),
              unit: batch.unit,
            }))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
