// §11 weekly org digest: scores, misses, top deviations, expiring value,
// waste — one email per org per ISO week, sent Mondays (org admins).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getPortfolio } from "@/lib/compliance/score-data";
import { sendEmail } from "@/lib/email/provider";

type Client = SupabaseClient<Database>;

export function isoWeek(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function sendWeeklyDigests(
  supabase: Client,
  now = new Date(),
): Promise<{ digests: number }> {
  if (now.getUTCDay() !== 1) return { digests: 0 }; // Mondays only
  const week = isoWeek(now);
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  let digests = 0;

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("status", "active");

  for (const org of orgs ?? []) {
    // one digest per org per week (notifications row is the dedupe key)
    const { data: already } = await supabase
      .from("notifications")
      .select("id")
      .eq("kind", "weekly_digest")
      .eq("payload->>org_id", org.id)
      .eq("payload->>week", week)
      .limit(1);
    if (already && already.length > 0) continue;

    const portfolio = await getPortfolio(supabase, org.id);
    if (portfolio.length === 0) continue;
    const siteIds = portfolio.map((site) => site.siteId);

    const [{ data: missed }, { data: topDeviations }, { data: expiring }, { data: waste }] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("site_id")
          .in("site_id", siteIds)
          .eq("status", "missed")
          .gte("due_at", since7),
        supabase
          .from("deviations")
          .select("description, severity, site_id")
          .in("site_id", siteIds)
          .gte("detected_at", since7)
          .in("severity", ["major", "critical"])
          .limit(5),
        supabase
          .from("v_expiring_batches")
          .select("id")
          .in("site_id", siteIds),
        supabase
          .from("inventory_moves")
          .select("quantity")
          .in("site_id", siteIds)
          .eq("kind", "waste")
          .gte("moved_at", since7),
      ]);

    const wasteUnits = (waste ?? []).reduce(
      (sum, move) => sum + Number(move.quantity),
      0,
    );
    const lines = [
      `KitchenProof — ugentligt overblik for ${org.name} (${week})`,
      "",
      ...portfolio.map(
        (site) =>
          `• ${site.siteName}: score ${site.score.score}/100 · ${site.openDeviations} åbne afvigelser${site.redFlags.length > 0 ? " · ⚠" : ""}`,
      ),
      "",
      `Mistede opgaver (7 dage): ${(missed ?? []).length}`,
      `Partier tæt på udløb: ${(expiring ?? []).length}`,
      `Registreret madspild (7 dage): ${wasteUnits} enheder`,
      ...((topDeviations ?? []).length > 0
        ? ["", "Væsentlige afvigelser:", ...(topDeviations ?? []).map((d) => `• ${d.description}`)]
        : []),
      "",
      "Se detaljer: /org/dashboard",
    ];

    const { data: admins } = await supabase
      .from("memberships")
      .select("user_id, profile:profiles(id)")
      .eq("org_id", org.id)
      .in("role", ["org_owner", "org_admin"])
      .not("accepted_at", "is", null);
    const adminIds = (admins ?? [])
      .map((membership) => membership.user_id)
      .filter((id): id is string => id !== null);
    if (adminIds.length === 0) continue;

    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .in("id", adminIds);
    // e-mail addresses live in auth; the service client can read them
    for (const user of users ?? []) {
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
      if (authUser?.user?.email) {
        await sendEmail({
          to: authUser.user.email,
          subject: `KitchenProof ugeoverblik — ${org.name}`,
          text: lines.join("\n"),
        });
      }
    }

    await supabase.from("notifications").insert({
      user_id: adminIds[0],
      kind: "weekly_digest",
      payload: { org_id: org.id, week } as Json,
      channels: ["in_app", "email"],
    });
    digests++;
  }

  return { digests };
}
