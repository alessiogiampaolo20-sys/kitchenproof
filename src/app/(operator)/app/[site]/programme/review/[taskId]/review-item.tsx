"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ShieldQuestion } from "lucide-react";
import { decideReviewItem, type ReviewDecisionState } from "../_actions";
import type { PackDiffItem } from "@/lib/compliance/pack-update";
import { formatLimit } from "@/lib/compliance/limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function formatValue(kind: PackDiffItem["kind"], value: unknown): string {
  if (value == null) return "—";
  if (kind === "frequency_changed") {
    const frequency = value as { times?: string[]; perEvent?: boolean };
    return frequency.perEvent ? "per event" : (frequency.times ?? []).join(", ");
  }
  try {
    return formatLimit(value);
  } catch {
    return JSON.stringify(value);
  }
}

/** §13 diff card: pack before → pack after → the site's current value. */
export function ReviewItemCard({
  siteId,
  taskId,
  item,
  cpName,
  readonly,
}: {
  siteId: string;
  taskId: string;
  item: PackDiffItem;
  cpName: string;
  readonly: boolean;
}) {
  const t = useTranslations("review");
  const router = useRouter();
  const [keeping, setKeeping] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(action: "apply" | "keep") {
    setError(null);
    startTransition(async () => {
      const result: ReviewDecisionState = await decideReviewItem({
        siteId,
        taskId,
        itemKey: item.key,
        itemKind: item.kind,
        action,
        justification: action === "keep" ? justification.trim() || null : null,
      });
      if (result && "ok" in result) {
        toast.success(result.resolved ? t("resolvedToast") : t("decidedToast"));
        router.refresh();
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <Card data-testid={`review-item-${item.key}-${item.kind}`}>
      <CardContent className="grid gap-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-sm font-medium">{cpName}</span>
          <Badge variant="outline">{t(`kinds.${item.kind}`)}</Badge>
          {item.decision ? (
            <Badge
              variant={item.decision.action === "applied" ? "default" : "secondary"}
              data-testid="item-decision"
            >
              {t(`decisions.${item.decision.action}`)}
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-muted p-2">
            <p className="text-xs text-muted-foreground">{t("packBefore")}</p>
            <p className="font-mono" data-testid="diff-before">
              {formatValue(item.kind, item.before)}
            </p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2">
            <p className="text-xs text-muted-foreground">{t("packAfter")}</p>
            <p className="font-mono font-semibold" data-testid="diff-after">
              {formatValue(item.kind, item.after)}
            </p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">{t("siteCurrent")}</p>
            <p className="font-mono" data-testid="diff-site">
              {formatValue(item.kind, item.siteValue)}
            </p>
          </div>
        </div>

        {item.decision?.justification ? (
          <p className="text-xs text-muted-foreground">
            {t("justificationLabel")}: {item.decision.justification}
          </p>
        ) : null}

        {!readonly && !item.decision ? (
          <div className="grid gap-2">
            {keeping ? (
              <>
                <Textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder={t("justificationPlaceholder")}
                  rows={2}
                  data-testid="keep-justification"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="min-h-12 flex-1"
                    disabled={pending || !justification.trim()}
                    onClick={() => decide("keep")}
                    data-testid="confirm-keep"
                  >
                    {t("keepConfirm")}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-12"
                    onClick={() => setKeeping(false)}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <Button
                  className="min-h-12 flex-1"
                  disabled={pending}
                  onClick={() => decide("apply")}
                  data-testid="apply-change"
                >
                  <Check className="size-4" />
                  {t("applyButton")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-12 flex-1"
                  disabled={pending}
                  onClick={() => setKeeping(true)}
                  data-testid="keep-mine"
                >
                  <ShieldQuestion className="size-4" />
                  {t("keepButton")}
                </Button>
              </div>
            )}
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {t(`errors.${error}`)}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
