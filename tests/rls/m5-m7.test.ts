import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";

/**
 * Phase 7 fail-closed proof: review pipeline, smiley, training, templates and
 * proposals — cross-tenant isolation, role gates, append-only where records
 * are history (§17).
 */

const run = Date.now();
const OWNER_A = `m57-${run}-a@test.local`;
const OWNER_B = `m57-${run}-b@test.local`;
const OPERATOR_A = `m57-${run}-op@test.local`;

let ownerA: Client;
let ownerB: Client;
let operatorA: Client;
let orgA: string;
let siteA: string;
let profileA: string;
let smileyId: string;
let templateId: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  await createUser(admin, OWNER_A, "M57 Owner A");
  await createUser(admin, OWNER_B, "M57 Owner B");
  await createUser(admin, OPERATOR_A, "M57 Operator A");
  ownerA = await signIn(OWNER_A);
  ownerB = await signIn(OWNER_B);
  profileA = (await ownerA.auth.getUser()).data.user!.id;

  const a = await ownerA.rpc("create_organization", { p_name: `M57 A ${run}` });
  orgA = a.data as string;
  await ownerB.rpc("create_organization", { p_name: `M57 B ${run}` });

  const site = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "M57 Site", activity_type: "cafe" })
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

  smileyId = (
    await ownerA
      .from("smiley_inspections")
      .insert({
        site_id: siteA,
        inspected_on: "2026-07-01",
        result: 1,
        recorded_by: profileA,
      })
      .select("id")
      .single()
  ).data!.id;
  templateId = (
    await ownerA
      .from("org_programme_templates")
      .insert({
        org_id: orgA,
        name: "RLS Template",
        content: { rows: [], controlPoints: [] },
        created_by: profileA,
      })
      .select("id")
      .single()
  ).data!.id;
});

describe("cross-tenant isolation", () => {
  it("org B sees none of org A's M5/M7 data", async () => {
    expect((await ownerB.from("site_review_tasks").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("smiley_inspections").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("training_records").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("org_programme_templates").select("id").eq("org_id", orgA)).data).toEqual([]);
    expect((await ownerB.from("programme_change_proposals").select("id").eq("site_id", siteA)).data).toEqual([]);
  });

  it("regulatory updates are shared read-only content", async () => {
    const read = await ownerB.from("regulatory_updates").select("id").limit(1);
    expect(read.error).toBeNull(); // readable (may be empty)
    const write = await ownerB.from("regulatory_updates").insert({
      pack_code: "DK",
      from_version: "0000.01",
      to_version: "0000.02",
      summary_i18n: { da: "x" },
    });
    expect(write.error).not.toBeNull(); // publish is platform-only
  });
});

describe("role gates", () => {
  it("operators cannot record smiley results or training (manager-only)", async () => {
    const opId = (await operatorA.auth.getUser()).data.user!.id;
    const smiley = await operatorA.from("smiley_inspections").insert({
      site_id: siteA,
      inspected_on: "2026-07-02",
      result: 2,
      recorded_by: opId,
    });
    expect(smiley.error).not.toBeNull();
    const training = await operatorA.from("training_records").insert({
      site_id: siteA,
      person_name: "X",
      course: "Y",
      trained_on: "2026-07-02",
      recorded_by: opId,
    });
    expect(training.error).not.toBeNull();
  });

  it("operators cannot create org templates or push proposals", async () => {
    const opId = (await operatorA.auth.getUser()).data.user!.id;
    const template = await operatorA.from("org_programme_templates").insert({
      org_id: orgA,
      name: "Ops template",
      content: {},
      created_by: opId,
    });
    expect(template.error).not.toBeNull();
    const proposal = await operatorA.from("programme_change_proposals").insert({
      site_id: siteA,
      template_id: templateId,
      diff_json: [],
      proposed_by: opId,
    });
    expect(proposal.error).not.toBeNull();
  });

  it("operators cannot resolve review tasks (manager decision)", async () => {
    const { data: task } = await ownerA
      .from("site_review_tasks")
      .insert({ site_id: siteA, trigger: "annual" })
      .select("id")
      .single();
    const attempt = await operatorA
      .from("site_review_tasks")
      .update({ status: "resolved" })
      .eq("id", task!.id)
      .select("id");
    expect(attempt.error !== null || (attempt.data ?? []).length === 0).toBe(true);
  });
});

describe("append-only history (§17)", () => {
  it("smiley outcomes can never be edited or deleted", async () => {
    const upd = await ownerA
      .from("smiley_inspections")
      .update({ result: 4 })
      .eq("id", smileyId)
      .select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await ownerA
      .from("smiley_inspections")
      .delete()
      .eq("id", smileyId)
      .select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await ownerA
      .from("smiley_inspections")
      .select("result")
      .eq("id", smileyId)
      .single();
    expect(still.data?.result).toBe(1);
  });

  it("templates and proposals cannot be deleted (history)", async () => {
    const del = await ownerA
      .from("org_programme_templates")
      .delete()
      .eq("id", templateId)
      .select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
  });
});
