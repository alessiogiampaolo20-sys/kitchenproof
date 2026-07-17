"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { createOutbound, type OutboundState } from "../_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OutBatch = {
  id: string;
  name: string;
  lotCode: string;
  remaining: number;
  unit: string;
};

/** §9.7 outbound B2B: customer + batches/quantities → moves + delivery note. */
export function OutboundForm({
  siteId,
  customers,
  batches,
}: {
  siteId: string;
  customers: { id: string; name: string }[];
  batches: OutBatch[];
}) {
  const t = useTranslations("outbound");
  const [customerId, setCustomerId] = useState<string>("new");
  const [customerName, setCustomerName] = useState("");
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [doneUrl, setDoneUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(batch: OutBatch) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(batch.id)) next.delete(batch.id);
      else next.set(batch.id, batch.remaining);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result: OutboundState = await createOutbound({
        siteId,
        customerId: customerId === "new" ? null : customerId,
        customerName: customerId === "new" ? customerName.trim() || null : null,
        lines: [...selected.entries()].map(([batchId, quantity]) => ({
          batchId,
          quantity,
        })),
      });
      if (result && "ok" in result) {
        toast.success(t("doneToast"));
        // explicit link — async window.open gets popup-blocked
        setDoneUrl(result.url);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  if (doneUrl) {
    return (
      <div className="grid gap-3">
        <p className="text-sm">{t("doneHint")}</p>
        <Button asChild size="lg" className="min-h-14">
          <a href={doneUrl} target="_blank" rel="noreferrer" data-testid="delivery-note-link">
            <FileText className="size-4" />
            {t("openNote")}
          </a>
        </Button>
        <Button asChild variant="outline" size="lg" className="min-h-14">
          <Link href={`/app/${siteId}/stock`}>{t("backToStock")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label>{t("customerLabel")}</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="min-h-12" data-testid="outbound-customer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">{t("newCustomer")}</SelectItem>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {customerId === "new" ? (
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={t("newCustomerPlaceholder")}
            className="min-h-12"
            data-testid="outbound-customer-name"
          />
        ) : null}
      </div>

      <div className="grid min-w-0 gap-2">
        <Label>{t("batchesLabel")}</Label>
        {batches.map((batch) => {
          const isSelected = selected.has(batch.id);
          return (
            <div key={batch.id} className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant={isSelected ? "default" : "outline"}
                className="min-h-12 min-w-0 flex-1 justify-start"
                onClick={() => toggle(batch)}
                data-testid={`outbound-batch-${batch.id}`}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {batch.name} · {batch.lotCode}
                </span>
                <span className="shrink-0 text-xs opacity-80">
                  {batch.remaining} {batch.unit}
                </span>
              </Button>
              {isSelected ? (
                <Input
                  inputMode="decimal"
                  value={String(selected.get(batch.id))}
                  onChange={(e) =>
                    setSelected((prev) =>
                      new Map(prev).set(
                        batch.id,
                        Number(e.target.value.replace(",", ".")) || 0,
                      ),
                    )
                  }
                  className="min-h-12 w-20 shrink-0"
                  data-testid={`outbound-qty-${batch.id}`}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="min-h-14"
        disabled={
          pending ||
          selected.size === 0 ||
          (customerId === "new" && !customerName.trim())
        }
        onClick={submit}
        data-testid="outbound-submit"
      >
        {t("submit")}
      </Button>
    </div>
  );
}
