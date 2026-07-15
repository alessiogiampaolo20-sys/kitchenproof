"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createSite, type SiteFormState } from "./_actions";
import { ACTIVITY_TYPES } from "@/lib/schemas/tenancy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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

export function NewSiteForm({ orgId }: { orgId: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<SiteFormState, FormData>(
    createSite,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state) {
      formRef.current?.reset();
      toast.success(t("sites.title"));
    }
  }, [state, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("sites.newSite")}</CardTitle>
      </CardHeader>
      <form ref={formRef} action={formAction}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="grid gap-2">
            <Label htmlFor="site-name">{t("sites.name")}</Label>
            <Input id="site-name" name="name" required maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="site-activity">{t("sites.activityType")}</Label>
            <Select name="activityType" defaultValue="restaurant">
              <SelectTrigger id="site-activity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {t(`sites.activityTypes.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="site-address">{t("sites.address")}</Label>
            <Input id="site-address" name="address" maxLength={300} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="site-city">{t("sites.city")}</Label>
            <Input id="site-city" name="city" maxLength={120} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="site-postal">{t("sites.postalCode")}</Label>
            <Input id="site-postal" name="postalCode" maxLength={12} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="site-cvr">{t("sites.cvrPNumber")}</Label>
            <Input id="site-cvr" name="cvrPNumber" maxLength={20} />
          </div>
          {state && "error" in state ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {t(`common.${state.error}`)}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" disabled={pending}>
            {t("sites.createButton")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
