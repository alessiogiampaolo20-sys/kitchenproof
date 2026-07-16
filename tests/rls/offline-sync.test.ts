import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  adminClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";
import { applyActivityTemplate } from "@/lib/compliance/apply-template";
import {
  recordCompletion,
  type AuditFn,
} from "@/lib/compliance/record-completion";

/**
 * Phase 3 sync-engine proofs (§16):
 *  - completion replay is idempotent on client_uuid
 *  - client_created_at is stored (late-sync flag data) but clamped: a
 *    future-drifting device clock can never make a record earlier/on-time
 *  - composite offline entries (completion + deviation steps) land atomically
 */

const run = Date.now();
const OWNER = `p3-${run}-owner@test.local`;

let owner: Client;
let ownerId: string;
let siteId: string;
let cpId: string;

async function makeTask(dueInMs: number, windowMinutes = 60): Promise<string> {
  const { data } = await owner
    .from("tasks")
    .insert({
      site_id: siteId,
      control_point_id: cpId,
      due_at: new Date(Date.now() + dueInMs).toISOString(),
      due_window_minutes: windowMinutes,
    })
    .select("id")
    .single();
  return data!.id;
}

const auditFn = (client: Client): AuditFn => async (entry) => {
  await client.from("audit_log").insert({
    org_id: entry.orgId,
    site_id: entry.siteId,
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_table: entry.entityTable,
    entity_id: entry.entityId ?? null,
    diff: entry.diff ?? null,
  });
};

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  ownerId = await createUser(admin, OWNER, "P3 Owner");
  owner = await signIn(OWNER);
  const org = await owner.rpc("create_organization", { p_name: `P3 Org ${run}` });
  const site = await owner
    .from("sites")
    .insert({ org_id: org.data as string, name: "P3 Site", activity_type: "restaurant" })
    .select("id")
    .single();
  siteId = site.data!.id;
  await applyActivityTemplate(owner, { siteId });
  await owner
    .from("risk_analyses")
    .update({ status: "approved", approved_by: ownerId, approved_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("status", "draft");
  const { data: cp } = await owner
    .from("control_points")
    .select("id")
    .eq("site_id", siteId)
    .eq("template_key", "cold_storage_temp")
    .limit(1)
    .single();
  cpId = cp!.id;
});

describe("idempotent replay (client_uuid)", () => {
  it("the same queued entry synced twice records exactly once", async () => {
    const taskId = await makeTask(-3 * 3_600_000); // due 3h ago
    const clientUuid = randomUUID();
    const clientCreatedAt = new Date(Date.now() - 30 * 60_000).toISOString();

    const first = await recordCompletion(
      owner,
      {
        siteId,
        taskId,
        actor: { profileId: ownerId, role: "org_owner" },
        value: { temp_c: 3 },
        clientUuid,
        clientCreatedAt,
      },
      auditFn(owner),
    );
    expect("ok" in first && first.passed).toBe(true);

    const second = await recordCompletion(
      owner,
      {
        siteId,
        taskId,
        actor: { profileId: ownerId, role: "org_owner" },
        value: { temp_c: 3 },
        clientUuid,
        clientCreatedAt,
      },
      auditFn(owner),
    );
    expect("ok" in second).toBe(true);

    const { data: completions } = await owner
      .from("task_completions")
      .select("id, is_late, client_created_at, server_received_at")
      .eq("client_uuid", clientUuid);
    expect(completions).toHaveLength(1);

    // late flag: performed 30 min ago vs due 3h ago + 60min window ⇒ late
    expect(completions![0]!.is_late).toBe(true);
    // §16 late-sync flag data: device time recorded, drift > 10 min visible
    const drift =
      new Date(completions![0]!.server_received_at).getTime() -
      new Date(completions![0]!.client_created_at!).getTime();
    expect(drift).toBeGreaterThan(10 * 60_000);
  });

  it("a future-drifting client clock is clamped (never back-dated logic abuse)", async () => {
    const taskId = await makeTask(30 * 60_000); // due in 30 min
    const clientUuid = randomUUID();
    const result = await recordCompletion(
      owner,
      {
        siteId,
        taskId,
        actor: { profileId: ownerId, role: "org_owner" },
        value: { temp_c: 2 },
        clientUuid,
        clientCreatedAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), // +3h
      },
      auditFn(owner),
    );
    expect("ok" in result).toBe(true);
    const { data: completion } = await owner
      .from("task_completions")
      .select("is_late")
      .eq("client_uuid", clientUuid)
      .single();
    // clamped to server now ⇒ within window ⇒ not late (device clock can't
    // push the performed-time into the future)
    expect(completion!.is_late).toBe(false);
  });
});

describe("composite offline entry (completion + deviation steps)", () => {
  it("fail + 3-step flow queued offline lands atomically on sync", async () => {
    const taskId = await makeTask(-60 * 60_000);
    const clientUuid = randomUUID();

    const result = await recordCompletion(
      owner,
      {
        siteId,
        taskId,
        actor: { profileId: ownerId, role: "org_owner" },
        value: { temp_c: 12 }, // fails vs max 5
        clientUuid,
        clientCreatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        deviationSteps: {
          foodAssessment: "discarded",
          correctiveAction: "Justerede termostat",
          followUpHours: 2,
          skipFollowUp: false,
        },
      },
      auditFn(owner),
    );
    expect("ok" in result && !result.passed).toBe(true);
    const deviationId = "ok" in result ? result.deviationId! : "";

    const { data: deviation } = await owner
      .from("deviations")
      .select("status, food_assessment, corrective_action_text, severity")
      .eq("id", deviationId)
      .single();
    expect(deviation!.status).toBe("corrected");
    expect(deviation!.food_assessment).toBe("discarded");
    expect(deviation!.severity).toBe("major"); // 12 vs 5 (§8.3)

    const { data: followUps } = await owner
      .from("tasks")
      .select("id")
      .eq("verifies_deviation_id", deviationId)
      .eq("status", "pending");
    expect(followUps).toHaveLength(1);

    // replay of the composite entry: still exactly one deviation + follow-up
    await recordCompletion(
      owner,
      {
        siteId,
        taskId,
        actor: { profileId: ownerId, role: "org_owner" },
        value: { temp_c: 12 },
        clientUuid,
        clientCreatedAt: new Date().toISOString(),
        deviationSteps: {
          foodAssessment: "discarded",
          correctiveAction: "Justerede termostat",
          followUpHours: 2,
          skipFollowUp: false,
        },
      },
      auditFn(owner),
    );
    const { data: deviationsAfter } = await owner
      .from("deviations")
      .select("id")
      .eq("site_id", siteId)
      .eq("source", "task");
    expect(deviationsAfter).toHaveLength(1);
  });
});

describe("push_subscriptions isolation", () => {
  it("subscriptions are owner-scoped", async () => {
    const { error } = await owner.from("push_subscriptions").insert({
      user_id: ownerId,
      site_id: siteId,
      endpoint: `https://push.example/${run}`,
      p256dh: "key",
      auth: "auth",
    });
    expect(error).toBeNull();

    const admin = adminClient();
    const OTHER = `p3-${run}-other@test.local`;
    await createUser(admin, OTHER, "P3 Other");
    const other = await signIn(OTHER);
    const { data } = await other.from("push_subscriptions").select("id");
    expect(data).toEqual([]);
    const { error: foreignInsert } = await other.from("push_subscriptions").insert({
      user_id: ownerId, // someone else's subscription
      endpoint: `https://push.example/${run}-forged`,
      p256dh: "k",
      auth: "a",
    });
    expect(foreignInsert).not.toBeNull();
  });
});
