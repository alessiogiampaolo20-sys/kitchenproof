import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations();

  const supabase = await createClient();
  const [{ data: preview }, { data: userData }] = await Promise.all([
    supabase.rpc("get_invite_preview", { p_token: token }).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userData?.user ?? null;

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invite.invalid")}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const next = `/invite/${token}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invite.title", { org: preview.org_name })}</CardTitle>
        <CardDescription>
          {t("invite.roleLabel", {
            role: t(`members.roles.${preview.invite_role}`),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {user ? (
          <AcceptForm token={token} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("invite.needAuth")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link href={`/login?next=${encodeURIComponent(next)}`}>
                  {t("auth.loginButton")}
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/signup?next=${encodeURIComponent(next)}`}>
                  {t("auth.signupButton")}
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
