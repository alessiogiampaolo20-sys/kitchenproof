"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { askAssistantAction, type AskState } from "./_actions";
import type { AssistantAnswer } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Exchange = { question: string; answer: AssistantAnswer };

/** §13 advisory chat: cited answers or explicit refusals — nothing in between. */
export function AssistantChat({ siteId }: { siteId: string }) {
  const t = useTranslations("assistant");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result: AskState = await askAssistantAction({ siteId, question: trimmed });
      if (result && "ok" in result) {
        setHistory((prev) => [...prev, { question: trimmed, answer: result.answer }]);
        setQuestion("");
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <div className="grid gap-3">
      {history.map((exchange, index) => (
        <div key={index} className="grid gap-2" data-testid="assistant-exchange">
          <div className="ml-auto max-w-[85%] rounded-lg bg-primary p-3 text-sm text-primary-foreground">
            {exchange.question}
          </div>
          <Card className={exchange.answer.inScope ? "" : "border-amber-400"}>
            <CardContent className="grid gap-2 py-3 text-sm">
              {!exchange.answer.inScope ? (
                <p
                  className="flex items-center gap-1 text-xs font-medium text-amber-700"
                  data-testid="assistant-refusal"
                >
                  <ShieldAlert className="size-3.5" />
                  {t("outOfScope")}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap" data-testid="assistant-answer">
                {exchange.answer.answer}
              </p>
              {exchange.answer.citations.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {exchange.answer.citations.map((citation, citationIndex) => (
                    <Badge
                      key={citationIndex}
                      variant="outline"
                      className="font-mono"
                      data-testid="assistant-citation"
                    >
                      {citation.docId} §{citation.section}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ))}

      {pending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("thinking")}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          placeholder={t("placeholder")}
          className="min-h-12"
          data-testid="assistant-question"
          disabled={pending}
        />
        <Button
          type="button"
          size="lg"
          className="min-h-12"
          disabled={pending || !question.trim()}
          onClick={ask}
          data-testid="assistant-send"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
