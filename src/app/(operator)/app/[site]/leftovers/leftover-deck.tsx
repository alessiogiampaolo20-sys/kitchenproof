"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Minus, Plus, SkipForward, Trash2, UtensilsCrossed } from "lucide-react";
import {
  completeLeftoverSession,
  recordLeftoverDecision,
  startLeftoverSession,
  type StartSessionState,
} from "./_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type DeckItem = {
  batchId: string;
  name: string;
  lotCode: string;
  remaining: number;
  unit: string;
  expiryDate: string | null;
  produced: boolean;
};

const WASTE_REASONS = ["expired", "overproduction", "deviation", "dropped", "other"] as const;

/**
 * §9.5 end-of-service deck: one thumb decision per card —
 * Brugt op / Gemt (optional stepper) / Kasseret (reason chip) / Skip.
 * Target: 25 items ≤ 2 minutes.
 */
export function LeftoverDeck({ siteId, items }: { siteId: string; items: DeckItem[] }) {
  const t = useTranslations("leftovers");
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"main" | "discard" | "keep">("main");
  const [keepQty, setKeepQty] = useState(0);
  const [decided, setDecided] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [noActor, setNoActor] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = items[index];

  function start() {
    startTransition(async () => {
      const label = new Date().getHours() < 16 ? "lunch" : "dinner";
      const result: StartSessionState = await startLeftoverSession({
        siteId,
        serviceLabel: label,
      });
      if (result && "ok" in result) setSessionId(result.sessionId);
      else if (result && result.error === "noActor") setNoActor(true);
    });
  }

  function advance(wasDecision: boolean, wasDiscard = false) {
    const nextDecided = decided + (wasDecision ? 1 : 0);
    const nextDiscarded = discarded + (wasDiscard ? 1 : 0);
    setDecided(nextDecided);
    setDiscarded(nextDiscarded);
    setMode("main");
    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }
    // deck done → close the session
    startTransition(async () => {
      await completeLeftoverSession({
        siteId,
        sessionId: sessionId!,
        itemsCount: nextDecided,
        discardedCount: nextDiscarded,
      });
      toast.success(t("doneToast", { count: nextDecided }));
      router.push(`/app/${siteId}/stock`);
    });
  }

  function decide(
    decision: "used_up" | "kept" | "discarded",
    extra?: { newRemaining?: number; reason?: (typeof WASTE_REASONS)[number] },
  ) {
    if (!sessionId || !current) return;
    const batchId = current.batchId;
    startTransition(async () => {
      const result = await recordLeftoverDecision({
        siteId,
        sessionId,
        batchId,
        decision,
        newRemaining: extra?.newRemaining ?? null,
        reason: extra?.reason ?? null,
      });
      if (result && "ok" in result) {
        advance(true, decision === "discarded");
      } else if (result && "error" in result && result.error === "noActor") {
        setNoActor(true);
      }
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {t("empty")}
        </CardContent>
      </Card>
    );
  }

  if (noActor) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive" role="alert">
          {t("noActor")}
        </CardContent>
      </Card>
    );
  }

  if (!sessionId) {
    return (
      <Card>
        <CardContent className="grid gap-3 py-6">
          <p className="text-sm">{t("startHint", { count: items.length })}</p>
          <Button size="lg" className="min-h-14" onClick={start} disabled={pending} data-testid="start-session">
            {t("startButton")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!current) return null;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground" data-testid="deck-progress">
        {t("progress", { current: index + 1, total: items.length })}
      </p>
      <Card data-testid="deck-card">
        <CardContent className="grid gap-3 py-5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-lg font-semibold">{current.name}</span>
            {current.produced ? <Badge variant="outline">{t("produced")}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {current.remaining} {current.unit} · {current.lotCode}
            {current.expiryDate ? ` · ${t("expires")} ${current.expiryDate}` : ""}
          </p>

          {mode === "main" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="lg"
                className="min-h-16"
                disabled={pending}
                onClick={() => decide("used_up")}
                data-testid="deck-used-up"
              >
                <UtensilsCrossed className="size-5" />
                {t("usedUp")}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="min-h-16"
                disabled={pending}
                onClick={() => {
                  setKeepQty(current.remaining);
                  setMode("keep");
                }}
                data-testid="deck-keep"
              >
                <Check className="size-5" />
                {t("kept")}
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="min-h-16"
                disabled={pending}
                onClick={() => setMode("discard")}
                data-testid="deck-discard"
              >
                <Trash2 className="size-5" />
                {t("discarded")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-16"
                disabled={pending}
                onClick={() => advance(false)}
                data-testid="deck-skip"
              >
                <SkipForward className="size-5" />
                {t("skip")}
              </Button>
            </div>
          ) : null}

          {mode === "keep" ? (
            <div className="grid gap-3" data-testid="keep-panel">
              <div className="flex items-center justify-center gap-2">
                <Button type="button" variant="outline" size="icon" className="size-14"
                  onClick={() => setKeepQty((q) => Math.max(0, Math.round((q - 1) * 10) / 10))}>
                  <Minus className="size-5" />
                </Button>
                <span className="w-24 text-center font-mono text-lg" data-testid="keep-qty">
                  {keepQty} {current.unit}
                </span>
                <Button type="button" variant="outline" size="icon" className="size-14"
                  onClick={() => setKeepQty((q) => Math.round((q + 1) * 10) / 10)}>
                  <Plus className="size-5" />
                </Button>
              </div>
              <Button
                size="lg"
                className="min-h-14"
                disabled={pending}
                onClick={() =>
                  decide("kept", {
                    newRemaining: keepQty < current.remaining ? keepQty : undefined,
                  })
                }
                data-testid="keep-confirm"
              >
                {t("keepConfirm")}
              </Button>
            </div>
          ) : null}

          {mode === "discard" ? (
            <div className="grid grid-cols-2 gap-2" data-testid="discard-panel">
              {WASTE_REASONS.map((reason) => (
                <Button
                  key={reason}
                  size="lg"
                  variant="outline"
                  className="min-h-14"
                  disabled={pending}
                  onClick={() => decide("discarded", { reason })}
                  data-testid={`discard-${reason}`}
                >
                  {t(`reasons.${reason}`)}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
