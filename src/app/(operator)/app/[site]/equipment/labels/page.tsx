import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

/** Printable QR label sheet (browser print CSS, §9.2 label approach). */
export default async function EquipmentLabelsPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");

  const { data: units } = await supabase
    .from("equipment")
    .select("id, name, kind, qr_code_token")
    .eq("site_id", siteId)
    .eq("active", true)
    .order("created_at");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const t = await getTranslations("equipment");

  const labels = await Promise.all(
    (units ?? []).map(async (unit) => ({
      ...unit,
      svg: await QRCode.toString(
        `${proto}://${host}/app/${siteId}/scan?token=${unit.qr_code_token}`,
        { type: "svg", margin: 1, width: 140 },
      ),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-3xl p-6 print:p-0">
      <h1 className="mb-4 text-lg font-semibold print:hidden">
        {site.name} — {t("printLabels")}
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {labels.map((label) => (
          <div
            key={label.id}
            className="flex break-inside-avoid flex-col items-center gap-1 rounded-xl border p-3"
          >
            <div dangerouslySetInnerHTML={{ __html: label.svg }} />
            <p className="text-center text-sm font-semibold">{label.name}</p>
            <p className="text-center text-xs text-muted-foreground">
              {t(`kinds.${label.kind}`)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
