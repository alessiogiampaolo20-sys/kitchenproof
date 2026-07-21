import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { QuickReceiveForm } from "./quick-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function QuickReceivePage({
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

  const [{ data: suppliers }, { data: products }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("org_id", site.org_id)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, unit_default")
      .eq("org_id", site.org_id)
      .eq("is_food", true)
      .is("merged_into_id", null)
      .order("favourite", { ascending: false })
      .order("name"),
  ]);

  const t = await getTranslations("receive");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" />
            {t("quickTitle")}
          </CardTitle>
          <CardDescription>{t("quickHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QuickReceiveForm
            siteId={siteId}
            suppliers={suppliers ?? []}
            products={products ?? []}
          />
        </CardContent>
      </Card>
    </main>
  );
}
