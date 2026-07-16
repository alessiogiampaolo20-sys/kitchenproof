"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  createImportAction,
  extractImportAction,
  type ImportActionState,
} from "./_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * §7.5 upload: paper photos (multi-capture via the file input's camera mode),
 * PDF, DOCX or XLSX. Originals are stored permanently; extraction follows
 * immediately and lands on the side-by-side review.
 */
export function ImportUpload({ siteId }: { siteId: string }) {
  const t = useTranslations("importRa");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "extracting">("idle");
  const [, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setPhase("uploading");
    startTransition(async () => {
      const created: ImportActionState = await createImportAction(null, formData);
      if (!created || "error" in created) {
        setPhase("idle");
        setError(created && "error" in created ? created.error : "error");
        return;
      }
      setPhase("extracting");
      const extracted = await extractImportAction({
        siteId,
        importId: created.importId,
      });
      if (!extracted || "error" in extracted) {
        setPhase("idle");
        setError(extracted && "error" in extracted ? extracted.error : "error");
        return;
      }
      router.push(`/app/${siteId}/programme/import/review/${created.importId}`);
    });
  }

  return (
    <form action={handleSubmit} className="grid gap-3">
      <input type="hidden" name="siteId" value={siteId} />
      <Input
        ref={fileRef}
        type="file"
        name="files"
        multiple
        required
        accept=".pdf,.docx,.xlsx,image/jpeg,image/png,image/webp"
        className="min-h-12"
        data-testid="import-files"
        disabled={phase !== "idle"}
      />
      <p className="text-xs text-muted-foreground">{t("acceptHint")}</p>
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
        data-testid="import-submit"
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
