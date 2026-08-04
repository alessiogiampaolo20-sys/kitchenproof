import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarDays, ChefHat, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { NewOrderForm } from "./new-order-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function OrdersPage({
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
  if (!(await getOrgContext(supabase, site.org_id))) redirect("/");

  const [{ data: orders }, { data: productions }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_ref, client_name, event_date, destination, portions, delivery_mode")
      .eq("site_id", siteId)
      .order("event_date", { ascending: false })
      .limit(50),
    supabase
      .from("productions")
      .select("id, produced_on, product_name, quantity, unit")
      .eq("site_id", siteId)
      .order("produced_on", { ascending: false })
      .limit(20),
  ]);

  const t = await getTranslations("orders");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link
          href={`/app/${siteId}/orders/production`}
          className="ml-auto inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          data-testid="log-production"
        >
          <ChefHat className="size-4" />
          {t("logProduction")}
        </Link>
      </header>

      <NewOrderForm siteId={siteId} />

      <section className="mt-6 grid gap-2">
        <h2 className="font-medium">{t("ordersHeading")}</h2>
        {(orders ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOrders")}</p>
        ) : (
          (orders ?? []).map((order) => (
            <Link
              key={order.id}
              href={`/app/${siteId}/orders/${order.id}`}
              data-testid="order-row"
            >
              <Card>
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {order.order_ref} — {order.client_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <CalendarDays className="mr-1 inline size-3" />
                      {order.event_date}
                      {order.portions ? ` · ${order.portions}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{t(`destinations.${order.destination}`)}</Badge>
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </section>

      <section className="mt-6 grid gap-2">
        <h2 className="font-medium">{t("productionsHeading")}</h2>
        {(productions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noProductions")}</p>
        ) : (
          (productions ?? []).map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3 text-sm" data-testid="production-row">
                <span className="font-medium">{p.product_name}</span> · {p.produced_on}
                {p.quantity ? ` · ${p.quantity} ${p.unit ?? ""}` : ""}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
