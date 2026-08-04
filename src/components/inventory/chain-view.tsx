import { AlertTriangle, CheckCircle2, CircleSlash, FileText, Package, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  clientContactList,
  summariseChain,
  suppliersOf,
  type ChainOrder,
  type ChainProduction,
} from "@/lib/inventory/investigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * §1.4 the investigation, rendered the same way from either direction and for
 * either audience (owner or inspector). It leads with the verdict, because the
 * first question in a food incident is "were the standards met?" — and the
 * second is "who do I call?".
 */
export async function ChainView({
  productions,
  orders,
  fileHref,
}: {
  productions: ChainProduction[];
  orders?: ChainOrder[];
  /** Renders the stored invoice as a link when the surface can serve files. */
  fileHref?: (path: string) => string;
}) {
  const t = await getTranslations("trace");
  const verdict = summariseChain(productions);
  const suppliers = suppliersOf(productions);
  const contacts = orders ? clientContactList(orders) : [];

  return (
    <div className="grid gap-4">
      {/* ── the verdict line ── */}
      <Card data-testid="chain-verdict" data-clean={verdict.clean ? "true" : "false"}>
        <CardContent className="flex items-start gap-3 py-4">
          {verdict.unmonitored ? (
            <CircleSlash className="size-6 shrink-0 text-muted-foreground" />
          ) : verdict.clean ? (
            <CheckCircle2 className="size-6 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-6 shrink-0 text-destructive" />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {verdict.unmonitored
                ? t("verdict.none")
                : verdict.clean
                  ? t("verdict.clean", { count: verdict.totalRecords })
                  : t("verdict.deviations", { count: verdict.failedRecords })}
            </p>
            {verdict.lateRecords > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("verdict.late", { count: verdict.lateRecords })}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── who must be contacted (downstream) ── */}
      {orders ? (
        <Card>
          <CardContent className="grid gap-2 py-4">
            <p className="flex items-center gap-2 font-medium">
              <Users className="size-4 text-primary" />
              {t("clients", { count: contacts.length })}
            </p>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noClients")}</p>
            ) : (
              contacts.map((c) => (
                <div key={c.orderId} className="text-sm" data-testid="chain-client">
                  <span className="font-medium">{c.clientName}</span> — {c.orderRef} ·{" "}
                  {c.eventDate}
                  {c.portions ? ` · ${c.portions}` : ""}
                  <span className="block text-muted-foreground">
                    {c.contact ?? t("noContact")}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── the productions, with what went in and what was measured ── */}
      {productions.map((production) => (
        <Card key={production.id} data-testid="chain-production">
          <CardContent className="grid gap-3 py-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-medium">{production.productName}</p>
              <span className="text-sm text-muted-foreground">
                {production.producedOn}
                {production.quantity
                  ? ` · ${production.quantity} ${production.unit ?? ""}`
                  : ""}
                {production.producedBy ? ` · ${production.producedBy}` : ""}
              </span>
            </div>

            <div className="grid gap-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Package className="size-4 text-muted-foreground" />
                {t("ingredients")}
              </p>
              {production.purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noIngredients")}</p>
              ) : (
                production.purchases.map((purchase) => (
                  <p key={purchase.batchId} className="text-sm" data-testid="chain-purchase">
                    {purchase.productName} · {purchase.lotCode}
                    {purchase.supplier ? ` · ${purchase.supplier.name}` : ""}
                    {purchase.invoiceNumber ? (
                      fileHref && purchase.invoicePath ? (
                        <a
                          href={fileHref(purchase.invoicePath)}
                          className="ml-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          <FileText className="size-3" />
                          {purchase.invoiceNumber}
                        </a>
                      ) : (
                        <span className="ml-1 text-muted-foreground">
                          · {purchase.invoiceNumber}
                        </span>
                      )
                    ) : null}
                  </p>
                ))
              )}
            </div>

            <div className="grid gap-1">
              <p className="text-sm font-medium">{t("records")}</p>
              {production.records.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noRecords")}</p>
              ) : (
                production.records.map((r) => (
                  <p key={r.id} className="text-sm" data-testid="chain-record">
                    <Badge variant={r.passed ? "secondary" : "destructive"} className="mr-1">
                      {r.passed ? "OK" : t("failed")}
                    </Badge>
                    {r.controlPointName}: {r.value}
                    {r.measurementKind ? ` (${t(`kind.${r.measurementKind}`)})` : ""}
                    {r.performedBy ? ` · ${r.performedBy}` : ""}
                    {r.isLate ? ` · ${t("late")}` : ""}
                  </p>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {suppliers.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("suppliers", { names: suppliers.map((s) => s.name).join(", ") })}
        </p>
      ) : null}
    </div>
  );
}
