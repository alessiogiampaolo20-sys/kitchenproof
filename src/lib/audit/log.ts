import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export type AuditEntry = {
  orgId: string;
  siteId?: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityTable: string;
  entityId?: string;
  diff?: Json;
};

/**
 * §5 rule 2: every mutation emits an audit_log row. Hashing (prev/after chain)
 * and the server timestamp are computed by the DB trigger — the app only
 * supplies the semantic payload. Insert runs under the caller's RLS.
 */
export async function writeAudit(
  supabase: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  const h = await headers();
  const { error } = await supabase.from("audit_log").insert({
    org_id: entry.orgId,
    site_id: entry.siteId ?? null,
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_table: entry.entityTable,
    entity_id: entry.entityId ?? null,
    diff: entry.diff ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: h.get("user-agent"),
  });
  if (error) {
    throw new Error(`audit_log insert failed: ${error.message}`);
  }
}
