import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";

/** Phase 1 tables stay fail-closed across tenants and roles. */

const run = Date.now();
const OWNER_A = `p1i-${run}-a@test.local`;
const OWNER_B = `p1i-${run}-b@test.local`;
const OPERATOR_A = `p1i-${run}-op@test.local`;

let ownerA: Client;
let ownerB: Client;
let operatorA: Client;
let orgA: string;
let siteA: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  await createUser(admin, OWNER_A, "P1 Owner A");
  await createUser(admin, OWNER_B, "P1 Owner B");
  await createUser(admin, OPERATOR_A, "P1 Operator A");
  ownerA = await signIn(OWNER_A);
  ownerB = await signIn(OWNER_B);

  const a = await ownerA.rpc("create_organization", { p_name: `P1I A ${run}` });
  orgA = a.data as string;
  await ownerB.rpc("create_organization", { p_name: `P1I B ${run}` });

  const site = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "Iso Site", activity_type: "cafe" })
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

  await ownerA.from("equipment").insert({ site_id: siteA, kind: "fridge", name: "Iso køl" });
  await ownerA.from("risk_analyses").insert({ site_id: siteA });
});

describe("packs & corpus are shared read-only content", () => {
  it("any authenticated user can read pack versions", async () => {
    const { data } = await ownerB.from("pack_versions").select("version").limit(1);
    expect(data?.length).toBe(1);
  });

  it("tenants cannot publish pack versions", async () => {
    const { error } = await ownerA.from("pack_versions").insert({
      pack_code: "DK",
      version: "9999.99",
      content: {},
    });
    expect(error).not.toBeNull();
  });

  it("published pack versions cannot be updated (immutable)", async () => {
    const { data: version } = await ownerA
      .from("pack_versions")
      .select("id")
      .limit(1)
      .single();
    const { error } = await ownerA
      .from("pack_versions")
      .update({ changelog: "tampered" })
      .eq("id", version!.id);
    expect(error).not.toBeNull(); // no UPDATE grant
  });

  it("anon cannot read packs or corpus", async () => {
    const anon = anonClient();
    for (const table of ["pack_versions", "corpus_documents", "corpus_chunks"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || data?.length === 0, table).toBe(true);
    }
  });
});

describe("programme tables are tenant-isolated", () => {
  it("owner B sees none of org A's programme data", async () => {
    for (const table of ["risk_analyses", "equipment", "control_points", "tasks"] as const) {
      const { data } = await ownerB.from(table).select("id").eq("site_id", siteA);
      expect(data, table).toEqual([]);
    }
  });

  it("owner B cannot create data in org A's site", async () => {
    const ra = await ownerB.from("risk_analyses").insert({ site_id: siteA });
    expect(ra.error).not.toBeNull();
    const eq = await ownerB
      .from("equipment")
      .insert({ site_id: siteA, kind: "fridge", name: "intruder" });
    expect(eq.error).not.toBeNull();
  });

  it("operators can read equipment but cannot write programme data", async () => {
    const { data: units } = await operatorA
      .from("equipment")
      .select("id")
      .eq("site_id", siteA);
    expect(units?.length).toBe(1);

    const eq = await operatorA
      .from("equipment")
      .insert({ site_id: siteA, kind: "freezer", name: "op-created" });
    expect(eq.error).not.toBeNull(); // §4.2: operators cannot edit the programme

    const ra = await operatorA.from("risk_analyses").insert({ site_id: siteA });
    expect(ra.error).not.toBeNull();
  });

  it("cross-tenant QR tokens resolve to nothing", async () => {
    const { data: unit } = await ownerA
      .from("equipment")
      .select("qr_code_token")
      .eq("site_id", siteA)
      .single();
    const { data } = await ownerB
      .from("equipment")
      .select("id")
      .eq("qr_code_token", unit!.qr_code_token);
    expect(data).toEqual([]);
  });
});
