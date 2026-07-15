"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  approveProgramme,
  startFromTemplate,
  type ProgrammeActionState,
} from "./_actions";
import { Button } from "@/components/ui/button";

export function StartTemplateButton({ siteId }: { siteId: string }) {
  const t = useTranslations("programme");
  const [state, formAction, pending] = useActionState<
    ProgrammeActionState,
    FormData
  >(startFromTemplate, null);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      {state && "error" in state ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="min-h-14" disabled={pending}>
        {t("startButton")}
      </Button>
    </form>
  );
}

export function ApproveButton({
  siteId,
  riskAnalysisId,
}: {
  siteId: string;
  riskAnalysisId: string;
}) {
  const t = useTranslations("programme");
  const [state, formAction, pending] = useActionState<
    ProgrammeActionState,
    FormData
  >(approveProgramme, null);

  useEffect(() => {
    if (state && "ok" in state) toast.success(t("approvedToast"));
  }, [state, t]);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="riskAnalysisId" value={riskAnalysisId} />
      {state && "error" in state ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="min-h-14" disabled={pending}>
        {t("approveButton")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("approveHint")}</p>
    </form>
  );
}
