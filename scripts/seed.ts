/**
 * pnpm db:seed — Phase 1 seed (local/dev):
 *  1. publishes the DK compliance pack v1 (validated against the pack schema)
 *  2. ingests the official corpus (documents + page-chunked text for FTS/RAG)
 *  3. spawns the demo restaurant fixture through the REAL user paths
 *     (RPC create_organization → template apply → approval → materializer)
 *
 * Service role is used only for platform-side provisioning (pack publish,
 * corpus, demo user creation) — tenant data flows through the demo user's
 * RLS-scoped session, so the seed doubles as an end-to-end sanity check.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/supabase/database.types";
import { parsePack } from "../src/lib/compliance/pack-schema";
import { applyActivityTemplate } from "../src/lib/compliance/apply-template";
import { materializeSiteTasks } from "../src/lib/compliance/materialize-runner";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env vars — copy .env.example to .env.local first.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const DEMO_EMAIL = "demo@kitchenproof.local";
const DEMO_PASSWORD = "demo-password-123";

async function publishPack(): Promise<string> {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), "supabase/seed/dk-pack.json"), "utf8"),
  );
  const pack = parsePack(raw); // hard gate: invalid pack content never reaches the DB

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
      changelog: "DK pack v1 — Phase 1 seed, authored against the §3.3 corpus.",
    });
    if (error) throw new Error(`pack_versions insert: ${error.message}`);
    console.log(`✓ published DK pack ${pack.version}`);
  } else {
    const { error } = await admin
      .from("pack_versions")
      .update({ content: raw as Json })
      .eq("id", existing.id);
    if (error) throw new Error(`pack_versions update: ${error.message}`);
    console.log(`✓ refreshed DK pack ${pack.version}`);
  }

  // corpus documents
  for (const doc of pack.corpus) {
    const { error } = await admin.from("corpus_documents").upsert({
      doc_id: doc.docId,
      pack_code: pack.pack,
      title: doc.title,
      version_date: doc.versionDate ?? null,
      file_path: doc.file,
      pages: doc.pages,
      lang: doc.lang,
    });
    if (error) throw new Error(`corpus_documents upsert: ${error.message}`);
  }
  return pack.version;
}

async function ingestCorpusChunks(): Promise<void> {
  const textDir = resolve(process.cwd(), "supabase/seed/corpus/DK/text");
  const files = readdirSync(textDir).filter((f) => f.endsWith(".txt"));
  for (const file of files) {
    const docId = file.replace(".txt", "");
    const raw = readFileSync(resolve(textDir, file), "utf8");
    const pages = raw.split(/^===== PAGE (\d+) =====$/m);
    // pages array: ["", "1", content1, "2", content2, …]
    const chunks: { doc_id: string; page_from: number; page_to: number; content: string }[] = [];
    for (let i = 1; i < pages.length - 1; i += 2) {
      const pageNo = Number(pages[i]);
      const content = (pages[i + 1] ?? "").trim();
      if (content.length < 40) continue; // skip empty/near-empty pages
      chunks.push({
        doc_id: docId,
        page_from: pageNo,
        page_to: pageNo,
        content: content.slice(0, 8000),
      });
    }
    // deterministic re-seed: replace the doc's chunks
    await admin.from("corpus_chunks").delete().eq("doc_id", docId);
    for (let i = 0; i < chunks.length; i += 200) {
      const { error } = await admin.from("corpus_chunks").insert(chunks.slice(i, i + 200));
      if (error) throw new Error(`corpus_chunks insert (${docId}): ${error.message}`);
    }
    console.log(`✓ corpus ${docId}: ${chunks.length} chunks`);
  }
}

async function demoFixture(): Promise<void> {
  // demo user (idempotent)
  const { data: userList } = await admin.auth.admin.listUsers();
  let demoUser = userList?.users.find((u) => u.email === DEMO_EMAIL);
  if (!demoUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Demo Ejer", locale: "da" },
    });
    if (error || !data.user) throw new Error(`demo user: ${error?.message}`);
    demoUser = data.user;
  }

  // tenant data flows through the demo user's own RLS-scoped session
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signInError) throw new Error(`demo sign-in: ${signInError.message}`);

  const { data: memberships } = await client
    .from("memberships")
    .select("org_id")
    .eq("user_id", demoUser.id)
    .not("accepted_at", "is", null);
  let orgId = memberships?.[0]?.org_id;
  if (!orgId) {
    const { data, error } = await client.rpc("create_organization", {
      p_name: "KitchenProof Demo ApS",
    });
    if (error || !data) throw new Error(`demo org: ${error?.message}`);
    orgId = data;
  }

  let { data: site } = await client
    .from("sites")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("name", "Demo Restaurant København")
    .maybeSingle();
  if (!site) {
    const { data, error } = await client
      .from("sites")
      .insert({
        org_id: orgId,
        name: "Demo Restaurant København",
        activity_type: "restaurant",
        address: "Smørrebrødsgade 1",
        city: "København",
        postal_code: "1050",
        cvr_p_number: "1000000000",
      })
      .select("id, name")
      .single();
    if (error || !data) throw new Error(`demo site: ${error?.message}`);
    site = data;
  }

  const { data: existingRa } = await client
    .from("risk_analyses")
    .select("id, status")
    .eq("site_id", site.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let raId = existingRa?.id;
  if (!existingRa) {
    const { riskAnalysisId } = await applyActivityTemplate(client, { siteId: site.id });
    raId = riskAnalysisId;
    console.log("✓ demo programme drafted from the restaurant template");
  }
  if (raId && existingRa?.status !== "approved") {
    const { error } = await client
      .from("risk_analyses")
      .update({
        status: "approved",
        approved_by: demoUser.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", raId)
      .eq("status", "draft");
    if (error) throw new Error(`demo approval: ${error.message}`);
    await client.from("programme_documents").insert({
      site_id: site.id,
      risk_analysis_id: raId,
      kind: "egenkontrolprogram",
    });
    console.log("✓ demo programme approved");
  }

  const result = await materializeSiteTasks(client, site.id);
  const { data: tasks } = await client
    .from("tasks")
    .select("due_at, control_point:control_points(template_key)")
    .eq("site_id", site.id)
    .eq("status", "pending")
    .order("due_at");

  const byTemplate = new Map<string, number>();
  for (const task of tasks ?? []) {
    const key = task.control_point?.template_key ?? "custom";
    byTemplate.set(key, (byTemplate.get(key) ?? 0) + 1);
  }
  console.log(`✓ demo site "${site.name}" — 7-day schedule (${result.inserted} materialized):`);
  for (const [key, count] of [...byTemplate.entries()].sort()) {
    console.log(`    ${key.padEnd(22)} ${count}`);
  }
  console.log(`\n  Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

async function main() {
  await publishPack();
  await ingestCorpusChunks();
  await demoFixture();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
