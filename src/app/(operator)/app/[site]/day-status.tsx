"use client";

// §3.5 on the Today screen: one tap answers "are you working today?", and a
// closed day says so plainly instead of showing a list of things nobody was
// ever going to do.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarOff, RotateCcw } from "lucide-react";
import { confirmOperatingDay, type CalendarState } from "./_calendar-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AskWorkingToday({ siteId, day }: { siteId: string; day: string }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function answer(status: "open" | "closed") {
    startTransition(async () => {
      const result: CalendarState = await confirmOperatingDay({ siteId, day, status });
      if (result && "ok" in result) {
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Card className="mb-4" data-testid="ask-working-today">
      <CardContent className="grid gap-3 py-4">
        <p className="font-medium">{t("askTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("askHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            className="min-h-14 flex-1"
            disabled={pending}
            onClick={() => answer("open")}
            data-testid="day-open"
          >
            {t("answerOpen")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="min-h-14 flex-1"
            disabled={pending}
            onClick={() => answer("closed")}
            data-testid="day-closed"
          >
            {t("answerClosed")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClosedDayBanner({
  siteId,
  day,
  derived,
}: {
  siteId: string;
  day: string;
  /** True when the pattern decided this, not a person — reopening is one tap. */
  derived: boolean;
}) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function reopen() {
    startTransition(async () => {
      const result: CalendarState = await confirmOperatingDay({
        siteId,
        day,
        status: "open",
      });
      if (result && "ok" in result) {
        toast.success(t("reopenedToast"));
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Card data-testid="closed-day-banner">
      <CardContent className="grid gap-3 py-6">
        <p className="flex items-center gap-3 font-medium">
          <CalendarOff className="size-6 shrink-0 text-primary" />
          {t("closedTitle")}
        </p>
        <p className="text-sm text-muted-foreground">
          {derived ? t("closedByPattern") : t("closedConfirmed")}
        </p>
        <Button
          variant="outline"
          className="min-h-12 w-fit"
          disabled={pending}
          onClick={reopen}
          data-testid="reopen-day"
        >
          <RotateCcw className="size-4" />
          {t("reopenButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
