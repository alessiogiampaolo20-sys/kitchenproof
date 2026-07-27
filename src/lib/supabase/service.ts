import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client — NEVER used in ordinary user request paths (§7).
 * Allowed only where an independent authorization check + audit exist:
 * cron (CRON_SECRET) and the §10 inspector magic link (token = credential,
 * every read scoped to the resolved site_id — see CLAUDE.md decision log).
 *
 * Fails loudly on a missing key. A `!` assertion here used to produce a client
 * that returned `{ data: null, error }` for every query instead of throwing:
 * the cron then reported success while materialising nothing, and the
 * inspector saw empty tabs on a page that was working perfectly. Production
 * ran that way for five days (docs/audit.md §3).
 */
export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — the cron and the inspector link cannot read the database without it",
    );
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
