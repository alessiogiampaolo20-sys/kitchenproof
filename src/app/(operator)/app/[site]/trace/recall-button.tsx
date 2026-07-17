"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileWarning } from "lucide-react";
import { createRecallReport, type RecallState } from "./_actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** §9.6: one-tap recall report over the current search scope. */
export function RecallButton({
  siteId,
  query,
  fromDate,
  toDate,
}: {
  siteId: string;
  query: string;
  fromDate: string | null;
  toDate: string | null;
}) {
  const t = useTranslations("trace");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(false);
    startTransition(async () => {
      const result: RecallState = await createRecallReport({
        siteId,
        query,
        fromDate,
        toDate,
        reason: reason.trim(),
      });
      if (result && "ok" in result) {
        toast.success(t("recallDoneToast"));
        // explicit link instead of window.open — popup blockers kill
        // async window.open, and the inspector needs a tappable link anyway
        setUrl(result.url);
      } else {
        setError(true);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="ml-auto" data-testid="recall-button">
          <FileWarning className="size-4" />
          {t("recallButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recallTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("recallHint", { query })}
        </p>
        <div className="grid gap-1">
          <Label htmlFor="recall-reason">{t("recallReasonLabel")}</Label>
          <Textarea
            id="recall-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            data-testid="recall-reason"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {t("recallError")}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          {url ? (
            <Button asChild className="min-h-12">
              <a href={url} target="_blank" rel="noreferrer" data-testid="recall-open">
                {t("recallOpen")}
              </a>
            </Button>
          ) : (
            <Button
              variant="destructive"
              className="min-h-12"
              disabled={pending || !reason.trim()}
              onClick={generate}
              data-testid="recall-generate"
            >
              {t("recallGenerate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
