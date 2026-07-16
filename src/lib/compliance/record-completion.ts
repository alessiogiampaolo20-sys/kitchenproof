// Server/script-side completion recorder — the single write path for scheduled
// checks, shared by the online action and the offline outbox sync (§16).
// Idempotent on client_uuid; late flags derive from when the check was
// actually performed (client clock), never back-dated (§17).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { pickText } from "@/lib/i18n/pick";
import {
  describeValue,
  evaluateCheck,
  suggestSeverity,
  type CheckValue,
} from "./checks";

type Client = SupabaseClient<Database>;

export type CompletionActor = { profileId: string; role: string };

export type AuditFn = (entry: {
  orgId: string;
  siteId: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityTable: string;
  entityId?: string;
  diff?: Json;
}) => Promise<void>;

export type DeviationSteps = {
  foodAssessment: string;
  correctiveAction: string;
  followUpHours: number;
  skipFollowUp: boolean;
};

export type RecordCompletionArgs = {
  siteId: string;
  taskId: string;
  actor: CompletionActor;
  value: CheckValue;
  note?: string;
  clientUuid?: string;
  clientCreatedAt?: string;
  photoPaths?: string[];
  deviationSteps?: DeviationSteps;
};

export type RecordCompletionResult =
  | { ok: true; passed: boolean; deviationId?: string; correctiveGuidance?: string }
  | { error: "alreadyDone" | "invalid" | "error" };

export async function recordCompletion(
  supabase: Client,
  args: RecordCompletionArgs,
  audit: AuditFn,
): Promise<RecordCompletionResult> {
  // idempotency: a queued entry may be retried after a partial success
  if (args.clientUuid) {
    const { data: existing } = await supabase
      .from("task_completions")
      .select("id, passed, deviation_id")
      .eq("client_uuid", args.clientUuid)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        passed: existing.passed ?? true,
        deviationId: existing.deviation_id ?? undefined,
      };
    }
  }

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", args.siteId)
    .maybeSingle();
  if (!site) return { error: "invalid" };

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, status, due_at, due_window_minutes, verifies_deviation_id, control_point:control_points(id, name_i18n, category, limit_json, equipment_id, corrective_guidance_i18n)",
    )
    .eq("id", args.taskId)
    .eq("site_id", args.siteId)
    .maybeSingle();
  if (!task || !task.control_point) return { error: "invalid" };
  if (task.status === "done") return { error: "alreadyDone" };

  let passed: boolean;
  try {
    passed = evaluateCheck(task.control_point.limit_json, args.value);
  } catch {
    return { error: "invalid" };
  }

  const now = new Date();
  // when the check was actually performed: the (untrusted but recorded) device
  // clock, clamped so a future-drifting clock can never make a record earlier
  const performedAt = args.clientCreatedAt
    ? new Date(Math.min(new Date(args.clientCreatedAt).getTime(), now.getTime()))
    : now;
  const isLate =
    performedAt.getTime() >
    new Date(task.due_at).getTime() + task.due_window_minutes * 60_000;

  let deviationId: string | undefined;
  let severity: "minor" | "major" | "critical" | undefined;
  if (!passed) {
    severity = suggestSeverity(task.control_point.limit_json, args.value);
    const description = `${pickText(task.control_point.name_i18n, "da")}: ${describeValue(args.value)}`;
    const { data: deviation, error } = await supabase
      .from("deviations")
      .insert({
        site_id: site.id,
        control_point_id: task.control_point.id,
        source: "task",
        detected_by: args.actor.profileId,
        description,
        severity,
        photo_paths: args.photoPaths ?? [],
      })
      .select("id")
      .single();
    if (error || !deviation) return { error: "error" };
    deviationId = deviation.id;
  }

  const { data: completion, error: completionError } = await supabase
    .from("task_completions")
    .insert({
      task_id: task.id,
      site_id: site.id,
      control_point_id: task.control_point.id,
      equipment_id: task.control_point.equipment_id,
      performed_by: args.actor.profileId,
      value_json: args.value as unknown as Json,
      passed,
      is_late: isLate,
      note: args.note ?? null,
      deviation_id: deviationId ?? null,
      photo_paths: args.photoPaths ?? [],
      client_created_at: args.clientCreatedAt ?? null,
      ...(args.clientUuid ? { client_uuid: args.clientUuid } : {}),
    })
    .select("id")
    .single();
  if (completionError || !completion) return { error: "error" };

  await supabase.from("tasks").update({ status: "done" }).eq("id", task.id);

  await audit({
    orgId: site.org_id,
    siteId: site.id,
    actorId: args.actor.profileId,
    actorRole: args.actor.role,
    action: passed ? "task.completed" : "task.completed_failed",
    entityTable: "task_completions",
    entityId: completion.id,
    diff: {
      task_id: task.id,
      passed,
      is_late: isLate,
      offline_sync: !!args.clientUuid,
      value: args.value as unknown as Json,
    },
  });

  // follow-up verification closes the §8.3 loop
  if (task.verifies_deviation_id && passed) {
    await supabase
      .from("deviations")
      .update({
        verification_text: `OK: ${describeValue(args.value)}`,
        verified_by: args.actor.profileId,
        status: "verified",
      })
      .eq("id", task.verifies_deviation_id)
      .in("status", ["open", "corrected"]);
    await audit({
      orgId: site.org_id,
      siteId: site.id,
      actorId: args.actor.profileId,
      actorRole: args.actor.role,
      action: "deviation.verified",
      entityTable: "deviations",
      entityId: task.verifies_deviation_id,
    });
  }

  // composite offline entry: the 3-step corrective flow queued with the check
  if (deviationId && args.deviationSteps) {
    await applyDeviationSteps(supabase, {
      siteId: site.id,
      orgId: site.org_id,
      deviationId,
      controlPointId: task.control_point.id,
      actor: args.actor,
      steps: args.deviationSteps,
    }, audit);
  }

  return {
    ok: true,
    passed,
    deviationId,
    correctiveGuidance: deviationId
      ? pickText(task.control_point.corrective_guidance_i18n, "da")
      : undefined,
  };
}

export async function applyDeviationSteps(
  supabase: Client,
  args: {
    siteId: string;
    orgId: string;
    deviationId: string;
    controlPointId: string | null;
    actor: CompletionActor;
    steps: DeviationSteps;
  },
  audit: AuditFn,
): Promise<{ ok: true } | { error: "error" }> {
  const { error } = await supabase
    .from("deviations")
    .update({
      food_assessment: args.steps.foodAssessment as never,
      corrective_action_text: args.steps.correctiveAction,
      corrective_action_by: args.actor.profileId,
      status: "corrected",
    })
    .eq("id", args.deviationId)
    .eq("status", "open");
  if (error) return { error: "error" };

  await audit({
    orgId: args.orgId,
    siteId: args.siteId,
    actorId: args.actor.profileId,
    actorRole: args.actor.role,
    action: "deviation.corrected",
    entityTable: "deviations",
    entityId: args.deviationId,
    diff: {
      food_assessment: args.steps.foodAssessment,
      corrective_action: args.steps.correctiveAction,
    },
  });

  if (!args.steps.skipFollowUp && args.controlPointId) {
    const dueAt = new Date(Date.now() + args.steps.followUpHours * 3_600_000);
    const { data: followUp } = await supabase
      .from("tasks")
      .insert({
        site_id: args.siteId,
        control_point_id: args.controlPointId,
        due_at: dueAt.toISOString(),
        due_window_minutes: 60,
        verifies_deviation_id: args.deviationId,
      })
      .select("id")
      .single();
    if (followUp) {
      await audit({
        orgId: args.orgId,
        siteId: args.siteId,
        actorId: args.actor.profileId,
        actorRole: args.actor.role,
        action: "deviation.followup_created",
        entityTable: "tasks",
        entityId: followUp.id,
        diff: { deviation_id: args.deviationId, due_at: dueAt.toISOString() },
      });
    }
  }
  return { ok: true };
}
