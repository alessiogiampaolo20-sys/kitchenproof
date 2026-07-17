"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  createInvoiceAction,
  extractInvoiceAction,
  type ReceiveActionState,
} from "./_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** §9.1: photograph or upload the invoice; extraction follows immediately. */
export function InvoiceUpload({ siteId }: { siteId: string }) {
  const t = useTranslations("receive");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "extracting">("idle");
  const [, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setPhase("uploading");
    startTransition(async () => {
      const created: ReceiveActionState = await createInvoiceAction(null, formData);
      if (!created || "error" in created) {
        setPhase("idle");
        setError(created && "error" in created ? created.error : "error");
        return;
      }
      setPhase("extracting");
      const extracted = await extractInvoiceAction({
        siteId,
        invoiceId: created.invoiceId,
      });
      if (!extracted || "error" in extracted) {
        setPhase("idle");
        setError(extracted && "error" in extracted ? extracted.error : "error");
        return;
      }
      router.push(`/app/${siteId}/receive/review/${created.invoiceId}`);
    });
  }

  return (
    <form action={handleSubmit} className="grid gap-3">
      <input type="hidden" name="siteId" value={siteId} />
      <Input
        type="file"
        name="files"
        multiple
        required
        accept=".pdf,image/jpeg,image/png,image/webp"
        capture="environment"
        className="min-h-12"
        data-testid="invoice-files"
        disabled={phase !== "idle"}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="min-h-14"
        disabled={phase !== "idle"}
        data-testid="invoice-submit"
      >
        {phase !== "idle" ? <Loader2 className="size-4 animate-spin" /> : null}
        {phase === "uploading"
          ? t("uploading")
          : phase === "extracting"
            ? t("extracting")
            : t("uploadButton")}
      </Button>
    </form>
  );
}
