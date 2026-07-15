"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registerDevice, type RegisterDeviceState } from "./_actions";
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

export function RegisterDeviceForm({ siteId }: { siteId: string }) {
  const t = useTranslations("today");
  const [state, formAction, pending] = useActionState<
    RegisterDeviceState,
    FormData
  >(registerDevice, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("registerDeviceTitle")}</CardTitle>
        <CardDescription>{t("registerDeviceHint")}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4">
          <input type="hidden" name="siteId" value={siteId} />
          <div className="grid gap-2">
            <Label htmlFor="device-name">{t("deviceName")}</Label>
            <Input
              id="device-name"
              name="deviceName"
              defaultValue={t("deviceNameDefault")}
              required
              maxLength={100}
              className="min-h-14 text-lg"
            />
          </div>
          {state && "error" in state ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error === "onlyManager"
                ? t("onlyManagerHint")
                : t("registerDeviceTitle")}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="mt-4">
          <Button
            type="submit"
            size="lg"
            className="min-h-14 w-full"
            disabled={pending}
          >
            {t("registerButton")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
