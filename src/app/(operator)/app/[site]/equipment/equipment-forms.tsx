"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createEquipment,
  updateEquipment,
  type EquipmentActionState,
} from "./_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KINDS = [
  "fridge",
  "freezer",
  "hot_holding",
  "dishwasher",
  "probe",
  "oven",
  "blast_chiller",
  "other",
] as const;

export function NewEquipmentForm({ siteId }: { siteId: string }) {
  const t = useTranslations("equipment");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    EquipmentActionState,
    FormData
  >(createEquipment, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state) {
      toast.success(t("saved"));
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("newTitle")}</CardTitle>
        <CardDescription>{t("photoHint")}</CardDescription>
      </CardHeader>
      <form ref={formRef} action={formAction}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="siteId" value={siteId} />
          <div className="grid gap-2">
            <Label htmlFor="eq-name">{t("name")}</Label>
            <Input id="eq-name" name="name" required maxLength={120} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eq-kind">{t("kindLabel")}</Label>
            <Select name="kind" defaultValue="fridge">
              <SelectTrigger id="eq-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eq-brand">{t("brandModel")}</Label>
            <Input id="eq-brand" name="brandModel" maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eq-location">{t("location")}</Label>
            <Input id="eq-location" name="location" maxLength={200} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="eq-photo">{t("photo")}</Label>
            <Input id="eq-photo" name="photo" type="file" accept="image/*" capture="environment" />
          </div>
          {state && "error" in state ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {tCommon("error")}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" disabled={pending}>
            {t("createButton")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function EditEquipmentForm({
  siteId,
  equipmentId,
  name,
  brandModel,
  location,
}: {
  siteId: string;
  equipmentId: string;
  name: string;
  brandModel: string;
  location: string;
}) {
  const t = useTranslations("equipment");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    EquipmentActionState,
    FormData
  >(updateEquipment, null);

  useEffect(() => {
    if (state && "ok" in state) toast.success(t("saved"));
  }, [state, t]);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <div className="grid gap-2">
        <Label htmlFor="eqd-name">{t("name")}</Label>
        <Input id="eqd-name" name="name" defaultValue={name} required maxLength={120} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="eqd-brand">{t("brandModel")}</Label>
        <Input id="eqd-brand" name="brandModel" defaultValue={brandModel} maxLength={200} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="eqd-location">{t("location")}</Label>
        <Input id="eqd-location" name="location" defaultValue={location} maxLength={200} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="eqd-photo">{t("photo")}</Label>
        <Input id="eqd-photo" name="photo" type="file" accept="image/*" capture="environment" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
