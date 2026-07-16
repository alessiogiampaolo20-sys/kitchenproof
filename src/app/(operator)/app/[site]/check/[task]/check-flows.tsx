"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Delete, Minus, Snowflake } from "lucide-react";
import {
  adHocRecord,
  completeTask,
  recordDeviationSteps,
  type CompleteTaskResult,
} from "../_actions";
import type { CheckValue } from "@/lib/compliance/checks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ── Deviation 3-step sheet (§8.3) — opens immediately on any failed check ── */

const FOOD_OPTIONS = ["moved", "discarded", "kept", "na"] as const;
const FIX_OPTIONS = [
  "technician",
  "thermostat",
  "movedGoods",
  "reheated",
  "cleaned",
  "other",
] as const;

export function DeviationSheet({
  siteId,
  deviationId,
  guidance,
  onClosed,
}: {
  siteId: string;
  deviationId: string;
  guidance?: string;
  onClosed: () => void;
}) {
  const t = useTranslations("deviation");
  const [food, setFood] = useState<string | null>(null);
  const [fixes, setFixes] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [skipFollowUp, setSkipFollowUp] = useState(false);
  const [pending, startTransition] = useTransition();

  const correctiveText = [
    ...fixes.filter((f) => f !== "other").map((f) => t(`fixes.${f}`)),
    note.trim(),
  ]
    .filter(Boolean)
    .join("; ");

  function submit() {
    if (!food || correctiveText.length === 0) return;
    startTransition(async () => {
      const result = await recordDeviationSteps({
        siteId,
        deviationId,
        foodAssessment: food,
        correctiveAction: correctiveText,
        followUpHours: 2,
        skipFollowUp: skipFollowUp ? "true" : "false",
      });
      if (result && "ok" in result) {
        toast.success(t("saved"));
        onClosed();
      }
    });
  }

  return (
    // §8.3: the corrective sheet cannot be dismissed without completing it
    <Dialog open>
      <DialogContent
        className="max-w-md"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("sheetTitle")}</DialogTitle>
        </DialogHeader>
        {guidance ? (
          <p className="rounded-lg bg-muted p-3 text-sm">
            <span className="font-medium">{t("guidance")}: </span>
            {guidance}
          </p>
        ) : null}

        <p className="font-medium">{t("step1")}</p>
        <div className="grid grid-cols-2 gap-2">
          {FOOD_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={food === option ? "default" : "secondary"}
              className="min-h-14"
              onClick={() => setFood(option)}
              data-testid={`food-${option}`}
            >
              {t(`food.${option}`)}
            </Button>
          ))}
        </div>

        <p className="font-medium">{t("step2")}</p>
        <div className="flex flex-wrap gap-2">
          {FIX_OPTIONS.map((fix) => (
            <Button
              key={fix}
              type="button"
              size="sm"
              variant={fixes.includes(fix) ? "default" : "secondary"}
              onClick={() =>
                setFixes((prev) =>
                  prev.includes(fix) ? prev.filter((f) => f !== fix) : [...prev, fix],
                )
              }
              data-testid={`fix-${fix}`}
            >
              {t(`fixes.${fix}`)}
            </Button>
          ))}
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("correctiveLabel")}
          maxLength={2000}
        />

        <p className="font-medium">{t("step3")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={!skipFollowUp}
            onChange={(e) => setSkipFollowUp(!e.target.checked)}
          />
          {t("followUpLabel", { hours: 2 })}
        </label>

        <Button
          type="button"
          size="lg"
          className="min-h-14"
          disabled={pending || !food || correctiveText.length === 0}
          onClick={submit}
          data-testid="deviation-submit"
        >
          {t("submit")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ── Shared submit plumbing ────────────────────────────────────────────────── */

function useCheckSubmit(siteId: string, taskId: string) {
  const t = useTranslations("check");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deviation, setDeviation] = useState<{
    deviationId: string;
    guidance?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(value: CheckValue, note?: string) {
    startTransition(async () => {
      const result: CompleteTaskResult = await completeTask({
        siteId,
        taskId,
        value,
        note,
      });
      if ("error" in result) {
        setError(t(result.error === "error" ? "alreadyDone" : result.error));
        return;
      }
      if (result.passed) {
        toast.success(t("saved"));
        router.push(`/app/${siteId}/today`);
      } else if (result.deviationId) {
        setDeviation({
          deviationId: result.deviationId,
          guidance: result.correctiveGuidance,
        });
      }
    });
  }

  const sheet = deviation ? (
    <DeviationSheet
      siteId={siteId}
      deviationId={deviation.deviationId}
      guidance={deviation.guidance}
      onClosed={() => {
        setDeviation(null);
        router.push(`/app/${siteId}/today`);
      }}
    />
  ) : null;

  return { submit, pending, error, sheet };
}

/* ── Temperature check: giant keypad, never the OS keyboard (§15.1) ────────── */

export function TempCheck({
  siteId,
  taskId,
  limitLabel,
}: {
  siteId: string;
  taskId: string;
  limitLabel: string;
}) {
  const t = useTranslations("check");
  const [display, setDisplay] = useState("");
  const { submit, pending, error, sheet } = useCheckSubmit(siteId, taskId);

  function press(ch: string) {
    setDisplay((d) => {
      if (ch === "-" ) return d.startsWith("-") ? d : `-${d}`;
      if (ch === "." && (d.includes(".") || d === "" || d === "-")) return d;
      if (d.replace(/[-.]/g, "").length >= 4) return d;
      return d + ch;
    });
  }

  const value = Number.parseFloat(display);
  const valid = display !== "" && !Number.isNaN(value);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("limitLabel", { limit: limitLabel })}</p>
      <div
        className="flex min-h-20 items-center justify-center rounded-xl border bg-muted/40 text-5xl font-semibold tabular-nums"
        data-testid="temp-display"
      >
        {display || "–"}
        <span className="ml-2 text-2xl text-muted-foreground">°C</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            key={d}
            type="button"
            variant="secondary"
            className="h-16 text-2xl font-semibold"
            onClick={() => press(d)}
            data-testid={`temp-key-${d}`}
          >
            {d}
          </Button>
        ))}
        <Button type="button" variant="secondary" className="h-16 text-2xl" onClick={() => press("-")} aria-label="minus">
          <Minus className="size-6" />
        </Button>
        <Button type="button" variant="secondary" className="h-16 text-2xl font-semibold" onClick={() => press("0")} data-testid="temp-key-0">
          0
        </Button>
        <Button type="button" variant="secondary" className="h-16 text-2xl font-semibold" onClick={() => press(".")} data-testid="temp-key-dot">
          ,
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-16"
          onClick={() => setDisplay((d) => d.slice(0, -1))}
          aria-label="backspace"
        >
          <Delete className="size-6" />
        </Button>
        <Button
          type="button"
          size="lg"
          className="col-span-3 h-16 text-lg"
          disabled={!valid || pending}
          onClick={() => submit({ temp_c: value })}
          data-testid="temp-confirm"
        >
          <Check /> {t("confirm")}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {sheet}
    </div>
  );
}

/* ── Checklist check: ✓/✗/N.A. rows; every ✗ needs a reason chip (§8.2) ────── */

export type ChecklistItemDef = { key: string; label: string };

const REASONS = ["dirty", "broken", "missing", "other"] as const;

export function ChecklistCheck({
  siteId,
  taskId,
  items,
}: {
  siteId: string;
  taskId: string;
  items: ChecklistItemDef[];
}) {
  const t = useTranslations("check");
  const [state, setState] = useState<
    Record<string, { status: "ok" | "fail" | "na"; reason?: string }>
  >(Object.fromEntries(items.map((i) => [i.key, { status: "ok" as const }])));
  const { submit, pending, error, sheet } = useCheckSubmit(siteId, taskId);

  const missingReason = Object.values(state).some(
    (s) => s.status === "fail" && !s.reason,
  );

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const s = state[item.key]!;
        return (
          <div key={item.key} className="rounded-xl border p-3" data-testid={`chk-${item.key}`}>
            <p className="mb-2 font-medium">{item.label}</p>
            <div className="grid grid-cols-3 gap-2">
              {(["ok", "fail", "na"] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={s.status === status ? (status === "fail" ? "destructive" : "default") : "secondary"}
                  className="min-h-12"
                  onClick={() =>
                    setState((prev) => ({ ...prev, [item.key]: { status } }))
                  }
                  data-testid={`chk-${item.key}-${status}`}
                >
                  {status === "ok" ? t("checklistOk") : status === "fail" ? t("checklistFail") : t("checklistNa")}
                </Button>
              ))}
            </div>
            {s.status === "fail" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {REASONS.map((reason) => (
                  <Button
                    key={reason}
                    type="button"
                    size="sm"
                    variant={s.reason === t(`reasons.${reason}`) ? "default" : "outline"}
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        [item.key]: { status: "fail", reason: t(`reasons.${reason}`) },
                      }))
                    }
                    data-testid={`chk-${item.key}-reason-${reason}`}
                  >
                    {t(`reasons.${reason}`)}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {missingReason ? (
        <p className="text-sm text-destructive">{t("reasonRequired")}</p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="min-h-14"
        disabled={pending || missingReason}
        onClick={() =>
          submit({
            checklist: items.map((i) => ({
              key: i.key,
              label: i.label,
              status: state[i.key]!.status,
              reason: state[i.key]!.reason,
            })),
          })
        }
        data-testid="checklist-confirm"
      >
        <Check /> {t("confirm")}
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {sheet}
    </div>
  );
}

/* ── Cooling log (56→10 °C/4h) with blast-chiller shortcut (§8.2) ──────────── */

export function CoolingCheck({
  siteId,
  taskId,
  limitLabel,
}: {
  siteId: string;
  taskId: string;
  limitLabel: string;
}) {
  const t = useTranslations("check");
  const [log, setLog] = useState<{ at: string; temp_c: number }[]>([]);
  const [tempInput, setTempInput] = useState("");
  const { submit, pending, error, sheet } = useCheckSubmit(siteId, taskId);

  const temp = Number.parseFloat(tempInput.replace(",", "."));
  const validTemp = tempInput !== "" && !Number.isNaN(temp);
  const started = log.length > 0;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("limitLabel", { limit: limitLabel })}</p>

      {!started ? (
        <>
          <Button
            type="button"
            size="lg"
            className="min-h-14"
            onClick={() => setLog([{ at: new Date().toISOString(), temp_c: 56 }])}
            data-testid="cooling-start"
          >
            {t("cooling.start")}
          </Button>
          <div className="grid gap-2 rounded-xl border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Snowflake className="size-4 text-primary" /> {t("cooling.blastChiller")}
            </p>
            <Input
              inputMode="decimal"
              placeholder={t("cooling.finalTemp")}
              value={tempInput}
              onChange={(e) => setTempInput(e.target.value)}
              className="min-h-12 text-lg"
              data-testid="cooling-blast-temp"
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-12"
              disabled={!validTemp || pending}
              onClick={() => {
                const now = Date.now();
                submit({
                  cool_log: [
                    { at: new Date(now - 60_000).toISOString(), temp_c: 56 },
                    { at: new Date(now).toISOString(), temp_c: temp },
                  ],
                  blast_chiller: true,
                });
              }}
              data-testid="cooling-blast-confirm"
            >
              <Check /> {t("confirm")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border p-3">
            <p className="text-sm text-muted-foreground">
              {t("cooling.startedAt", {
                time: new Date(log[0]!.at).toLocaleTimeString("da-DK", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </p>
            <ul className="mt-2 grid gap-1 text-sm tabular-nums">
              {log.map((entry, i) => (
                <li key={i}>
                  {new Date(entry.at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}{" "}
                  — {entry.temp_c} °C
                </li>
              ))}
            </ul>
          </div>
          <Input
            inputMode="decimal"
            placeholder={t("cooling.readingTemp")}
            value={tempInput}
            onChange={(e) => setTempInput(e.target.value)}
            className="min-h-12 text-lg"
            data-testid="cooling-reading"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-14"
              disabled={!validTemp}
              onClick={() => {
                setLog((l) => [...l, { at: new Date().toISOString(), temp_c: temp }]);
                setTempInput("");
              }}
              data-testid="cooling-add"
            >
              {t("cooling.addReading")}
            </Button>
            <Button
              type="button"
              className="min-h-14"
              disabled={!validTemp || pending}
              onClick={() =>
                submit({
                  cool_log: [...log, { at: new Date().toISOString(), temp_c: temp }],
                })
              }
              data-testid="cooling-finish"
            >
              <Check /> {t("cooling.finish")}
            </Button>
          </div>
        </>
      )}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {sheet}
    </div>
  );
}

/* ── Ad-hoc record dialog (§8.5) — used from the Today screen ──────────────── */

export function AdHocDialog({
  siteId,
  equipment,
  open,
  onOpenChange,
}: {
  siteId: string;
  equipment: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("todayScreen");
  const router = useRouter();
  const [kind, setKind] = useState<"temp" | "note" | "deviation">("temp");
  const [tempInput, setTempInput] = useState("");
  const [text, setText] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [pending, startTransition] = useTransition();

  const temp = Number.parseFloat(tempInput.replace(",", "."));
  const valid =
    kind === "temp" ? tempInput !== "" && !Number.isNaN(temp) : text.trim().length > 0;

  function submit() {
    startTransition(async () => {
      const result = await adHocRecord({
        siteId,
        kind,
        equipmentId: equipmentId || undefined,
        tempC: kind === "temp" ? temp : undefined,
        text: text || undefined,
      });
      if (result && "ok" in result) {
        toast.success(t("adHoc"));
        onOpenChange(false);
        setTempInput("");
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("adHoc")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {(["temp", "note", "deviation"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={kind === option ? "default" : "secondary"}
              className={cn("min-h-12", option === "deviation" && kind === option && "bg-destructive")}
              onClick={() => setKind(option)}
            >
              {option === "temp" ? t("adHocTemp") : option === "note" ? t("adHocNote") : t("adHocDeviation")}
            </Button>
          ))}
        </div>
        {kind === "temp" ? (
          <>
            <Input
              inputMode="decimal"
              placeholder="°C"
              value={tempInput}
              onChange={(e) => setTempInput(e.target.value)}
              className="min-h-12 text-lg"
            />
            <select
              className="min-h-12 rounded-lg border bg-background px-3"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              aria-label={t("adHocEquipment")}
            >
              <option value="">{t("adHocEquipment")}</option>
              {equipment.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <Input
            placeholder={t("adHocText")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            className="min-h-12"
          />
        )}
        <Button
          type="button"
          size="lg"
          className="min-h-14"
          disabled={!valid || pending}
          onClick={submit}
          data-testid="adhoc-submit"
        >
          <Check /> {t("adHoc")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
