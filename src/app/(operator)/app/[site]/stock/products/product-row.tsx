"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Merge, Pencil, Star } from "lucide-react";
import { mergeProducts, updateProduct, type StockActionState } from "../_actions";
import { EU_ALLERGENS } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CatalogProductRow = {
  id: string;
  name: string;
  category: string;
  storage_type: string;
  default_shelf_life_days: number | null;
  allergens: string[];
  allergens_ai_suggested: boolean;
  unit_default: string;
  favourite: boolean;
  ai_created: boolean;
};

const CATEGORIES = [
  "meat", "fish", "dairy", "produce", "dry", "frozen",
  "beverage", "bakery", "packaging", "nonfood", "other",
] as const;
const STORAGES = ["fridge", "freezer", "dry", "ambient"] as const;

/** §9.2 catalog row: edit allergens/shelf-life, favourite, merge duplicates. */
export function ProductRow({
  siteId,
  product,
  mergeTargets,
}: {
  siteId: string;
  product: CatalogProductRow;
  mergeTargets: { id: string; name: string }[];
}) {
  const t = useTranslations("stock");
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [category, setCategory] = useState(product.category);
  const [storage, setStorage] = useState(product.storage_type);
  const [shelfLife, setShelfLife] = useState(
    product.default_shelf_life_days?.toString() ?? "",
  );
  const [allergens, setAllergens] = useState<string[]>(product.allergens);
  const [favourite, setFavourite] = useState(product.favourite);
  const [mergeTarget, setMergeTarget] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result: StockActionState = await updateProduct({
        siteId,
        productId: product.id,
        category,
        storageType: storage,
        shelfLifeDays: shelfLife === "" ? null : Number(shelfLife),
        allergens,
        favourite,
      });
      if (result && "ok" in result) {
        toast.success(t("saved"));
        setEditOpen(false);
      } else {
        toast.error(t("error"));
      }
    });
  }

  function merge() {
    if (!mergeTarget) return;
    startTransition(async () => {
      const result: StockActionState = await mergeProducts({
        siteId,
        sourceId: product.id,
        targetId: mergeTarget,
      });
      if (result && "ok" in result) {
        toast.success(t("mergedToast"));
        setMergeOpen(false);
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Card data-testid={`product-${product.id}`}>
      <CardContent className="flex flex-wrap items-center gap-2 py-3">
        {product.favourite ? <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {t(`categories.${product.category}`)} · {t(`storage.${product.storage_type}`)}
            {product.default_shelf_life_days
              ? ` · ${t("shelfLifeShort", { days: product.default_shelf_life_days })}`
              : ""}
          </p>
        </div>
        {product.allergens.length > 0 ? (
          <Badge
            variant={product.allergens_ai_suggested ? "secondary" : "outline"}
            data-testid={product.allergens_ai_suggested ? "allergens-unconfirmed" : "allergens-confirmed"}
          >
            {product.allergens.length}{" "}
            {product.allergens_ai_suggested ? t("allergensAi") : t("allergensLabel")}
          </Badge>
        ) : null}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`edit-product-${product.id}`}>
              <Pencil className="size-4" />
              <span className="sr-only">{t("edit")}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label>{t("categoryLabel")}</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="min-h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{t(`categories.${c}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label>{t("storageLabel")}</Label>
                  <Select value={storage} onValueChange={setStorage}>
                    <SelectTrigger className="min-h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STORAGES.map((s) => (
                        <SelectItem key={s} value={s}>{t(`storage.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`shelf-${product.id}`}>{t("shelfLifeLabel")}</Label>
                <Input
                  id={`shelf-${product.id}`}
                  inputMode="numeric"
                  value={shelfLife}
                  onChange={(e) => setShelfLife(e.target.value.replace(/\D/g, ""))}
                  className="min-h-12 max-w-32"
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("allergensLabel")}</Label>
                {product.allergens_ai_suggested ? (
                  <p className="text-xs text-amber-700">{t("allergensConfirmHint")}</p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {EU_ALLERGENS.map((allergen) => (
                    <Button
                      key={allergen}
                      type="button"
                      size="sm"
                      variant={allergens.includes(allergen) ? "default" : "outline"}
                      onClick={() =>
                        setAllergens((prev) =>
                          prev.includes(allergen)
                            ? prev.filter((a) => a !== allergen)
                            : [...prev, allergen],
                        )
                      }
                      data-testid={`allergen-${allergen}`}
                    >
                      {t(`euAllergens.${allergen}`)}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant={favourite ? "default" : "outline"}
                className="min-h-12"
                onClick={() => setFavourite((v) => !v)}
              >
                <Star className="size-4" />
                {t("favourite")}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={pending} className="min-h-12" data-testid="save-product">
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`merge-product-${product.id}`}>
              <Merge className="size-4" />
              <span className="sr-only">{t("merge")}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("mergeTitle", { name: product.name })}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("mergeHint")}</p>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger className="min-h-12" data-testid="merge-target">
                <SelectValue placeholder={t("mergeTargetPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                onClick={merge}
                disabled={pending || !mergeTarget}
                variant="destructive"
                className="min-h-12"
                data-testid="confirm-merge"
              >
                {t("mergeConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
