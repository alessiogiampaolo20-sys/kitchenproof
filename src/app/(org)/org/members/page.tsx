import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { getOrgContext } from "@/lib/tenancy";
import { InviteForm } from "./invite-form";
import {
  RevokeButton,
  SetPinDialog,
  UnlockPinButton,
} from "./member-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function MembersPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/");

  const supabase = await createClient();
  const ctx = await getOrgContext(supabase, orgId);
  if (!ctx) redirect("/");

  const [{ data: members }, { data: sites }] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, role, user_id, accepted_at, invited_email, expires_at, profile:profiles(full_name)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sites")
      .select("id, name")
      .eq("org_id", orgId)
      .neq("status", "archived"),
  ]);

  const t = await getTranslations();
  const isAdmin = ctx.role === "org_owner" || ctx.role === "org_admin";
  const now = new Date();

  const active = (members ?? []).filter(
    (m) =>
      m.accepted_at !== null &&
      (m.expires_at === null || new Date(m.expires_at) > now),
  );
  const pending = (members ?? []).filter((m) => m.accepted_at === null);

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("members.title")}</h1>

      <Card>
        <CardContent className="grid gap-1 p-2">
          {active.map((m) => (
            <div
              key={m.id}
              data-testid="member-row"
              className="flex flex-wrap items-center gap-2 rounded-lg p-2 hover:bg-muted/50"
            >
              <span className="font-medium">
                {m.profile?.full_name || m.invited_email}
              </span>
              {m.user_id === ctx.user.id ? (
                <span className="text-xs text-muted-foreground">
                  ({t("members.you")})
                </span>
              ) : null}
              <Badge variant="secondary">{t(`members.roles.${m.role}`)}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <SetPinDialog
                  membershipId={m.id}
                  memberName={m.profile?.full_name ?? ""}
                />
                <UnlockPinButton membershipId={m.id} />
                {isAdmin && m.user_id !== ctx.user.id && m.role !== "org_owner" ? (
                  <RevokeButton membershipId={m.id} />
                ) : null}
              </div>
            </div>
          ))}

          {pending.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-2 rounded-lg p-2 opacity-70 hover:bg-muted/50"
            >
              <span>{m.invited_email}</span>
              <Badge variant="outline">{t("members.pending")}</Badge>
              <Badge variant="secondary">{t(`members.roles.${m.role}`)}</Badge>
              {isAdmin ? (
                <div className="ml-auto">
                  <RevokeButton membershipId={m.id} />
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {isAdmin ? <InviteForm orgId={orgId} sites={sites ?? []} /> : null}
    </div>
  );
}
