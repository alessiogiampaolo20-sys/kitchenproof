import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";

/**
 * Phase 4 fail-closed proof: ai_runs (append-only, org-admin read) and
 * ra_imports (site-scoped, no delete — originals are permanent evidence),
 * plus the imports/exports storage buckets.
 */

const run = Date.now();
const OWNER_A = `p4-${run}-a@test.local`;
const OWNER_B = `p4-${run}-b@test.local`;
const OPERATOR_A = `p4-${run}-op@test.local`;

let ownerA: Client;
let ownerB: Client;
let operatorA: Client;
let orgA: string;
let siteA: string;
let aiRunId: string;
let importId: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  await createUser(admin, OWNER_A, "P4 Owner A");
  await createUser(admin, OWNER_B, "P4 Owner B");
  await createUser(admin, OPERATOR_A, "P4 Operator A");
  ownerA = await signIn(OWNER_A);
  ownerB = await signIn(OWNER_B);

  const a = await ownerA.rpc("create_organization", { p_name: `P4 A ${run}` });
  orgA = a.data as string;
  await ownerB.rpc("create_organization", { p_name: `P4 B ${run}` });

  const site = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "AI Site", activity_type: "restaurant" })
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

  const aiRun = await ownerA
    .from("ai_runs")
    .insert({
      org_id: orgA,
      site_id: siteA,
      feature: "risk_wizard",
      model: "fixture:test",
      prompt_version: "test-1",
    })
    .select("id")
    .single();
  aiRunId = aiRun.data!.id;

  const imported = await ownerA
    .from("ra_imports")
    .insert({
      site_id: siteA,
      kind: "pdf",
      file_paths: [`${siteA}/imports/rls-test/doc.pdf`],
    })
    .select("id")
    .single();
  importId = imported.data!.id;
});

describe("ai_runs (§6.5)", () => {
  it("org admin reads own runs; foreign org sees nothing", async () => {
    const own = await ownerA.from("ai_runs").select("id").eq("org_id", orgA);
    expect(own.data?.length).toBeGreaterThanOrEqual(1);
    const foreign = await ownerB.from("ai_runs").select("id").eq("org_id", orgA);
    expect(foreign.data).toEqual([]);
  });

  it("operators cannot read the AI quality log (org-admin only)", async () => {
    const { data } = await operatorA.from("ai_runs").select("id").eq("org_id", orgA);
    expect(data).toEqual([]);
  });

  it("a foreign org cannot insert runs into org A", async () => {
    const { error } = await ownerB.from("ai_runs").insert({
      org_id: orgA,
      feature: "assistant",
      model: "x",
      prompt_version: "x",
    });
    expect(error).not.toBeNull();
  });

  it("append-only: update and delete are denied even for the org owner", async () => {
    const upd = await ownerA
      .from("ai_runs")
      .update({ accepted: true })
      .eq("id", aiRunId)
      .select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await ownerA.from("ai_runs").delete().eq("id", aiRunId).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await ownerA.from("ai_runs").select("accepted").eq("id", aiRunId).single();
    expect(still.data?.accepted).toBeNull();
  });
});

describe("ra_imports (§7.5)", () => {
  it("site members read own imports; foreign org sees nothing", async () => {
    const own = await ownerA.from("ra_imports").select("id").eq("site_id", siteA);
    expect(own.data?.length).toBe(1);
    const foreign = await ownerB.from("ra_imports").select("id").eq("site_id", siteA);
    expect(foreign.data).toEqual([]);
  });

  it("operators cannot create imports (manager path)", async () => {
    const { error } = await operatorA.from("ra_imports").insert({
      site_id: siteA,
      kind: "pdf",
      file_paths: ["x.pdf"],
    });
    expect(error).not.toBeNull();
  });

  it("a foreign org cannot update org A's import", async () => {
    const { data } = await ownerB
      .from("ra_imports")
      .update({ status: "confirmed" })
      .eq("id", importId)
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("originals are permanent: delete denied even for the site manager", async () => {
    const del = await ownerA.from("ra_imports").delete().eq("id", importId).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await ownerA.from("ra_imports").select("id").eq("id", importId);
    expect(still.data?.length).toBe(1);
  });
});

describe("imports/exports storage buckets", () => {
  it("uploads are site-scoped: foreign org cannot write into site A's folder", async () => {
    const blob = new Blob(["not yours"], { type: "application/pdf" });
    const { error } = await ownerB.storage
      .from("imports")
      .upload(`${siteA}/imports/rls-test/foreign.pdf`, blob);
    expect(error).not.toBeNull();
  });

  it("foreign org cannot read site A's originals or exports", async () => {
    const blob = new Blob(["original"], { type: "application/pdf" });
    await ownerA.storage.from("imports").upload(`${siteA}/imports/rls-test/doc.pdf`, blob);
    const download = await ownerB.storage
      .from("imports")
      .download(`${siteA}/imports/rls-test/doc.pdf`);
    expect(download.error).not.toBeNull();
    const exportsDl = await ownerB.storage
      .from("exports")
      .download(`${siteA}/programme/whatever.pdf`);
    expect(exportsDl.error).not.toBeNull();
  });
});
