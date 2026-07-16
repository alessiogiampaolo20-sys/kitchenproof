"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActorSession } from "@/lib/actor/session";
import { writeAudit } from "@/lib/audit/log";
import {
  describeValue,
  evaluateCheck,
  suggestSeverity,
  type CheckValue,
} from "@/lib/compliance/checks";
import {
  adHocSchema,
  completeTaskSchema,
  deviationStepsSchema,
} from "@/lib/schemas/checks";
import { notifySiteManagers } from "@/lib/notifications";
import { pickText } from "@/lib/i18n/pick";
import type { Json } from "@/lib/supabase/database.types";

export type CompleteTaskResult =
  | {
      ok: true;
      passed: boolean;
      deviationId?: string;
      correctiveGuidance?: string;
    }
  | { error: "noActor" | "alreadyDone" | "error" };

/**
 * §8.2 check execution. Requires an ACTIVE PIN actor (§4.2) — the completion
 * is attributed to the person, not the device session. Pass/fail is computed
 * server-side; late completions are flagged, never back-dated (§17).
 */
export async function completeTask(input: {
  siteId: string;
  taskId: string;
  value: CheckValue;
  note?: string;
}): Promise<CompleteTaskResult> {
  const parsed = completeTaskSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, status, due_at, due_window_minutes, verifies_deviation_id, control_point:control_points(id, name_i18n, category, limit_json, equipment_id, corrective_guidance_i18n)",
    )
    .eq("id", parsed.data.taskId)
    .eq("site_id", parsed.data.siteId)
    .maybeSingle();
  if (!task || !task.control_point) return { error: "error" };
  if (task.status === "done") return { error: "alreadyDone" };

  let passed: boolean;
  try {
    passed = evaluateCheck(task.control_point.limit_json, parsed.data.value);
  } catch {
    return { error: "error" };
  }

  const now = new Date();
  const isLate =
    now.getTime() >
    new Date(task.due_at).getTime() + task.due_window_minutes * 60_000;

  // failed check → deviation first, so the completion can reference it (§8.3)
  let deviationId: string | undefined;
  if (!passed) {
    const severity = suggestSeverity(task.control_point.limit_json, parsed.data.value);
    const description = `${pickText(task.control_point.name_i18n, "da")}: ${describeValue(parsed.data.value)}`;
    const { data: deviation, error } = await supabase
      .from("deviations")
      .insert({
        site_id: site.id,
        control_point_id: task.control_point.id,
        source: "task",
        detected_by: actor.profileId,
        description,
        severity,
      })
      .select("id, severity")
      .single();
    if (error || !deviation) return { error: "error" };
    deviationId = deviation.id;

    if (severity !== "minor") {
      await notifySiteManagers(supabase, {
        siteId: site.id,
        kind: "deviation_major",
        payload: { deviation_id: deviation.id, severity, description } as Json,
        emailSubject: `KitchenProof: ${severity} afvigelse`,
        emailText: description,
      });
    }
  }

  const { data: completion, error: completionError } = await supabase
    .from("task_completions")
    .insert({
      task_id: task.id,
      site_id: site.id,
      control_point_id: task.control_point.id,
      equipment_id: task.control_point.equipment_id,
      performed_by: actor.profileId,
      value_json: parsed.data.value as unknown as Json,
      passed,
      is_late: isLate,
      note: parsed.data.note ?? null,
      deviation_id: deviationId ?? null,
    })
    .select("id")
    .single();
  if (completionError || !completion) return { error: "error" };

  await supabase.from("tasks").update({ status: "done" }).eq("id", task.id);

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: actor.profileId,
    actorRole: actor.role,
    action: passed ? "task.completed" : "task.completed_failed",
    entityTable: "task_completions",
    entityId: completion.id,
    diff: {
      task_id: task.id,
      passed,
      is_late: isLate,
      value: parsed.data.value as unknown as Json,
    },
  });

  // follow-up verification task closing the §8.3 loop
  if (task.verifies_deviation_id && passed) {
    await supabase
      .from("deviations")
      .update({
        verification_text: `OK: ${describeValue(parsed.data.value)}`,
        verified_by: actor.profileId,
        status: "verified",
      })
      .eq("id", task.verifies_deviation_id)
      .in("status", ["open", "corrected"]);
    await writeAudit(supabase, {
      orgId: site.org_id,
      siteId: site.id,
      actorId: actor.profileId,
      actorRole: actor.role,
      action: "deviation.verified",
      entityTable: "deviations",
      entityId: task.verifies_deviation_id,
    });
  }

  // On failure the deviation sheet must stay mounted on the check page:
  // revalidating here would re-render it (task now done → redirect) and kill
  // the sheet. recordDeviationSteps() revalidates when the flow completes.
  if (passed) {
    revalidatePath(`/app/${site.id}/today`);
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

export type DeviationStepsResult = { ok: true } | { error: "noActor" | "error" };

/** §8.3 steps 1–3: food assessment, corrective action, follow-up verification task. */
export async function recordDeviationSteps(input: {
  siteId: string;
  deviationId: string;
  foodAssessment: string;
  correctiveAction: string;
  followUpHours?: number;
  skipFollowUp?: string;
}): Promise<DeviationStepsResult> {
  const parsed = deviationStepsSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };

  const { data: deviation } = await supabase
    .from("deviations")
    .select("id, status, control_point_id")
    .eq("id", parsed.data.deviationId)
    .eq("site_id", site.id)
    .maybeSingle();
  if (!deviation || deviation.status !== "open") return { error: "error" };

  const { error: updateError } = await supabase
    .from("deviations")
    .update({
      food_assessment: parsed.data.foodAssessment as never,
      corrective_action_text: parsed.data.correctiveAction,
      corrective_action_by: actor.profileId,
      status: "corrected",
    })
    .eq("id", deviation.id);
  if (updateError) return { error: "error" };

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: actor.profileId,
    actorRole: actor.role,
    action: "deviation.corrected",
    entityTable: "deviations",
    entityId: deviation.id,
    diff: {
      food_assessment: parsed.data.foodAssessment,
      corrective_action: parsed.data.correctiveAction,
    },
  });

  // step 3: verify later (only when the deviation is tied to a control point)
  if (!parsed.data.skipFollowUp && deviation.control_point_id) {
    const dueAt = new Date(Date.now() + parsed.data.followUpHours * 3_600_000);
    const { data: followUp } = await supabase
      .from("tasks")
      .insert({
        site_id: site.id,
        control_point_id: deviation.control_point_id,
        due_at: dueAt.toISOString(),
        due_window_minutes: 60,
        verifies_deviation_id: deviation.id,
      })
      .select("id")
      .single();
    if (followUp) {
      await writeAudit(supabase, {
        orgId: site.org_id,
        siteId: site.id,
        actorId: actor.profileId,
        actorRole: actor.role,
        action: "deviation.followup_created",
        entityTable: "tasks",
        entityId: followUp.id,
        diff: { deviation_id: deviation.id, due_at: dueAt.toISOString() },
      });
    }
  }

  revalidatePath(`/app/${site.id}/today`);
  revalidatePath(`/app/${site.id}/deviations`);
  return { ok: true };
}

export type AdHocResult = { ok: true } | { error: "noActor" | "error" };

/** §8.5 ad-hoc records: unscheduled temperature, note, or spotted deviation. */
export async function adHocRecord(input: {
  siteId: string;
  kind: string;
  equipmentId?: string;
  tempC?: number;
  text?: string;
}): Promise<AdHocResult> {
  const parsed = adHocSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };

  if (parsed.data.kind === "deviation") {
    if (!parsed.data.text) return { error: "error" };
    const { data: deviation, error } = await supabase
      .from("deviations")
      .insert({
        site_id: site.id,
        source: "adhoc",
        detected_by: actor.profileId,
        description: parsed.data.text,
        severity: "minor",
      })
      .select("id")
      .single();
    if (error || !deviation) return { error: "error" };
    await writeAudit(supabase, {
      orgId: site.org_id,
      siteId: site.id,
      actorId: actor.profileId,
      actorRole: actor.role,
      action: "deviation.adhoc_created",
      entityTable: "deviations",
      entityId: deviation.id,
      diff: { description: parsed.data.text },
    });
    revalidatePath(`/app/${site.id}/deviations`);
    return { ok: true };
  }

  const value: Json =
    parsed.data.kind === "temp"
      ? ({ temp_c: parsed.data.tempC ?? 0 } as Json)
      : ({ note_text: parsed.data.text ?? "" } as Json);

  // ad-hoc temps evaluate against the equipment's active temperature CP if any
  let passed: boolean | null = null;
  let controlPointId: string | null = null;
  if (parsed.data.kind === "temp" && parsed.data.equipmentId) {
    const { data: cp } = await supabase
      .from("control_points")
      .select("id, limit_json")
      .eq("equipment_id", parsed.data.equipmentId)
      .eq("category", "temperature")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (cp) {
      controlPointId = cp.id;
      try {
        passed = evaluateCheck(cp.limit_json, { temp_c: parsed.data.tempC ?? 0 });
      } catch {
        passed = null;
      }
    }
  }

  const { data: completion, error } = await supabase
    .from("task_completions")
    .insert({
      site_id: site.id,
      control_point_id: controlPointId,
      equipment_id: parsed.data.equipmentId ?? null,
      performed_by: actor.profileId,
      value_json: value,
      passed,
    })
    .select("id")
    .single();
  if (error || !completion) return { error: "error" };

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId: site.id,
    actorId: actor.profileId,
    actorRole: actor.role,
    action: "record.adhoc_created",
    entityTable: "task_completions",
    entityId: completion.id,
    diff: { kind: parsed.data.kind, value },
  });

  revalidatePath(`/app/${site.id}/today`);
  return { ok: true };
}
