import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client — NEVER used in ordinary user request paths (§7).
 * Allowed only where an independent authorization check + audit exist:
 * cron (CRON_SECRET) and the §10 inspector magic link (token = credential,
 * every read scoped to the resolved site_id — see CLAUDE.md decision log).
 */
export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
