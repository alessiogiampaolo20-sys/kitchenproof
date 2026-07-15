import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";
import { applyActivityTemplate } from "@/lib/compliance/apply-template";
import { materializeSiteTasks } from "@/lib/compliance/materialize-runner";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Phase 1 DoD integration proof:
 *  - demo restaurant template → approval → CORRECT 7-day schedule
 *  - every pack-derived control point limit carries a corpus sourceRef
 *  - materialization is idempotent
 *  - equipment gets QR tokens
 */

const run = Date.now();
const OWNER = `p1-${run}-owner@test.local`;

let owner: Client;
let siteId: string;
let raId: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);

  await createUser(admin, OWNER, "Phase One Owner");
  owner = await signIn(OWNER);
  const org = await owner.rpc("create_organization", { p_name: `P1 Org ${run}` });
  const site = await owner
    .from("sites")
    .insert({ org_id: org.data as string, name: "P1 Restaurant", activity_type: "restaurant" })
    .select("id")
    .single();
  siteId = site.data!.id;

  const applied = await applyActivityTemplate(owner, { siteId });
  raId = applied.riskAnalysisId;
});

describe("template instantiation", () => {
  it("creates the 6 official skema sections and the restaurant rows", async () => {
    const { data: steps } = await owner
      .from("process_steps")
      .select("key")
      .eq("risk_analysis_id", raId)
      .order("position");
    expect(steps?.map((s) => s.key)).toEqual([
      "modtagelse", "opbevaring", "tilberedning", "salg_servering", "transport", "andet",
    ]);

    const { data: rows } = await owner
      .from("ra_activity_rows")
      .select("activity_key, applies, is_critical")
      .eq("risk_analysis_id", raId);
    const critical = rows!.filter((r) => r.is_critical).map((r) => r.activity_key);
    expect(critical).toContain("opbevaring.chilled");
    expect(critical).toContain("tilberedning.cooling");
    expect(critical).toContain("tilberedning.hot_holding");
  });

  it("creates suggested equipment with QR tokens (2 fridges, 1 freezer, 1 hot holding)", async () => {
    const { data: units } = await owner
      .from("equipment")
      .select("kind, qr_code_token")
      .eq("site_id", siteId);
    const kinds = units!.map((u) => u.kind).sort();
    expect(kinds).toEqual(["freezer", "fridge", "fridge", "hot_holding"]);
    for (const unit of units!) {
      expect(unit.qr_code_token).toMatch(/^[a-f0-9]{24}$/); // QR deep-link token
    }
  });

  it("every pack-derived control point carries the corpus sourceRef (DoD)", async () => {
    const { data: cps } = await owner
      .from("control_points")
      .select("template_key, source_ref, limit_json")
      .eq("risk_analysis_id", raId);
    expect(cps!.length).toBeGreaterThanOrEqual(10);
    for (const cp of cps!) {
      if (cp.template_key === null) continue;
      const ref = cp.source_ref as { docId?: string; section?: string; page?: number } | null;
      expect(ref?.docId, cp.template_key ?? "").toBeTruthy();
      expect(ref?.section, cp.template_key ?? "").toBeTruthy();
      expect(ref?.page, cp.template_key ?? "").toBeGreaterThan(0);
    }
  });

  it("per-unit temperature CPs: one per fridge with the ≤5 °C pack default", async () => {
    const { data: cps } = await owner
      .from("control_points")
      .select("template_key, limit_json, equipment_id")
      .eq("risk_analysis_id", raId)
      .eq("template_key", "cold_storage_temp");
    expect(cps).toHaveLength(2); // one per fridge
    for (const cp of cps!) {
      expect(cp.equipment_id).toBeTruthy();
      expect(cp.limit_json).toMatchObject({ max: 5 });
    }
  });
});

describe("approval → 7-day schedule (DoD)", () => {
  it("approves and materializes the correct schedule", async () => {
    const uid = (await owner.auth.getUser()).data.user!.id;
    const { error } = await owner
      .from("risk_analyses")
      .update({ status: "approved", approved_by: uid, approved_at: new Date().toISOString() })
      .eq("id", raId);
    expect(error).toBeNull();

    const result = await materializeSiteTasks(owner, siteId);
    expect(result.inserted).toBeGreaterThan(0);

    const { data: tasks } = await owner
      .from("tasks")
      .select("due_at, control_point:control_points(template_key)")
      .eq("site_id", siteId)
      .eq("status", "pending");
    const counts = new Map<string, number>();
    for (const task of tasks!) {
      const key = task.control_point?.template_key ?? "custom";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Daily CPs occur exactly N times in a rolling 168h window (N=7, ±1 only
    // across DST transitions); scheduled counts scale with equipment units.
    const n = counts.get("freezer_temp") ?? 0;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(8);
    expect(counts.get("cold_storage_temp")).toBe(2 * n);   // 2 fridges
    expect(counts.get("hot_holding_56")).toBe(2 * n);       // 2 service periods
    expect(counts.get("cleaning_plan")).toBe(n);
    expect(counts.get("personal_hygiene")).toBe(n);
    expect(counts.get("separation_check")).toBe(n);
    // per-event CPs exist but are never scheduled
    expect(counts.get("receiving_check")).toBeUndefined();
    expect(counts.get("heating_core_temp")).toBeUndefined();
    expect(counts.get("cooling_56_10_4h")).toBeUndefined();
    // monthly pest check: at most one occurrence per window
    expect(counts.get("pest_control") ?? 0).toBeLessThanOrEqual(1);

    // every due_at lies inside the window
    for (const task of tasks!) {
      expect(new Date(task.due_at) >= new Date(result.window.from)).toBe(true);
      expect(new Date(task.due_at) < new Date(result.window.to)).toBe(true);
    }
  });

  it("re-materialization is idempotent", async () => {
    const before = await owner
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId);
    await materializeSiteTasks(owner, siteId);
    const after = await owner
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId);
    expect(after.count).toBe(before.count);
  });

  it("approved analyses are frozen by the DB guard", async () => {
    const { error } = await owner
      .from("risk_analyses")
      .update({ wizard_transcript: { tampered: true } as Json })
      .eq("id", raId);
    expect(error).not.toBeNull(); // trigger: approved RA immutable
  });

  it("loosening without justification is blocked at the DB layer", async () => {
    const { data: cp } = await owner
      .from("control_points")
      .select("id")
      .eq("risk_analysis_id", raId)
      .eq("template_key", "cold_storage_temp")
      .limit(1)
      .single();
    const { error } = await owner
      .from("control_points")
      .update({ limit_json: { max: 8, unit: "°C" } as Json, limit_loosened: true })
      .eq("id", cp!.id);
    expect(error).not.toBeNull(); // check constraint: loosening requires justification
  });
});
