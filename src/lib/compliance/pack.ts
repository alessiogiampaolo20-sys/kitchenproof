// Server/script-side only (imported by server actions, seed and tests — no
// Next.js runtime dependencies, so no "server-only" guard).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { parsePack, type CompliancePack } from "./pack-schema";

/**
 * Pack loader (§3.2): reads a published pack version from the DB and validates
 * it. App code NEVER embeds regulatory content — it always flows through here.
 */
export async function loadPackVersion(
  supabase: SupabaseClient<Database>,
  packCode: string,
  version?: string,
): Promise<{ pack: CompliancePack; versionId: string; version: string }> {
  let query = supabase
    .from("pack_versions")
    .select("id, version, content")
    .eq("pack_code", packCode)
    .order("published_at", { ascending: false })
    .limit(1);
  if (version) {
    query = supabase
      .from("pack_versions")
      .select("id, version, content")
      .eq("pack_code", packCode)
      .eq("version", version)
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new Error(
      `pack ${packCode}${version ? `@${version}` : ""} not found: ${error?.message ?? "no rows"}`,
    );
  }

  return {
    pack: parsePack(data.content),
    versionId: data.id,
    version: data.version,
  };
}
