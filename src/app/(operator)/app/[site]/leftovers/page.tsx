import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MoonStar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { LeftoverDeck } from "./leftover-deck";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LeftoversPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");

  // §9.5 heuristic: open batches likely touched today — moved/produced in the
  // last 48h, or living in a fridge.
  const now = new Date();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const [{ data: batches }, { data: recentMoves }, { data: lastSession }] =
    await Promise.all([
      supabase
        .from("batches")
        .select(
          "id, lot_code, remaining, unit, expiry_date, origin, created_at, product:products(name, storage_type)",
        )
        .eq("site_id", siteId)
        .eq("status", "active")
        .gt("remaining", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("inventory_moves")
        .select("batch_id")
        .eq("site_id", siteId)
        .gte("moved_at", since),
      supabase
        .from("leftover_sessions")
        .select("id, started_at, completed_at")
        .eq("site_id", siteId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const recentBatchIds = new Set((recentMoves ?? []).map((m) => m.batch_id));
  const candidates = (batches ?? []).filter(
    (batch) =>
      recentBatchIds.has(batch.id) ||
      batch.created_at >= since ||
      batch.product?.storage_type === "fridge",
  );

  const missedYesterday =
    lastSession !== null &&
    lastSession?.completed_at === null &&
    lastSession.started_at < new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

  const t = await getTranslations("leftovers");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MoonStar className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        {missedYesterday ? (
          <CardContent>
            <p className="text-sm text-destructive" data-testid="missed-session">
              {t("missedSession")}
            </p>
          </CardContent>
        ) : null}
      </Card>
      <LeftoverDeck
        siteId={siteId}
        items={candidates.map((batch) => ({
          batchId: batch.id,
          name: batch.product?.name ?? "",
          lotCode: batch.lot_code,
          remaining: Number(batch.remaining),
          unit: batch.unit,
          expiryDate: batch.expiry_date,
          produced: batch.origin === "produced",
        }))}
      />
    </main>
  );
}
