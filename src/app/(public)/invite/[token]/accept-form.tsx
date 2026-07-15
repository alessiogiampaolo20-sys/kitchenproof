"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { acceptInvite, type AcceptState } from "./_actions";
import { Button } from "@/components/ui/button";

export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(
    acceptInvite,
    null,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(state.error)}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {t("acceptButton")}
      </Button>
    </form>
  );
}
