import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { sendEmail } from "@/lib/email/provider";

type Client = SupabaseClient<Database>;

/** Fan out a notification to every manager of a site (in_app + best-effort email). */
export async function notifySiteManagers(
  supabase: Client,
  args: {
    siteId: string;
    kind: string;
    payload: Json;
    emailSubject?: string;
    emailText?: string;
  },
): Promise<void> {
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name")
    .eq("id", args.siteId)
    .maybeSingle();
  if (!site) return;

  const { data: managers } = await supabase
    .from("memberships")
    .select("user_id, role, site_ids, profile:profiles(id, full_name)")
    .eq("org_id", site.org_id)
    .in("role", ["org_owner", "org_admin", "site_manager", "consultant"])
    .not("accepted_at", "is", null);

  const recipients = (managers ?? []).filter(
    (m) => m.user_id && (m.site_ids === null || m.site_ids.includes(site.id)),
  );

  for (const manager of recipients) {
    await supabase.from("notifications").insert({
      user_id: manager.user_id,
      site_id: site.id,
      kind: args.kind,
      payload: args.payload,
      channels: args.emailSubject ? ["in_app", "email"] : ["in_app"],
    });
  }

  if (args.emailSubject && args.emailText) {
    const ids = recipients.map((r) => r.user_id).filter((v): v is string => !!v);
    if (ids.length > 0) {
      const { data: users } = await supabase
        .from("memberships")
        .select("invited_email, user_id")
        .in("user_id", ids)
        .eq("org_id", site.org_id);
      // invited_email survives acceptance for invited members; owners have none.
      for (const user of users ?? []) {
        if (user.invited_email) {
          await sendEmail({
            to: user.invited_email,
            subject: args.emailSubject,
            text: args.emailText,
          });
        }
      }
    }
  }
}
