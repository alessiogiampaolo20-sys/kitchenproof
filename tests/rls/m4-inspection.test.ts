import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";

/**
 * Phase 6 fail-closed proof (§10): inspector_links manager-gated and
 * cross-tenant isolated; token resolution only with a valid unexpired token;
 * site_documents isolated with no delete; documents bucket site-scoped.
 */

const run = Date.now();
const OWNER_A = `m4-${run}-a@test.local`;
const OWNER_B = `m4-${run}-b@test.local`;
const OPERATOR_A = `m4-${run}-op@test.local`;

let ownerA: Client;
let ownerB: Client;
let operatorA: Client;
let orgA: string;
let siteA: string;
let profileA: string;
let validToken: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  await createUser(admin, OWNER_A, "M4 Owner A");
  await createUser(admin, OWNER_B, "M4 Owner B");
  await createUser(admin, OPERATOR_A, "M4 Operator A");
  ownerA = await signIn(OWNER_A);
  ownerB = await signIn(OWNER_B);
  profileA = (await ownerA.auth.getUser()).data.user!.id;

  const a = await ownerA.rpc("create_organization", { p_name: `M4 A ${run}` });
  orgA = a.data as string;
  await ownerB.rpc("create_organization", { p_name: `M4 B ${run}` });

  const site = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "Inspect Site", activity_type: "restaurant" })
    .select("id")
    .single();
  siteA = site.data!.id;

  const invite = await ownerA.rpc("create_invite", {
    p_org_id: orgA,
    p_email: OPERATOR_A,
    p_role: "operator",
  });
  operatorA = await signIn(OPERATOR_A);
  await operatorA.rpc("accept_invite", { p_token: invite.data as string });

  validToken = randomBytes(24).toString("base64url");
  const { error } = await ownerA.from("inspector_links").insert({
    site_id: siteA,
    token_hash: createHash("sha256").update(validToken).digest("hex"),
    created_by: profileA,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(error).toBeNull();
});

describe("inspector_links (§10.1)", () => {
  it("operators cannot create links (manager-only)", async () => {
    const opId = (await operatorA.auth.getUser()).data.user!.id;
    const { error } = await operatorA.from("inspector_links").insert({
      site_id: siteA,
      token_hash: createHash("sha256").update("x").digest("hex"),
      created_by: opId,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("a foreign org can neither read nor mint links for site A", async () => {
    const read = await ownerB.from("inspector_links").select("id").eq("site_id", siteA);
    expect(read.data).toEqual([]);
    const bId = (await ownerB.auth.getUser()).data.user!.id;
    const write = await ownerB.from("inspector_links").insert({
      site_id: siteA,
      token_hash: createHash("sha256").update("y").digest("hex"),
      created_by: bId,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(write.error).not.toBeNull();
  });
});

describe("resolve_inspector_link (anon magic-link resolution)", () => {
  it("a valid token resolves site id+name and stamps used_at", async () => {
    const anon = anonClient();
    const { data } = await anon.rpc("resolve_inspector_link", { p_token: validToken });
    expect(data?.[0]?.site_id).toBe(siteA);
    expect(data?.[0]?.site_name).toBe("Inspect Site");
    const { data: link } = await ownerA
      .from("inspector_links")
      .select("used_at")
      .eq("site_id", siteA)
      .single();
    expect(link?.used_at).not.toBeNull();
  });

  it("wrong and expired tokens resolve to nothing", async () => {
    const anon = anonClient();
    const wrong = await anon.rpc("resolve_inspector_link", { p_token: "garbage-token" });
    expect(wrong.data ?? []).toEqual([]);

    const expiredToken = randomBytes(24).toString("base64url");
    await ownerA.from("inspector_links").insert({
      site_id: siteA,
      token_hash: createHash("sha256").update(expiredToken).digest("hex"),
      created_by: profileA,
      expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
    });
    const expired = await anon.rpc("resolve_inspector_link", { p_token: expiredToken });
    expect(expired.data ?? []).toEqual([]);
  });

  it("the anon role cannot read the tables directly (token is the only door)", async () => {
    const anon = anonClient();
    const links = await anon.from("inspector_links").select("id");
    expect(links.data ?? []).toEqual([]);
    const sites = await anon.from("sites").select("id").eq("id", siteA);
    expect(sites.data ?? []).toEqual([]);
  });
});

describe("site_documents (§10.2 tab 5)", () => {
  it("manager uploads; foreign org sees nothing; delete denied", async () => {
    const { data: doc, error } = await ownerA
      .from("site_documents")
      .insert({
        site_id: siteA,
        kind: "pest_control",
        title: "Skadedyrsaftale 2026",
        file_path: `${siteA}/documents/aftale.pdf`,
        uploaded_by: profileA,
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const foreign = await ownerB.from("site_documents").select("id").eq("site_id", siteA);
    expect(foreign.data).toEqual([]);

    const del = await ownerA.from("site_documents").delete().eq("id", doc!.id).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
  });

  it("operators cannot upload documents (manager-only)", async () => {
    const opId = (await operatorA.auth.getUser()).data.user!.id;
    const { error } = await operatorA.from("site_documents").insert({
      site_id: siteA,
      kind: "other",
      title: "Ops upload",
      file_path: `${siteA}/documents/x.pdf`,
      uploaded_by: opId,
    });
    expect(error).not.toBeNull();
  });

  it("documents bucket fails closed across tenants", async () => {
    const blob = new Blob(["kontrakt"], { type: "application/pdf" });
    const ok = await ownerA.storage
      .from("documents")
      .upload(`${siteA}/documents/rls-test.pdf`, blob);
    expect(ok.error).toBeNull();
    const foreign = await ownerB.storage
      .from("documents")
      .download(`${siteA}/documents/rls-test.pdf`);
    expect(foreign.error).not.toBeNull();
  });
});

describe("site_has_manager_pin (lock safeguard)", () => {
  it("false without a manager PIN, true after one is set", async () => {
    const before = await ownerA.rpc("site_has_manager_pin", { p_site_id: siteA });
    expect(before.data).toBe(false);

    const { data: membership } = await ownerA
      .from("memberships")
      .select("id")
      .eq("org_id", orgA)
      .eq("user_id", profileA)
      .single();
    // set_member_pin expects an argon2 hash (server action normally does this)
    await ownerA.rpc("set_member_pin", {
      p_membership_id: membership!.id,
      p_pin_hash:
        "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    const after = await ownerA.rpc("site_has_manager_pin", { p_site_id: siteA });
    expect(after.data).toBe(true);
  });
});
