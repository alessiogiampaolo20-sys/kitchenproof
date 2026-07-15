import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

/**
 * QR/NFC resolver (§15.2): scanning an equipment label deep-links straight to
 * the unit (and, from Phase 2, to its due check). RLS scopes the lookup to
 * sites the device user can access — foreign tokens resolve to nothing.
 */
export default async function ScanPage({
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (token && /^[a-f0-9]{24}$/.test(token)) {
    const supabase = await createClient();
    const { data: unit } = await supabase
      .from("equipment")
      .select("id, site_id")
      .eq("qr_code_token", token)
      .maybeSingle();
    if (unit) {
      redirect(`/app/${unit.site_id}/equipment/${unit.id}`);
    }
  }

  const t = await getTranslations("scan");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-4">
      <p className="text-center text-lg text-muted-foreground" data-testid="scan-invalid">
        {t("invalid")}
      </p>
    </main>
  );
}

// keep the [site] segment param referenced for the route contract (§15.2)
export const dynamic = "force-dynamic";
