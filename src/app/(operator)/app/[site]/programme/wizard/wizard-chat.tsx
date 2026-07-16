"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import {
  generateDraftAction,
  wizardTurnAction,
  type GenerateDraftState,
  type WizardTurnState,
} from "./_actions";
import type { WizardTurn } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Answer = { questionId: string; question: string; answer: string };

/**
 * §7.2 wizard chat: chips-first (zero required typing), free text optional.
 * The interview transcript lives client-side until draft generation persists
 * it to risk_analyses.wizard_transcript.
 */
export function WizardChat({ siteId }: { siteId: string }) {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [turn, setTurn] = useState<WizardTurn | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [aiError, setAiError] = useState<"error" | "aiUnavailable" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  function fetchTurn(nextAnswers: Answer[]) {
    startTransition(async () => {
      const result: WizardTurnState = await wizardTurnAction({
        siteId,
        answers: nextAnswers,
      });
      if ("turn" in result) {
        setTurn(result.turn);
        setSelected([]);
        setFreeText("");
      } else {
        setAiError(result.error);
      }
    });
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetchTurn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answers.length, turn, generating]);

  function chipLabel(chip: { label_da: string; label_en: string }) {
    return locale === "da" ? chip.label_da : chip.label_en;
  }

  function submitAnswer() {
    if (!turn?.question) return;
    const q = turn.question;
    const parts = [
      ...selected.map((id) => {
        const chip = q.chips.find((c) => c.id === id);
        return chip ? chipLabel(chip) : id;
      }),
      ...(freeText.trim() ? [freeText.trim()] : []),
    ];
    if (parts.length === 0) return;
    const next = [
      ...answers,
      {
        questionId: q.id,
        question: locale === "da" ? q.text_da : q.text_en,
        answer: parts.join(", "),
      },
    ];
    setAnswers(next);
    setTurn(null);
    fetchTurn(next);
  }

  function toggleChip(id: string, multi: boolean) {
    setSelected((prev) =>
      multi
        ? prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id]
        : [id],
    );
  }

  function generate() {
    setGenerating(true);
    startTransition(async () => {
      const result: GenerateDraftState = await generateDraftAction({ siteId, answers });
      if ("ok" in result) {
        if (result.rejectedLimits.length > 0) {
          // §7.3: proposals the server clamped (never looser than the pack)
          toast.info(t("limitsClamped", { count: result.rejectedLimits.length }));
        }
        toast.success(t("draftReady"));
        router.push(`/app/${siteId}/programme`);
      } else if ("fallback" in result) {
        toast.info(t("fallbackApplied"));
        router.push(`/app/${siteId}/programme`);
      } else {
        setGenerating(false);
        setAiError(result.error);
      }
    });
  }

  if (aiError) {
    return (
      <div className="grid gap-3" data-testid="wizard-error">
        <p className="text-sm text-destructive" role="alert">
          {t(aiError === "aiUnavailable" ? "aiUnavailable" : "genericError")}
        </p>
        <Button asChild variant="outline" size="lg" className="min-h-14">
          <Link href={`/app/${siteId}/programme`}>{t("useTemplateInstead")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="wizard-chat">
      {/* transcript */}
      {answers.map((a, i) => (
        <div key={`${a.questionId}-${i}`} className="grid gap-2">
          <div className="max-w-[85%] rounded-lg bg-muted p-3 text-sm">{a.question}</div>
          <div className="ml-auto max-w-[85%] rounded-lg bg-primary p-3 text-sm text-primary-foreground">
            {a.answer}
          </div>
        </div>
      ))}

      {/* current question */}
      {turn?.question && !generating ? (
        <div className="grid gap-3" data-testid="wizard-question">
          <div className="max-w-[85%] rounded-lg bg-muted p-3 text-sm">
            {locale === "da" ? turn.question.text_da : turn.question.text_en}
          </div>
          {turn.question.chips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {turn.question.chips.map((chip) => (
                <Button
                  key={chip.id}
                  type="button"
                  variant={selected.includes(chip.id) ? "default" : "outline"}
                  className="min-h-14 px-4"
                  data-testid={`chip-${chip.id}`}
                  onClick={() => toggleChip(chip.id, turn.question!.multiSelect)}
                >
                  {chipLabel(chip)}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            {turn.question.allowFreeText ? (
              <Input
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAnswer();
                }}
                placeholder={t("freeTextPlaceholder")}
                className="min-h-12"
                data-testid="wizard-free-text"
              />
            ) : null}
            <Button
              type="button"
              size="lg"
              className="min-h-12"
              disabled={pending || (selected.length === 0 && !freeText.trim())}
              onClick={submitAnswer}
              data-testid="wizard-send"
            >
              <Send className="size-4" />
              {t("send")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* interview finished → summary + generate */}
      {turn?.done && !generating ? (
        <div className="grid gap-3" data-testid="wizard-summary">
          {turn.summary_da ? (
            <div className="rounded-lg border p-3 text-sm">
              <Badge variant="secondary" className="mb-2">
                {t("summaryBadge")}
              </Badge>
              <p className="whitespace-pre-wrap">{turn.summary_da}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("equipmentPhotoHint")}</p>
          <Button asChild variant="outline" className="min-h-12">
            <Link href={`/app/${siteId}/equipment`}>{t("equipmentPhotoLink")}</Link>
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-14"
            disabled={pending}
            onClick={generate}
            data-testid="wizard-generate"
          >
            {t("generateButton")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("generateHint")}</p>
        </div>
      ) : null}

      {(pending && !turn) || generating ? (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="wizard-loading"
        >
          <Loader2 className="size-4 animate-spin" />
          {generating ? t("generating") : t("thinking")}
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
