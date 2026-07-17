"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { quickReceiveAction, type QuickReceiveState } from "../_actions";
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

type LineDraft = { productId: string; quantity: number; unit: string };

/** §9.3 quick receive: market purchases without invoice — still traceable. */
export function QuickReceiveForm({
  siteId,
  suppliers,
  products,
}: {
  siteId: string;
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string; unit_default: string }[];
}) {
  const t = useTranslations("receive");
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<string>("new");
  const [supplierName, setSupplierName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addLine(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) => [
      ...prev,
      { productId, quantity: 1, unit: product.unit_default || "pcs" },
    ]);
  }

  function step(index: number, delta: number) {
    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? { ...line, quantity: Math.max(0.1, Math.round((line.quantity + delta) * 10) / 10) }
          : line,
      ),
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result: QuickReceiveState = await quickReceiveAction({
        siteId,
        supplierId: supplierId === "new" ? null : supplierId,
        supplierName: supplierId === "new" ? supplierName.trim() || null : null,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unit: line.unit as "kg" | "g" | "l" | "ml" | "pcs" | "box",
        })),
        receiving: null,
      });
      if (result && "ok" in result) {
        toast.success(t("quickDoneToast"));
        router.push(`/app/${siteId}/receive`);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label>{t("supplierLabel")}</Label>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="min-h-12" data-testid="quick-supplier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">{t("newSupplier")}</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {supplierId === "new" ? (
          <Input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder={t("newSupplierPlaceholder")}
            className="min-h-12"
            data-testid="quick-supplier-name"
          />
        ) : null}
      </div>

      <div className="grid gap-1">
        <Label>{t("addProductLabel")}</Label>
        <Select value="" onValueChange={addLine}>
          <SelectTrigger className="min-h-12" data-testid="quick-add-product">
            <SelectValue placeholder={t("addProductPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noProductsHint")}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {lines.map((line, index) => {
          const product = products.find((p) => p.id === line.productId);
          return (
            <div
              key={`${line.productId}-${index}`}
              className="flex items-center gap-2 rounded-lg border p-2"
              data-testid={`quick-line-${index}`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {product?.name}
              </span>
              <Button type="button" variant="outline" size="icon" className="size-12" onClick={() => step(index, -1)}>
                <Minus className="size-4" />
              </Button>
              <span className="w-16 text-center font-mono" data-testid={`quick-qty-${index}`}>
                {line.quantity} {line.unit}
              </span>
              <Button type="button" variant="outline" size="icon" className="size-12" onClick={() => step(index, 1)} data-testid={`quick-plus-${index}`}>
                <Plus className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-12"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
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
        disabled={pending || lines.length === 0 || (supplierId === "new" && !supplierName.trim())}
        onClick={submit}
        data-testid="quick-submit"
      >
        {t("quickSubmit")}
      </Button>
    </div>
  );
}
