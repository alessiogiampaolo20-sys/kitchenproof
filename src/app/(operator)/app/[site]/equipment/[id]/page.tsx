import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { retireEquipment } from "../_actions";
import { EditEquipmentForm } from "../equipment-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ site: string; id: string }>;
}) {
  const { site: siteId, id } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const { data: unit } = await supabase
    .from("equipment")
    .select("id, kind, name, brand_model, location_note, photo_path, qr_code_token, active, retired_at")
    .eq("id", id)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!unit) redirect(`/app/${siteId}/equipment`);

  const t = await getTranslations();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const deepLink = `${proto}://${host}/app/${siteId}/scan?token=${unit.qr_code_token}`;
  const qrSvg = await QRCode.toString(deepLink, { type: "svg", margin: 1, width: 180 });

  let photoUrl: string | null = null;
  if (unit.photo_path) {
    const { data } = await supabase.storage
      .from("photos")
      .createSignedUrl(unit.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <Link
        href={`/app/${siteId}/equipment`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("equipment.backToList")}
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold" data-testid="equipment-name">
          {unit.name}
        </h1>
        <Badge variant="secondary">{t(`equipment.kinds.${unit.kind}`)}</Badge>
        {!unit.active ? <Badge variant="destructive">{t("equipment.retired")}</Badge> : null}
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("equipment.photo")}</CardTitle>
          </CardHeader>
          <CardContent>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={unit.name} className="w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                {t("equipment.photoHint")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("equipment.qrTitle")}</CardTitle>
            <CardDescription>{t("equipment.qrHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <div
              className="rounded-lg bg-white p-2"
              data-testid="equipment-qr"
              // QR is generated server-side from the unit's token
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">
              {deepLink}
            </p>
          </CardContent>
        </Card>
      </div>

      {isManager && unit.active ? (
        <>
          <Separator className="my-6" />
          <EditEquipmentForm
            siteId={siteId}
            equipmentId={unit.id}
            name={unit.name}
            brandModel={unit.brand_model ?? ""}
            location={unit.location_note ?? ""}
          />
          <Separator className="my-6" />
          <form action={retireEquipment}>
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="equipmentId" value={unit.id} />
            <Button variant="ghost" type="submit" className="text-destructive">
              {t("equipment.retireButton")}
            </Button>
          </form>
        </>
      ) : null}
    </main>
  );
}
