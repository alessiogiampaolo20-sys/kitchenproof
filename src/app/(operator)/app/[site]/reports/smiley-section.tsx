"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Smile } from "lucide-react";
import { addSmileyInspection, type SmileyState } from "./_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SmileyRecord = {
  id: string;
  inspectedOn: string;
  result: number;
  note: string | null;
};

/** §13: manual smiley outcomes + Elite progress (4 consecutive top results). */
export function SmileySection({
  siteId,
  records,
  isManager,
}: {
  siteId: string;
  records: SmileyRecord[];
  isManager: boolean;
}) {
  const t = useTranslations("smiley");
  const router = useRouter();
  const [date, setDate] = useState("");
  const [result, setResult] = useState("1");
  const [pending, startTransition] = useTransition();

  // streak of most-recent consecutive result=1 (records arrive newest-first)
  let streak = 0;
  for (const record of records) {
    if (record.result === 1) streak++;
    else break;
  }

  function add() {
    const formData = new FormData();
    formData.set("siteId", siteId);
    formData.set("inspectedOn", date);
    formData.set("result", result);
    startTransition(async () => {
      const response: SmileyState = await addSmileyInspection(null, formData);
      if (response && "ok" in response) {
        toast.success(t("addedToast"));
        setDate("");
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Card className="mt-6" data-testid="smiley-section">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smile className="size-4 text-primary" />
          {t("title")}
          <Badge variant={streak >= 4 ? "default" : "secondary"} data-testid="elite-progress">
            {streak >= 4 ? t("elite") : t("eliteProgress", { count: Math.min(streak, 4) })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {records.map((record) => (
          <p key={record.id} className="text-sm" data-testid="smiley-row">
            {record.inspectedOn} — {t(`results.${record.result}`)}
            {record.note ? ` · ${record.note}` : ""}
          </p>
        ))}
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}
        {isManager ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-12 w-40"
              data-testid="smiley-date"
            />
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger className="min-h-12 w-44" data-testid="smiley-result">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {t(`results.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="min-h-12"
              disabled={pending || !date}
              onClick={add}
              data-testid="smiley-add"
            >
              {t("addButton")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
