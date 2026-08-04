"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createOrder, type OrderState } from "./_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DESTINATIONS = ["catering", "private", "event", "community_delivery", "other"] as const;
const DELIVERY = ["cold", "warm", "mixed", "none"] as const;

export function NewOrderForm({ siteId }: { siteId: string }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<string>("catering");
  const [delivery, setDelivery] = useState<string>("cold");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: OrderState = await createOrder(null, formData);
      if (result && "ok" in result) {
        formRef.current?.reset();
        setFailed(false);
        setOpen(false);
        toast.success(t("created"));
        router.refresh();
      } else {
        setFailed(true);
      }
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        className="min-h-14 w-full"
        onClick={() => setOpen(true)}
        data-testid="new-order"
      >
        <Plus className="size-4" />
        {t("newOrder")}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <form ref={formRef} onSubmit={submit} className="grid gap-3">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="destination" value={destination} />
          <input type="hidden" name="deliveryMode" value={delivery} />

          <div className="grid gap-2">
            <Label htmlFor="orderRef">{t("orderRef")}</Label>
            <Input id="orderRef" name="orderRef" required className="min-h-12" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="clientName">{t("clientName")}</Label>
            <Input id="clientName" name="clientName" required className="min-h-12" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact">{t("contact")}</Label>
            <Input id="contact" name="contact" className="min-h-12" />
            <p className="text-xs text-muted-foreground">{t("contactHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eventDate">{t("eventDate")}</Label>
            <Input id="eventDate" name="eventDate" type="date" required className="min-h-12" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venueAddress">{t("venue")}</Label>
            <Input id="venueAddress" name="venueAddress" className="min-h-12" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="portions">{t("portions")}</Label>
            <Input id="portions" name="portions" type="number" min={0} className="min-h-12" />
          </div>

          {/* chips, not dropdowns: Radix Select ghost-clicks on touch */}
          <div className="grid gap-1">
            <Label>{t("destination")}</Label>
            <div className="flex flex-wrap gap-2">
              {DESTINATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDestination(d)}
                  aria-pressed={destination === d}
                  data-testid={`destination-${d}`}
                  className={cn(
                    "min-h-12 rounded-xl px-3 text-sm font-medium",
                    destination === d
                      ? "bg-primary text-primary-foreground"
                      : "border text-muted-foreground",
                  )}
                >
                  {t(`destinations.${d}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <Label>{t("delivery")}</Label>
            <div className="flex flex-wrap gap-2">
              {DELIVERY.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDelivery(d)}
                  aria-pressed={delivery === d}
                  data-testid={`delivery-${d}`}
                  className={cn(
                    "min-h-12 rounded-xl px-3 text-sm font-medium",
                    delivery === d
                      ? "bg-primary text-primary-foreground"
                      : "border text-muted-foreground",
                  )}
                >
                  {t(`deliveryModes.${d}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="min-h-12 flex-1" disabled={pending} data-testid="save-order">
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
          </div>
          {failed ? (
            <p className="text-sm text-destructive" role="alert">
              {t("error")}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
