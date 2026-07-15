import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActorSession, getDeviceSession } from "@/lib/actor/session";
import { PinSwitcher, type SwitcherMember } from "./pin-switcher";
import { RegisterDeviceForm } from "./register-device-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TodayPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name, timezone")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");

  const [device, actor] = await Promise.all([
    getDeviceSession(site.id),
    getActorSession(site.id),
  ]);

  // Registered device may have been revoked server-side.
  let deviceActive = false;
  if (device) {
    const { data: deviceRow } = await supabase
      .from("device_sessions")
      .select("id, revoked_at")
      .eq("id", device.deviceSessionId)
      .maybeSingle();
    deviceActive = !!deviceRow && deviceRow.revoked_at === null;
  }

  const [{ data: members }, { data: pinStatus }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, role, site_ids, profile:profiles(full_name)")
      .eq("org_id", site.org_id)
      .not("accepted_at", "is", null),
    supabase.rpc("site_pin_status", { p_site_id: site.id }),
  ]);

  const pinById = new Map(
    (pinStatus ?? []).map((p) => [p.membership_id, p]),
  );
  const switcherMembers: SwitcherMember[] = (members ?? [])
    .filter((m) => m.site_ids === null || m.site_ids.includes(site.id))
    .map((m) => ({
      membershipId: m.id,
      fullName: m.profile?.full_name ?? "",
      hasPin: pinById.get(m.id)?.has_pin ?? false,
      locked: pinById.get(m.id)?.locked ?? false,
    }));

  const t = await getTranslations();
  const format = await getFormatter();
  const today = format.dateTime(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: site.timezone,
  });

  return (
    // Kitchen mode (§15.1): base font 18px, ≥56px touch targets.
    <main className="mx-auto w-full max-w-xl flex-1 p-4 text-[18px]">
      <header className="mb-6 grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{site.name}</h1>
            <p className="text-sm capitalize text-muted-foreground">{today}</p>
          </div>
          {deviceActive ? (
            <PinSwitcher siteId={site.id} members={switcherMembers} />
          ) : null}
        </div>
        {deviceActive ? (
          <div
            className="flex items-center gap-2 text-sm"
            data-testid="active-actor"
          >
            <span className="text-muted-foreground">{t("pin.actingAs")}:</span>
            {actor ? (
              <Badge className="text-sm">{actor.fullName}</Badge>
            ) : (
              <Badge variant="outline">{t("pin.nobodyActive")}</Badge>
            )}
          </div>
        ) : null}
      </header>

      {!deviceActive ? (
        <RegisterDeviceForm siteId={site.id} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="size-5 text-primary" />
              {t("today.title")}
            </CardTitle>
            <CardDescription>{t("today.placeholder")}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </main>
  );
}
