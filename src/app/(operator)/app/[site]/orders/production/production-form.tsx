"use client";

// §1.4/§4.5: "today I cooked ragù, for these orders". The operator corrects a
// proposal instead of composing an entry, and never sees the word "batch" —
// ingredients are named by what they are, and the relation is built for them.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { logProduction, type OrderState } from "../_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string };
type OrderOption = Option & { eventDate: string; portions: number | null };

export function ProductionForm({
  siteId,
  today,
  batches,
  orders,
}: {
  siteId: string;
  today: string;
  batches: Option[];
  orders: OrderOption[];
}) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [productName, setProductName] = useState("");
  const [producedOn, setProducedOn] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [useBy, setUseBy] = useState("");
  // pre-selected: everything currently in stock is a plausible input, and the
  // upcoming orders are the plausible destinations. Deselect what doesn't apply.
  const [batchIds, setBatchIds] = useState<string[]>(batches.map((b) => b.id));
  const [orderIds, setOrderIds] = useState<string[]>(orders.map((o) => o.id));
  const [pending, startTransition] = useTransition();

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function save() {
    if (!productName.trim()) {
      toast.error(t("productRequired"));
      return;
    }
    startTransition(async () => {
      const result: OrderState = await logProduction({
        siteId,
        productName,
        producedOn,
        quantity: quantity ? Number(quantity) : undefined,
        useBy: useBy || undefined,
        batchIds,
        orderIds,
      });
      if (result && "ok" in result) {
        toast.success(t("productionLogged"));
        router.push(`/app/${siteId}/orders`);
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="productName">{t("product")}</Label>
            <Input
              id="productName"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="min-h-12"
              data-testid="production-product"
              placeholder={t("productPlaceholder")}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="producedOn">{t("producedOn")}</Label>
              <Input
                id="producedOn"
                type="date"
                value={producedOn}
                onChange={(e) => setProducedOn(e.target.value)}
                className="min-h-12"
              />
            </div>
            <div className="grid flex-1 gap-2">
              <Label htmlFor="quantity">{t("quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="min-h-12"
                data-testid="production-quantity"
              />
            </div>
          </div>
          {/* §26.6: the durability period is the business's own decision. The
              app offers the field and computes from a configured rule — it
              never suggests a shelf life of its own. */}
          <div className="grid gap-2">
            <Label htmlFor="useBy">{t("useBy")}</Label>
            <Input
              id="useBy"
              type="date"
              value={useBy}
              onChange={(e) => setUseBy(e.target.value)}
              className="min-h-12"
              data-testid="production-useby"
            />
            <p className="text-xs text-muted-foreground">{t("useByHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 py-4">
          <p className="font-medium">{t("ingredientsUsed")}</p>
          <p className="text-sm text-muted-foreground">{t("ingredientsHint")}</p>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noStock")}</p>
          ) : (
            <div className="grid gap-2">
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(batchIds, setBatchIds, b.id)}
                  aria-pressed={batchIds.includes(b.id)}
                  data-testid="production-batch"
                  className={cn(
                    "min-h-12 rounded-xl border px-3 text-left text-sm",
                    batchIds.includes(b.id) ? "border-primary bg-primary/5 font-medium" : "",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 py-4">
          <p className="font-medium">{t("forOrders")}</p>
          <p className="text-sm text-muted-foreground">{t("forOrdersHint")}</p>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUpcomingOrders")}</p>
          ) : (
            <div className="grid gap-2">
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(orderIds, setOrderIds, o.id)}
                  aria-pressed={orderIds.includes(o.id)}
                  data-testid="production-order"
                  className={cn(
                    "min-h-12 rounded-xl border px-3 text-left text-sm",
                    orderIds.includes(o.id) ? "border-primary bg-primary/5 font-medium" : "",
                  )}
                >
                  {o.label}
                  <span className="block text-muted-foreground">
                    {o.eventDate}
                    {o.portions ? ` · ${o.portions}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="min-h-14"
        disabled={pending}
        onClick={save}
        data-testid="save-production"
      >
        {t("saveProduction")}
      </Button>
    </div>
  );
}
