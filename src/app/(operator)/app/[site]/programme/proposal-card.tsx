"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { GitPullRequestArrow } from "lucide-react";
import { decideProposal, type ProposalDecisionState } from "./review/_actions";
import type { TemplateDiffItem } from "@/lib/compliance/template";
import { formatLimit } from "@/lib/compliance/limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function fmt(field: TemplateDiffItem["field"], value: unknown): string {
  if (value == null) return "—";
  if (field === "frequency") {
    const frequency = value as { times?: string[]; perEvent?: boolean };
    return frequency.perEvent ? "per event" : (frequency.times ?? []).join(", ");
  }
  try {
    return formatLimit(value);
  } catch {
    return JSON.stringify(value);
  }
}

/** §11 central push → local decision (apply, or reject with justification). */
export function ProposalCard({
  siteId,
  proposalId,
  templateName,
  items,
}: {
  siteId: string;
  proposalId: string;
  templateName: string;
  items: TemplateDiffItem[];
}) {
  const t = useTranslations("proposals");
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(action: "apply" | "reject") {
    setError(null);
    startTransition(async () => {
      const result: ProposalDecisionState = await decideProposal({
        siteId,
        proposalId,
        action,
        justification: justification.trim() || null,
      });
      if (result && "ok" in result) {
        toast.success(action === "apply" ? t("appliedToast") : t("rejectedToast"));
        router.refresh();
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <Card className="border-sky-400" data-testid="proposal-card">
      <CardContent className="grid gap-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <GitPullRequestArrow className="size-4 shrink-0 text-sky-600" />
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t("title", { template: templateName })}
          </span>
          <Badge variant="secondary">{t("changeCount", { count: items.length })}</Badge>
        </div>
        <div className="grid gap-1 text-sm">
          {items.map((item, index) => (
            <p key={index} data-testid="proposal-item">
              <span className="font-medium">{item.templateKey}</span> (
              {t(`fields.${item.field}`)}):{" "}
              <span className="font-mono">{fmt(item.field, item.siteValue)}</span> →{" "}
              <span className="font-mono font-semibold">
                {fmt(item.field, item.templateValue)}
              </span>
            </p>
          ))}
        </div>
        {rejecting ? (
          <div className="grid gap-2">
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t("justificationPlaceholder")}
              rows={2}
              data-testid="proposal-justification"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="min-h-12 flex-1"
                disabled={pending || !justification.trim()}
                onClick={() => decide("reject")}
                data-testid="confirm-reject-proposal"
              >
                {t("rejectConfirm")}
              </Button>
              <Button variant="outline" className="min-h-12" onClick={() => setRejecting(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              className="min-h-12 flex-1"
              disabled={pending}
              onClick={() => decide("apply")}
              data-testid="apply-proposal"
            >
              {t("applyButton")}
            </Button>
            <Button
              variant="outline"
              className="min-h-12 flex-1"
              disabled={pending}
              onClick={() => setRejecting(true)}
              data-testid="reject-proposal"
            >
              {t("rejectButton")}
            </Button>
          </div>
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
