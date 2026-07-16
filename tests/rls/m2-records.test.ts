import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";
import { applyActivityTemplate } from "@/lib/compliance/apply-template";
import { runCron } from "@/lib/cron/run";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Phase 2 integrity proofs (§17):
 *  - task_completions append-only for everyone incl. service key
 *  - deviations: immutable facts, write-once lifecycle, forward-only status
 *  - performed_by must be a member of the site's org
 *  - cron: missed marking + deduped reminders
 */

const run = Date.now();
const OWNER = `m2-${run}-owner@test.local`;
const OUTSIDER = `m2-${run}-outsider@test.local`;

let owner: Client;
let outsider: Client;
let ownerId: string;
let siteId: string;
let taskId: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  ownerId = await createUser(admin, OWNER, "M2 Owner");
  await createUser(admin, OUTSIDER, "M2 Outsider");
  owner = await signIn(OWNER);
  outsider = await signIn(OUTSIDER);
  await outsider.rpc("create_organization", { p_name: `M2 Outside ${run}` });

  const org = await owner.rpc("create_organization", { p_name: `M2 Org ${run}` });
  const site = await owner
    .from("sites")
    .insert({ org_id: org.data as string, name: "M2 Site", activity_type: "restaurant" })
    .select("id")
    .single();
  siteId = site.data!.id;
  await applyActivityTemplate(owner, { siteId });
  await owner
    .from("risk_analyses")
    .update({ status: "approved", approved_by: ownerId, approved_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("status", "draft");

  // one controllable task in the past (for missed/cron checks) + one now
  const { data: cp } = await owner
    .from("control_points")
    .select("id")
    .eq("site_id", siteId)
    .eq("template_key", "cold_storage_temp")
    .limit(1)
    .single();
  const { data: task } = await owner
    .from("tasks")
    .insert({
      site_id: siteId,
      control_point_id: cp!.id,
      due_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), // 3h ago
      due_window_minutes: 60,
    })
    .select("id")
    .single();
  taskId = task!.id;
});

describe("task_completions are append-only (§17)", () => {
  let completionId: string;

  it("a member can record a completion attributed to themselves", async () => {
    const { data, error } = await owner
      .from("task_completions")
      .insert({
        task_id: taskId,
        site_id: siteId,
        performed_by: ownerId,
        value_json: { temp_c: 3.2 } as Json,
        passed: true,
        is_late: true,
      })
      .select("id, server_received_at")
      .single();
    expect(error).toBeNull();
    completionId = data!.id;
    // server-authoritative timestamp (never back-dated)
    expect(
      Math.abs(new Date(data!.server_received_at).getTime() - Date.now()),
    ).toBeLessThan(10_000);
  });

  it("completions cannot be updated or deleted — not even with the service key", async () => {
    const upd = await owner
      .from("task_completions")
      .update({ passed: false })
      .eq("id", completionId);
    expect(upd.error).not.toBeNull();

    const del = await owner.from("task_completions").delete().eq("id", completionId);
    expect(del.error).not.toBeNull();

    const admin = adminClient();
    const adminUpd = await admin
      .from("task_completions")
      .update({ passed: false })
      .eq("id", completionId);
    expect(adminUpd.error).not.toBeNull();
    const adminDel = await admin.from("task_completions").delete().eq("id", completionId);
    expect(adminDel.error).not.toBeNull();
  });

  it("performed_by must be a member of the site's org", async () => {
    const { data: outsiderUser } = await outsider.auth.getUser();
    const { error } = await owner.from("task_completions").insert({
      site_id: siteId,
      performed_by: outsiderUser.user!.id, // not a member of owner's org
      value_json: { temp_c: 2 } as Json,
    });
    expect(error).not.toBeNull();
  });

  it("cross-tenant reads are blocked", async () => {
    const { data } = await outsider
      .from("task_completions")
      .select("id")
      .eq("site_id", siteId);
    expect(data).toEqual([]);
  });
});

describe("deviations lifecycle guard (§17/§8.3)", () => {
  let deviationId: string;

  it("creates and progresses a deviation through the 3-step flow", async () => {
    const { data, error } = await owner
      .from("deviations")
      .insert({
        site_id: siteId,
        source: "task",
        detected_by: ownerId,
        description: "Køleskab 1: 12 °C",
        severity: "major",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    deviationId = data!.id;

    const { error: correctError } = await owner
      .from("deviations")
      .update({
        food_assessment: "discarded",
        corrective_action_text: "Justerede termostat",
        corrective_action_by: ownerId,
        status: "corrected",
      })
      .eq("id", deviationId);
    expect(correctError).toBeNull();
  });

  it("detection facts are immutable", async () => {
    const { error } = await owner
      .from("deviations")
      .update({ description: "tampered" })
      .eq("id", deviationId);
    expect(error).not.toBeNull();
  });

  it("corrective action is write-once", async () => {
    const { error } = await owner
      .from("deviations")
      .update({ corrective_action_text: "rewritten history" })
      .eq("id", deviationId);
    expect(error).not.toBeNull();
  });

  it("status can only move forward", async () => {
    const { error } = await owner
      .from("deviations")
      .update({ status: "open" })
      .eq("id", deviationId);
    expect(error).not.toBeNull();
  });

  it("deviations cannot be deleted, even with the service key", async () => {
    const del = await owner.from("deviations").delete().eq("id", deviationId);
    expect(del.error).not.toBeNull();
    const adminDel = await adminClient().from("deviations").delete().eq("id", deviationId);
    expect(adminDel.error).not.toBeNull();
  });
});

describe("cron: missed marking + deduped reminders", () => {
  it("marks past-window tasks missed and reminds once", async () => {
    const admin = adminClient();
    const first = await runCron(admin);
    expect(first.sitesMaterialized).toBeGreaterThan(0);

    const { data: task } = await admin
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .single();
    // completed above → stays pending? No: completion inserted but status
    // update happens in the app action; here the task was never marked done,
    // so 3h past a 60-min window ⇒ missed.
    expect(task!.status).toBe("missed");

    const before = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId);
    await runCron(admin); // second run must not duplicate reminders
    const after = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId);
    expect(after.count).toBe(before.count);
  });

  it("writes the 20:00 manager summary exactly once", async () => {
    const admin = adminClient();
    // construct an instant that is 20:xx in Copenhagen
    const now = new Date();
    const cphHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Copenhagen",
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
    const at20 = new Date(now.getTime() + ((20 - cphHour + 24) % 24) * 3_600_000);
    await runCron(admin, at20);
    await runCron(admin, at20);
    const { count } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("kind", "daily_summary");
    expect(count).toBe(1);
  });
});
