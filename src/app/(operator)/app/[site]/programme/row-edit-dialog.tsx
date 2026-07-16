"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { editRaRow } from "./_actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type RaRowTexts = {
  whatYouDo: string;
  whatCanGoWrong: string;
  controlMeasures: string;
  ifItGoesWrong: string;
};

/** §7.3 review editor: edit the 4 official skema columns of a draft row. */
export function RowEditDialog({
  siteId,
  rowId,
  rowName,
  applies,
  critical,
  texts,
}: {
  siteId: string;
  rowId: string;
  rowName: string;
  applies: boolean;
  critical: boolean;
  texts: RaRowTexts;
}) {
  const t = useTranslations("programme");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [appliesState, setApplies] = useState(applies);
  const [criticalState, setCritical] = useState(critical);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await editRaRow(null, formData);
      if (result && "ok" in result) {
        toast.success(t("saved"));
        setError(null);
        setOpen(false);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  const fields: { name: keyof RaRowTexts; label: string }[] = [
    { name: "whatYouDo", label: t("rowEdit.whatYouDo") },
    { name: "whatCanGoWrong", label: t("rowEdit.whatCanGoWrong") },
    { name: "controlMeasures", label: t("rowEdit.controlMeasures") },
    { name: "ifItGoesWrong", label: t("rowEdit.ifItGoesWrong") },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`edit-row-${rowId}`}>
          <Pencil className="size-4" />
          <span className="sr-only">{t("edit")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rowName}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="rowId" value={rowId} />
          <input type="hidden" name="applies" value={String(appliesState)} />
          <input type="hidden" name="critical" value={String(criticalState)} />

          <div className="flex gap-2">
            <Button
              type="button"
              variant={appliesState ? "default" : "outline"}
              className="min-h-12 flex-1"
              onClick={() => setApplies((v) => !v)}
            >
              {t("rowEdit.applies")}
            </Button>
            <Button
              type="button"
              variant={criticalState ? "destructive" : "outline"}
              className="min-h-12 flex-1"
              onClick={() => setCritical((v) => !v)}
            >
              {t("critical")}
            </Button>
          </div>

          {fields.map((field) => (
            <div key={field.name} className="grid gap-2">
              <Label htmlFor={`${field.name}-${rowId}`}>{field.label}</Label>
              <Textarea
                id={`${field.name}-${rowId}`}
                name={field.name}
                defaultValue={texts[field.name]}
                rows={3}
              />
            </div>
          ))}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" className="min-h-12" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
