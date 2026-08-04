import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { investigateOrder } from "@/lib/inventory/investigation-runner";
import { ChainView } from "@/components/inventory/chain-view";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The REVERSE drill (§6): from a delivered order, everything behind it —
 * productions, purchases, supplier, invoice, and every temperature record
 * covering that food, with deviations highlighted.
 */
export default async function OrderChainPage({
  params,
}: {
  params: Promise<{ site: string; orderId: string }>;
}) {
  const { site: siteId, orderId } = await params;
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  if (!(await getOrgContext(supabase, site.org_id))) redirect("/");

  const { order, productions } = await investigateOrder(supabase, siteId, orderId);
  if (!order) redirect(`/app/${siteId}/orders`);

  const t = await getTranslations("orders");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card className="mb-4">
        <CardContent className="py-4">
          <h1 className="text-xl font-semibold">{order.orderRef}</h1>
          <p className="text-sm text-muted-foreground">
            {order.clientName} · {order.eventDate}
            {order.portions ? ` · ${order.portions}` : ""}
          </p>
          {order.contact ? <p className="text-sm">{order.contact}</p> : null}
        </CardContent>
      </Card>

      <h2 className="mb-2 font-medium">{t("chainHeading")}</h2>
      <ChainView productions={productions} />
    </main>
  );
}
