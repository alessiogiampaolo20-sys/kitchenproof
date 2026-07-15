"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createControlPoint,
  editControlPoint,
  toggleControlPoint,
  type ProgrammeActionState,
} from "./_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CpLimitShape =
  | { kind: "max"; max: number }
  | { kind: "min"; min: number }
  | { kind: "cooling"; coolFrom: number; coolTo: number; withinMinutes: number }
  | { kind: "checklist" };

export function EditCpDialog({
  siteId,
  controlPointId,
  cpName,
  limit,
  times,
  isPackTemplate,
}: {
  siteId: string;
  controlPointId: string;
  cpName: string;
  limit: CpLimitShape;
  times: string | null; // "08:00,15:00" or null for perEvent
  isPackTemplate: boolean;
}) {
  const t = useTranslations("programme");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await editControlPoint(null, formData);
      if (result && "ok" in result) {
        toast.success(t("saved"));
        setError(null);
        setOpen(false);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{cpName}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="controlPointId" value={controlPointId} />

          {limit.kind === "max" ? (
            <div className="grid gap-2">
              <Label htmlFor={`max-${controlPointId}`}>{t("limitType.max")} (°C)</Label>
              <Input
                id={`max-${controlPointId}`}
                name="max"
                type="number"
                step="0.5"
                defaultValue={limit.max}
              />
            </div>
          ) : null}
          {limit.kind === "min" ? (
            <div className="grid gap-2">
              <Label htmlFor={`min-${controlPointId}`}>{t("limitType.min")} (°C)</Label>
              <Input
                id={`min-${controlPointId}`}
                name="min"
                type="number"
                step="0.5"
                defaultValue={limit.min}
              />
            </div>
          ) : null}
          {limit.kind === "cooling" ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-2">
                <Label htmlFor={`cf-${controlPointId}`}>°C →</Label>
                <Input id={`cf-${controlPointId}`} name="coolFrom" type="number" defaultValue={limit.coolFrom} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`ct-${controlPointId}`}>→ °C</Label>
                <Input id={`ct-${controlPointId}`} name="coolTo" type="number" defaultValue={limit.coolTo} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`wm-${controlPointId}`}>min</Label>
                <Input id={`wm-${controlPointId}`} name="withinMinutes" type="number" defaultValue={limit.withinMinutes} />
              </div>
            </div>
          ) : null}

          {times !== null ? (
            <div className="grid gap-2">
              <Label htmlFor={`times-${controlPointId}`}>{t("timesLabel")}</Label>
              <Input
                id={`times-${controlPointId}`}
                name="times"
                defaultValue={times}
                pattern="^\s*([01]\d|2[0-3]):[0-5]\d(\s*,\s*([01]\d|2[0-3]):[0-5]\d)*\s*$"
              />
            </div>
          ) : null}

          {isPackTemplate && limit.kind !== "checklist" ? (
            <div className="grid gap-2">
              <Label htmlFor={`just-${controlPointId}`}>{t("justification")}</Label>
              <Input id={`just-${controlPointId}`} name="justification" maxLength={2000} />
              <p className="text-xs text-muted-foreground">{t("justificationHint")}</p>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("edit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleCpButton({
  siteId,
  controlPointId,
  active,
}: {
  siteId: string;
  controlPointId: string;
  active: boolean;
}) {
  const t = useTranslations("programme");
  const [, formAction, pending] = useActionState<ProgrammeActionState, FormData>(
    toggleControlPoint,
    null,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="controlPointId" value={controlPointId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button variant="ghost" size="sm" type="submit" disabled={pending}>
        {active ? t("deactivate") : t("activate")}
      </Button>
    </form>
  );
}

export function CreateCpDialog({
  siteId,
  equipment,
}: {
  siteId: string;
  equipment: { id: string; name: string }[];
}) {
  const t = useTranslations("programme");
  const [open, setOpen] = useState(false);
  const [limitType, setLimitType] = useState<string>("max");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createControlPoint(null, formData);
      if (result && "ok" in result) {
        toast.success(t("saved"));
        setError(null);
        setOpen(false);
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("newCpButton")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newCpButton")}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <input type="hidden" name="siteId" value={siteId} />
          <div className="grid gap-2">
            <Label htmlFor="cp-name">{t("cpName")}</Label>
            <Input id="cp-name" name="name" required maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="cp-category">{t("statusLabel")}</Label>
              <Select name="category" defaultValue="temperature">
                <SelectTrigger id="cp-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["temperature", "cleaning", "receiving", "pest", "hygiene", "other"] as const).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {t(`categories.${c}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cp-method">{t("monitoring.manual_temp")}</Label>
              <Select name="monitoringMethod" defaultValue="manual_temp">
                <SelectTrigger id="cp-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["manual_temp", "photo_temp", "photo_only", "checklist", "probe"] as const).map(
                    (m) => (
                      <SelectItem key={m} value={m}>
                        {t(`monitoring.${m}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="cp-limit-type">{t("limit")}</Label>
              <Select name="limitType" defaultValue="max" onValueChange={setLimitType}>
                <SelectTrigger id="cp-limit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="max">{t("limitType.max")}</SelectItem>
                  <SelectItem value="min">{t("limitType.min")}</SelectItem>
                  <SelectItem value="checklist">{t("limitType.checklist")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {limitType !== "checklist" ? (
              <div className="grid gap-2">
                <Label htmlFor="cp-value">{t("value")}</Label>
                <Input id="cp-value" name="value" type="number" step="0.5" required />
              </div>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cp-times">{t("timesLabel")}</Label>
            <Input id="cp-times" name="times" defaultValue="08:00" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cp-equipment">{t("equipmentTarget")}</Label>
            <Select name="equipmentId" defaultValue="">
              <SelectTrigger id="cp-equipment">
                <SelectValue placeholder={t("noEquipment")} />
              </SelectTrigger>
              <SelectContent>
                {equipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("newCpButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
