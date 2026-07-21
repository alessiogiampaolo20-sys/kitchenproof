import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Printer, QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { NewEquipmentForm } from "./equipment-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const { data: units } = await supabase
    .from("equipment")
    .select("id, kind, name, brand_model, location_note, photo_path, active")
    .eq("site_id", siteId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  const t = await getTranslations();

  const photoUrls = new Map<string, string>();
  for (const unit of units ?? []) {
    if (unit.photo_path) {
      const { data } = await supabase.storage
        .from("photos")
        .createSignedUrl(unit.photo_path, 3600);
      if (data?.signedUrl) photoUrls.set(unit.id, data.signedUrl);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">

      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("equipment.title")}</h1>
        {isManager && (units ?? []).length > 0 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${siteId}/equipment/labels`} target="_blank">
              <Printer /> {t("equipment.printLabels")}
            </Link>
          </Button>
        ) : null}
      </header>

      {(units ?? []).length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">{t("equipment.empty")}</p>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {(units ?? []).map((unit) => (
            <Link key={unit.id} href={`/app/${siteId}/equipment/${unit.id}`}>
              <Card className="h-full transition-colors hover:border-primary" data-testid="equipment-card">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {unit.name}
                    <QrCode className="ml-auto size-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>
                    {t(`equipment.kinds.${unit.kind}`)}
                    {unit.location_note ? ` · ${unit.location_note}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {photoUrls.has(unit.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls.get(unit.id)}
                      alt={unit.name}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                      <Badge variant="outline">{t(`equipment.kinds.${unit.kind}`)}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {isManager ? <NewEquipmentForm siteId={siteId} /> : null}
    </main>
  );
}
