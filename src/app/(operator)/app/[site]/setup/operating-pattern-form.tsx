"use client";

// §3.5 configuration: the site's normal rhythm. Three shapes cover every
// business we target — open every day, fixed weekdays, or only when work is
// booked (catering).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setOperatingPattern, type CalendarState } from "../_calendar-actions";
import type { OperatingPattern } from "@/lib/compliance/operating-days";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "always" | "weekdays" | "scheduled_only";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function OperatingPatternForm({
  siteId,
  pattern,
}: {
  siteId: string;
  pattern: OperatingPattern | null;
}) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(pattern ? pattern.mode : "always");
  const [weekdays, setWeekdays] = useState<number[]>(
    pattern?.mode === "weekdays" ? pattern.weekdays : [1, 2, 3, 4, 5],
  );
  const [pending, startTransition] = useTransition();

  function toggleDay(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  }

  function save() {
    const next: OperatingPattern | null =
      mode === "always"
        ? null
        : mode === "scheduled_only"
          ? { mode: "scheduled_only" }
          : { mode: "weekdays", weekdays };
    if (mode === "weekdays" && weekdays.length === 0) {
      toast.error(t("pickAtLeastOneDay"));
      return;
    }
    startTransition(async () => {
      const result: CalendarState = await setOperatingPattern({ siteId, pattern: next });
      if (result && "ok" in result) {
        toast.success(t("patternSaved"));
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("patternTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("patternHint")}</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2">
          {(["always", "weekdays", "scheduled_only"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              data-testid={`pattern-${option}`}
              className={cn(
                "min-h-14 rounded-xl border p-3 text-left text-sm",
                mode === option ? "border-primary bg-primary/5" : "",
              )}
            >
              <span className="font-medium">{t(`modes.${option}.title`)}</span>
              <span className="block text-muted-foreground">
                {t(`modes.${option}.hint`)}
              </span>
            </button>
          ))}
        </div>

        {mode === "weekdays" ? (
          <div className="flex flex-wrap gap-2" data-testid="weekday-picker">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={weekdays.includes(day)}
                data-testid={`weekday-${day}`}
                className={cn(
                  "min-h-12 min-w-12 rounded-xl px-3 text-sm font-medium",
                  weekdays.includes(day)
                    ? "bg-primary text-primary-foreground"
                    : "border text-muted-foreground",
                )}
              >
                {t(`weekdayShort.${day}`)}
              </button>
            ))}
          </div>
        ) : null}

        <Button
          className="min-h-12 w-fit"
          disabled={pending}
          onClick={save}
          data-testid="save-pattern"
        >
          {t("savePattern")}
        </Button>
      </CardContent>
    </Card>
  );
}
