"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { createPrepBatch, type PrepActionState } from "../_actions";
import { PREP_DEFAULT_EXPIRY_DAYS } from "@/lib/inventory/batch-plan";
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

type InputBatch = {
  id: string;
  name: string;
  lotCode: string;
  remaining: number;
  unit: string;
};

/** §9.4: pick input batches → named output with internal expiry. */
export function PrepForm({
  siteId,
  batches,
}: {
  siteId: string;
  batches: InputBatch[];
}) {
  const t = useTranslations("prep");
  const router = useRouter();
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [outputName, setOutputName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("l");
  const [expiryDays, setExpiryDays] = useState(PREP_DEFAULT_EXPIRY_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(batch: InputBatch) {
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
      const result: PrepActionState = await createPrepBatch({
        siteId,
        outputName: outputName.trim(),
        quantity: Number(quantity.replace(",", ".")),
        unit,
        expiryDays,
        inputs: [...selected.entries()].map(([batchId, qty]) => ({
          batchId,
          quantity: qty,
        })),
      });
      if (result && "ok" in result) {
        toast.success(t("doneToast"));
        router.push(`/app/${siteId}/stock/batch/${result.batchId}`);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>{t("inputsLabel")}</Label>
        {batches.map((batch) => {
          const isSelected = selected.has(batch.id);
          return (
            <div key={batch.id} className="flex items-center gap-2">
              <Button
                type="button"
                variant={isSelected ? "default" : "outline"}
                className="min-h-12 flex-1 justify-start"
                onClick={() => toggle(batch)}
                data-testid={`prep-input-${batch.id}`}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {batch.name} · {batch.lotCode}
                </span>
                <span className="text-xs opacity-80">
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
                  className="min-h-12 w-20"
                  data-testid={`prep-qty-${batch.id}`}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-1">
        <Label htmlFor="prep-name">{t("outputLabel")}</Label>
        <Input
          id="prep-name"
          value={outputName}
          onChange={(e) => setOutputName(e.target.value)}
          placeholder={t("outputPlaceholder")}
          className="min-h-12"
          data-testid="prep-name"
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="prep-quantity">{t("quantityLabel")}</Label>
          <Input
            id="prep-quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="min-h-12 w-24"
            data-testid="prep-quantity"
          />
        </div>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="min-h-12 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["kg", "g", "l", "ml", "pcs"].map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-1">
          <Label>{t("expiryLabel")}</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="size-12"
              onClick={() => setExpiryDays((d) => Math.max(1, d - 1))}>
              <Minus className="size-4" />
            </Button>
            <span className="w-16 text-center font-mono" data-testid="prep-expiry-days">
              {expiryDays} {t("days")}
            </span>
            <Button type="button" variant="outline" size="icon" className="size-12"
              onClick={() => setExpiryDays((d) => Math.min(30, d + 1))}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
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
        disabled={pending || selected.size === 0 || !outputName.trim() || !Number(quantity.replace(",", "."))}
        onClick={submit}
        data-testid="prep-submit"
      >
        {t("submit")}
      </Button>
    </div>
  );
}
