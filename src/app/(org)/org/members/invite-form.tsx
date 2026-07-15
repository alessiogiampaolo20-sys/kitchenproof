"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { createInvite, type InviteFormState } from "./_actions";
import { INVITABLE_ROLES } from "@/lib/schemas/tenancy";
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

type SiteOption = { id: string; name: string };

export function InviteForm({
  orgId,
  sites,
}: {
  orgId: string;
  sites: SiteOption[];
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    createInvite,
    null,
  );
  const [allSites, setAllSites] = useState(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("members.inviteTitle")}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{t("members.email")}</Label>
            <Input id="invite-email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">{t("members.role")}</Label>
            <Select name="role" defaultValue="operator">
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`members.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>{t("members.siteScope")}</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allSites}
                onChange={(e) => setAllSites(e.target.checked)}
              />
              {t("members.allSites")}
            </label>
            {!allSites ? (
              <div className="grid gap-1 pl-6">
                {sites.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="siteIds"
                      value={s.id}
                      className="size-4 accent-primary"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          {state && "error" in state ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {t(`common.${state.error}`)}
            </p>
          ) : null}
          {state && "url" in state ? (
            <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 sm:col-span-2">
              <p className="text-sm font-medium">
                {t("members.inviteLinkTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("members.inviteLinkHint")}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={state.url}
                  data-testid="invite-url"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(state.url);
                    toast.success(t("common.copied"));
                  }}
                >
                  <Copy /> {t("common.copy")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" disabled={pending}>
            {t("members.createInvite")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
