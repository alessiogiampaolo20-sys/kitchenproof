"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createOrganization } from "./_actions";
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
import { LOCALES } from "@/lib/i18n/config";

export function WelcomeForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createOrganization, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("welcome.title")}</CardTitle>
        <CardDescription>{t("welcome.subtitle")}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("welcome.orgName")}</Label>
            <Input id="name" name="name" required maxLength={200} />
            <p className="text-xs text-muted-foreground">{t("welcome.orgNameHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cvr">{t("welcome.cvr")}</Label>
            <Input
              id="cvr"
              name="cvr"
              required
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              placeholder="12345678"
            />
            <p className="text-xs text-muted-foreground">{t("welcome.cvrHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="billingEmail">{t("welcome.billingEmail")}</Label>
            <Input id="billingEmail" name="billingEmail" type="email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="locale">{t("welcome.locale")}</Label>
            <Select name="locale" defaultValue={locale}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {t(`common.locales.${l}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.error ? (
            <p className="text-sm text-destructive" role="alert">
              {t(`common.${state.error}`)}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {t("welcome.createButton")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
