import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parsePack } from "@/lib/compliance/pack-schema";

// Local-stack defaults (shared, well-known supabase-cli dev keys); CI/dev can
// override via env. NEVER points at production.
export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export type Client = SupabaseClient<Database>;

export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

/** Service-role client — test setup only (mirrors platform-side provisioning). */
export function adminClient(): Client {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function createUser(
  admin: Client,
  email: string,
  fullName: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
    user_metadata: { full_name: fullName, locale: "da" },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

export async function signIn(email: string): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "test-password-123",
  });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

/** Publishes the DK pack exactly like the seed does (idempotent, validated). */
export async function ensurePackPublished(admin: Client): Promise<void> {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), "supabase/seed/dk-pack.json"), "utf8"),
  );
  const pack = parsePack(raw);
  const { error: packError } = await admin.from("compliance_packs").upsert({
    code: pack.pack,
    name: "Danmark — Fødevarestyrelsen (DVFA)",
    authority_json: pack.authority as unknown as Json,
  });
  if (packError) throw new Error(`compliance_packs upsert: ${packError.message}`);

  const { data: existing } = await admin
    .from("pack_versions")
    .select("id")
    .eq("pack_code", pack.pack)
    .eq("version", pack.version)
    .maybeSingle();
  if (!existing) {
    const { error } = await admin.from("pack_versions").insert({
      pack_code: pack.pack,
      version: pack.version,
      content: raw as Json,
    });
    if (error && !error.message.includes("duplicate")) {
      throw new Error(`pack_versions insert: ${error.message}`);
    }
  }
}
