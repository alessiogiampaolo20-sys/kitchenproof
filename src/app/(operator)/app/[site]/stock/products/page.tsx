import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { ProductRow } from "./product-row";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ProductsPage({
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
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) redirect(`/app/${siteId}/stock`);

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, name, category, storage_type, default_shelf_life_days, allergens, allergens_ai_suggested, unit_default, favourite, ai_created",
    )
    .eq("org_id", site.org_id)
    .is("merged_into_id", null)
    .order("favourite", { ascending: false })
    .order("name");

  const t = await getTranslations("stock");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            {t("catalogTitle")}
          </CardTitle>
          <CardDescription>{t("catalogHint")}</CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-2">
        {(products ?? []).map((product) => (
          <ProductRow
            key={product.id}
            siteId={siteId}
            product={product}
            mergeTargets={(products ?? [])
              .filter((p) => p.id !== product.id)
              .map((p) => ({ id: p.id, name: p.name }))}
          />
        ))}
      </div>
    </main>
  );
}

// AI extractions can run long — lift the Vercel function limit (fluid compute).
export const maxDuration = 300;
