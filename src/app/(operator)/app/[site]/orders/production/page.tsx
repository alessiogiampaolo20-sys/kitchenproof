import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { ProductionForm } from "./production-form";

export default async function LogProductionPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  if (!(await getOrgContext(supabase, site.org_id))) redirect("/");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: site.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // §4.5: propose, never present an empty multi-select. Ingredients in stock
  // right now, newest first — what a cook would have reached for today.
  const [{ data: batches }, { data: orders }] = await Promise.all([
    supabase
      .from("batches")
      .select("id, lot_code, created_at, product:products(name)")
      .eq("site_id", siteId)
      .eq("status", "active")
      .gt("remaining", 0)
      .order("created_at", { ascending: false })
      .limit(40),
    // orders whose event is coming up (or was in the last two days): the ones
    // a production today is plausibly for
    supabase
      .from("orders")
      .select("id, order_ref, client_name, event_date, portions")
      .eq("site_id", siteId)
      .gte(
        "event_date",
        new Date(new Date().getTime() - 2 * 86_400_000).toISOString().slice(0, 10),
      )
      .order("event_date")
      .limit(20),
  ]);

  const t = await getTranslations("orders");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <h1 className="mb-1 text-xl font-semibold">{t("logProduction")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t("productionHint")}</p>
      <ProductionForm
        siteId={siteId}
        today={today}
        batches={(batches ?? []).map((b) => ({
          id: b.id,
          label: `${b.product?.name ?? "—"} · ${b.lot_code}`,
        }))}
        orders={(orders ?? []).map((o) => ({
          id: o.id,
          label: `${o.order_ref} — ${o.client_name}`,
          eventDate: o.event_date,
          portions: o.portions,
        }))}
      />
    </main>
  );
}
