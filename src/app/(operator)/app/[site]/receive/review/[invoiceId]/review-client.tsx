"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, ExternalLink, X } from "lucide-react";
import { confirmInvoiceAction, type ConfirmInvoiceState } from "../../_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ReviewLine = {
  id: string;
  lineNo: number;
  rawText: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  lotCode: string | null;
  isFood: boolean;
  confidence: number | null;
  needsReview: boolean;
  page: number | null;
  productId: string | null;
  productName: string | null;
  productIsNew: boolean;
  allergens: string[];
  allergensAiSuggested: boolean;
};

/**
 * §9.1 review UX: high-confidence rows collapsed green; only problems
 * expanded; non-food auto-hidden under "excluded"; one Confirm-all button
 * with the §9.3 receiving mini-form inline.
 */
export function InvoiceReview({
  siteId,
  invoiceId,
  kind,
  isDuplicate,
  totalMismatchPct,
  lines,
  catalog,
  originals,
}: {
  siteId: string;
  invoiceId: string;
  kind: string;
  isDuplicate: boolean;
  totalMismatchPct: number | null;
  lines: ReviewLine[];
  catalog: { id: string; name: string }[];
  originals: { name: string; url: string }[];
}) {
  const t = useTranslations("receive");
  const router = useRouter();
  const [decisions, setDecisions] = useState(
    () =>
      new Map(
        lines.map((line) => [
          line.id,
          { include: line.isFood, productId: line.productId },
        ]),
      ),
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(lines.filter((l) => l.needsReview && l.isFood).map((l) => l.id)),
  );
  const [showExcluded, setShowExcluded] = useState(false);
  const [temp, setTemp] = useState("");
  const [transportOk, setTransportOk] = useState<boolean | null>(null);
  const [packagingOk, setPackagingOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const foodLines = useMemo(() => lines.filter((l) => l.isFood), [lines]);
  const nonFood = useMemo(() => lines.filter((l) => !l.isFood), [lines]);
  const problems = foodLines.filter((l) => l.needsReview).length;

  function setDecision(lineId: string, patch: Partial<{ include: boolean; productId: string | null }>) {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(lineId, { ...next.get(lineId)!, ...patch });
      return next;
    });
  }

  function confirmAll() {
    setError(null);
    startTransition(async () => {
      const receiving =
        temp !== "" || transportOk !== null || packagingOk !== null
          ? {
              tempReading: temp === "" ? null : Number(temp.replace(",", ".")),
              transportTempOk: transportOk,
              packagingOk,
            }
          : null;
      const result: ConfirmInvoiceState = await confirmInvoiceAction({
        siteId,
        invoiceId,
        lines: [...decisions.entries()].map(([lineId, decision]) => ({
          lineId,
          include: decision.include,
          productId: decision.productId,
        })),
        receiving,
      });
      if (result && "ok" in result) {
        toast.success(t("confirmedToast", { count: result.batches }));
        router.push(`/app/${siteId}/receive`);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <div className="grid gap-3">
      {isDuplicate ? (
        <Card className="border-destructive" data-testid="duplicate-warning">
          <CardContent className="flex items-center gap-2 py-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
            {t("duplicateWarning")}
          </CardContent>
        </Card>
      ) : null}
      {totalMismatchPct !== null ? (
        <Card className="border-destructive" data-testid="total-mismatch-warning">
          <CardContent className="flex items-center gap-2 py-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
            {t("totalMismatchWarning", { pct: totalMismatchPct })}
          </CardContent>
        </Card>
      ) : null}

      {originals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {originals.map((original) => (
            <Button key={original.url} asChild variant="outline" size="sm">
              <a href={original.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                {original.name}
              </a>
            </Button>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground" data-testid="review-summary">
        {t("reviewSummary", { total: foodLines.length, problems })}
      </p>

      {/* food lines: green collapsed / expanded problems */}
      <div className="grid gap-2">
        {foodLines.map((line) => {
          const decision = decisions.get(line.id)!;
          const isOpen = expanded.has(line.id);
          const state = !decision.include
            ? "excluded"
            : line.needsReview
              ? decision.productId
                ? "attention"
                : "missing"
              : "ok";
          return (
            <Card
              key={line.id}
              data-testid={`line-${line.lineNo}`}
              className={
                state === "ok"
                  ? "border-emerald-300"
                  : state === "excluded"
                    ? "opacity-50"
                    : "border-amber-400"
              }
            >
              <CardContent className="grid gap-2 py-3">
                <button
                  type="button"
                  className="flex min-h-8 w-full items-center gap-2 text-left"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(line.id)) next.delete(line.id);
                      else next.add(line.id);
                      return next;
                    })
                  }
                >
                  {state === "ok" ? (
                    <Check className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {line.description}
                  </span>
                  {line.quantity !== null ? (
                    <span className="text-sm text-muted-foreground">
                      {line.quantity} {line.unit ?? ""}
                    </span>
                  ) : null}
                  {line.productIsNew && decision.productId ? (
                    <Badge variant="secondary" data-testid="new-product-badge">
                      {t("newProduct")}
                    </Badge>
                  ) : null}
                  <ChevronDown className={`size-4 shrink-0 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen ? (
                  <div className="grid gap-2 border-t pt-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      {line.rawText}
                      {line.page ? ` · ${t("pageBadge", { page: line.page })}` : ""}
                      {line.lotCode ? ` · lot ${line.lotCode}` : ""}
                      {line.confidence !== null
                        ? ` · ${Math.round(line.confidence * 100)}%`
                        : ""}
                    </p>
                    {line.allergensAiSuggested && line.allergens.length > 0 ? (
                      <p className="text-xs text-amber-700" data-testid="allergen-suggestion">
                        {t("allergensSuggested", { list: line.allergens.join(", ") })}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={decision.productId ?? "none"}
                        onValueChange={(value) =>
                          setDecision(line.id, { productId: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="min-h-12 flex-1" data-testid={`product-select-${line.lineNo}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("noProduct")}</SelectItem>
                          {catalog.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant={decision.include ? "outline" : "default"}
                        className="min-h-12"
                        onClick={() => setDecision(line.id, { include: !decision.include })}
                        data-testid={`toggle-line-${line.lineNo}`}
                      >
                        {decision.include ? <X className="size-4" /> : <Check className="size-4" />}
                        {decision.include ? t("excludeLine") : t("includeLine")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* non-food excluded group (§9.1) */}
      {nonFood.length > 0 ? (
        <Card>
          <CardContent className="py-3">
            <button
              type="button"
              className="flex min-h-8 w-full items-center gap-2 text-sm text-muted-foreground"
              onClick={() => setShowExcluded((v) => !v)}
              data-testid="excluded-toggle"
            >
              <ChevronDown className={`size-4 transition ${showExcluded ? "rotate-180" : ""}`} />
              {t("excludedGroup", { count: nonFood.length })}
            </button>
            {showExcluded ? (
              <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
                {nonFood.map((line) => (
                  <li key={line.id} className="truncate">
                    {line.description}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* §9.3 receiving mini-form (5 seconds) — skipped for credit notes */}
      {kind !== "credit_note" ? (
        <Card data-testid="receiving-form">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("receivingTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="recv-temp">{t("receivingTemp")}</Label>
              <Input
                id="recv-temp"
                inputMode="decimal"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                placeholder="4,0"
                className="min-h-12 max-w-32"
                data-testid="receiving-temp"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={transportOk === true ? "default" : "outline"}
                className="min-h-12"
                onClick={() => setTransportOk(transportOk === true ? null : true)}
                data-testid="transport-ok"
              >
                {t("transportOk")}
              </Button>
              <Button
                type="button"
                variant={transportOk === false ? "destructive" : "outline"}
                className="min-h-12"
                onClick={() => setTransportOk(transportOk === false ? null : false)}
              >
                {t("transportNotOk")}
              </Button>
              <Button
                type="button"
                variant={packagingOk === true ? "default" : "outline"}
                className="min-h-12"
                onClick={() => setPackagingOk(packagingOk === true ? null : true)}
                data-testid="packaging-ok"
              >
                {t("packagingOk")}
              </Button>
              <Button
                type="button"
                variant={packagingOk === false ? "destructive" : "outline"}
                className="min-h-12"
                onClick={() => setPackagingOk(packagingOk === false ? null : false)}
              >
                {t("packagingNotOk")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("receivingHint")}</p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="min-h-14"
        disabled={pending}
        onClick={confirmAll}
        data-testid="confirm-invoice"
      >
        {t("confirmButton")}
      </Button>
    </div>
  );
}
