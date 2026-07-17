import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AlarmClock, Boxes, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { SiteNav } from "../site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_ORDER = ["fridge", "freezer", "dry", "ambient"] as const;

export default async function StockPage({
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
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const [{ data: expiring }, { data: batches }] = await Promise.all([
    supabase
      .from("v_expiring_batches")
      .select("id, lot_code, remaining, unit, expiry_date, product_name, storage_type")
      .eq("site_id", siteId)
      .order("expiry_date"),
    supabase
      .from("batches")
      .select(
        "id, lot_code, remaining, unit, expiry_date, expiry_kind, origin, created_at, product:products(id, name, storage_type)",
      )
      .eq("site_id", siteId)
      .eq("status", "active")
      .gt("remaining", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false }),
  ]);

  const [t, locale] = await Promise.all([getTranslations("stock"), getLocale()]);

  // group by storage type, then product (FIFO order preserved from the query)
  const groups = STORAGE_ORDER.map((storage) => ({
    storage,
    items: (batches ?? []).filter((b) => b.product?.storage_type === storage),
  })).filter((g) => g.items.length > 0);

  // FIFO nudge: the earliest-expiring batch per product gets "use first"
  const firstOfProduct = new Set<string>();
  const fifoBatchIds = new Set<string>();
  for (const batch of batches ?? []) {
    const pid = batch.product?.id ?? "";
    if (!firstOfProduct.has(pid)) {
      firstOfProduct.add(pid);
      if (batch.expiry_date) fifoBatchIds.add(batch.id);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <SiteNav siteId={siteId} active="stock" />

      <header className="mb-4 flex flex-wrap items-center gap-2">
        <Boxes className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${siteId}/stock/prep`} data-testid="prep-link">
              {t("prepLink")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${siteId}/leftovers`} data-testid="leftovers-link">
              {t("leftoversLink")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${siteId}/trace`} data-testid="trace-link">
              {t("traceLink")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${siteId}/stock/outbound`} data-testid="outbound-link">
              {t("outboundLink")}
            </Link>
          </Button>
          {isManager ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/${siteId}/stock/products`} data-testid="catalog-link">
                {t("catalogLink")}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {/* §9.6 expiring-soon rail with FIFO nudge */}
      {(expiring ?? []).length > 0 ? (
        <section className="mb-6 grid gap-2" data-testid="expiring-rail">
          <h2 className="flex items-center gap-2 font-medium">
            <AlarmClock className="size-4 text-destructive" />
            {t("expiringTitle")}
          </h2>
          {(expiring ?? []).map((batch) => (
            <Link key={batch.id} href={`/app/${siteId}/stock/batch/${batch.id}`}>
              <Card className="border-amber-400">
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {batch.product_name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {batch.remaining} {batch.unit} · {batch.lot_code}
                  </span>
                  <Badge variant="destructive">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                      new Date(batch.expiry_date!),
                    )}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Package className="size-4" />
            {t("empty")}
          </CardContent>
        </Card>
      ) : null}

      {groups.map((group) => (
        <section key={group.storage} className="mb-6 grid gap-2">
          <h2 className="font-medium">{t(`storage.${group.storage}`)}</h2>
          {group.items.map((batch) => (
            <Link
              key={batch.id}
              href={`/app/${siteId}/stock/batch/${batch.id}`}
              data-testid="stock-batch"
            >
              <Card>
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {batch.product?.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {batch.remaining} {batch.unit} · {batch.lot_code}
                  </span>
                  {fifoBatchIds.has(batch.id) ? (
                    <Badge variant="secondary" data-testid="fifo-nudge">
                      {t("useFirst")}
                    </Badge>
                  ) : null}
                  {batch.origin === "produced" ? (
                    <Badge variant="outline">{t("produced")}</Badge>
                  ) : null}
                  {batch.expiry_date ? (
                    <span className="text-xs text-muted-foreground">
                      {batch.expiry_kind === "internal" ? t("internalExpiry") : t("expiry")}{" "}
                      {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                        new Date(batch.expiry_date),
                      )}
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}
