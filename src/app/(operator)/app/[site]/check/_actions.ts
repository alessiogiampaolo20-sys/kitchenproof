"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActorSession } from "@/lib/actor/session";
import { writeAudit } from "@/lib/audit/log";
import {
  applyDeviationSteps,
  recordCompletion,
  type AuditFn,
} from "@/lib/compliance/record-completion";
import { evaluateCheck, type CheckValue } from "@/lib/compliance/checks";
import {
  adHocSchema,
  completeTaskSchema,
  deviationStepsSchema,
} from "@/lib/schemas/checks";
import { notifySiteManagers } from "@/lib/notifications";
import type { Json } from "@/lib/supabase/database.types";

export type SyncResult =
  | {
      ok: true;
      passed: boolean;
      deviationId?: string;
      correctiveGuidance?: string;
    }
  | { error: "retry" | "drop" | "noActor" };

function makeAudit(supabase: Awaited<ReturnType<typeof createClient>>): AuditFn {
  return (entry) =>
    writeAudit(supabase, {
      orgId: entry.orgId,
      siteId: entry.siteId,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      entityTable: entry.entityTable,
      entityId: entry.entityId,
      diff: entry.diff,
    });
}

/**
 * §8.2/§16: the single completion entry point — used directly when online and
 * by the outbox flush when draining. Idempotent on clientUuid, so flaky-wifi
 * retries and offline replays can never double-record.
 */
export async function syncCompleteTask(input: {
  siteId: string;
  taskId: string;
  value: CheckValue;
  note?: string;
  clientUuid: string;
  clientCreatedAt: string;
  photoPaths?: string[];
  deviationSteps?: {
    foodAssessment: string;
    correctiveAction: string;
    followUpHours: number;
    skipFollowUp: boolean;
  };
}): Promise<SyncResult> {
  const parsed = completeTaskSchema.safeParse(input);
  if (!parsed.success) return { error: "drop" };
  // storage paths must live under this site's prefix (RLS-aligned)
  if (parsed.data.photoPaths.some((p) => !p.startsWith(`${parsed.data.siteId}/`))) {
    return { error: "drop" };
  }

  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" }; // queued entries wait for a re-PIN

  const supabase = await createClient();
  const result = await recordCompletion(
    supabase,
    {
      siteId: parsed.data.siteId,
      taskId: parsed.data.taskId,
      actor: { profileId: actor.profileId, role: actor.role },
      value: parsed.data.value,
      note: parsed.data.note,
      clientUuid: parsed.data.clientUuid,
      // queued work draining after the fact: nobody is at the screen to ask
      source: parsed.data.clientUuid ? "replay" : "interactive",
      clientCreatedAt: parsed.data.clientCreatedAt,
      photoPaths: parsed.data.photoPaths,
      deviationSteps: parsed.data.deviationSteps,
    },
    makeAudit(supabase),
  );

  if ("error" in result) {
    if (result.error === "alreadyDone") return { ok: true, passed: true };
    if (result.error === "invalid") return { error: "drop" };
    return { error: "retry" };
  }

  if (!result.passed && result.deviationId) {
    const { data: deviation } = await supabase
      .from("deviations")
      .select("severity, description")
      .eq("id", result.deviationId)
      .maybeSingle();
    if (deviation && deviation.severity !== "minor") {
      await notifySiteManagers(supabase, {
        siteId: parsed.data.siteId,
        kind: "deviation_major",
        payload: {
          deviation_id: result.deviationId,
          severity: deviation.severity,
          description: deviation.description,
        } as Json,
        emailSubject: `KitchenProof: ${deviation.severity} afvigelse`,
        emailText: deviation.description,
      });
    }
  }

  // on failure the deviation sheet must stay mounted (see Phase 2 note);
  // recordDeviationSteps / the composite path revalidates afterwards
  if (result.passed || parsed.data.deviationSteps) {
    revalidatePath(`/app/${parsed.data.siteId}/today`);
  }
  return result;
}

export type DeviationStepsResult = { ok: true } | { error: "noActor" | "error" };

/** §8.3 steps recorded from the ONLINE sheet (deviation already exists server-side). */
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

  const result = await applyDeviationSteps(
    supabase,
    {
      siteId: site.id,
      orgId: site.org_id,
      deviationId: deviation.id,
      controlPointId: deviation.control_point_id,
      actor: { profileId: actor.profileId, role: actor.role },
      steps: {
        foodAssessment: parsed.data.foodAssessment,
        correctiveAction: parsed.data.correctiveAction,
        followUpHours: parsed.data.followUpHours,
        skipFollowUp: parsed.data.skipFollowUp,
      },
    },
    makeAudit(supabase),
  );
  if ("error" in result) return { error: "error" };

  revalidatePath(`/app/${site.id}/today`);
  revalidatePath(`/app/${site.id}/deviations`);
  return { ok: true };
}

export type AdHocResult = { ok: true } | { error: "noActor" | "error" };

/** §8.5 ad-hoc records (online path). */
export async function adHocRecord(input: {
  siteId: string;
  kind: string;
  equipmentId?: string;
  tempC?: number;
  text?: string;
}): Promise<AdHocResult> {
  const result = await adHocCore({ ...input, clientUuid: undefined });
  if ("ok" in result) return { ok: true };
  return { error: result.error === "noActor" ? "noActor" : "error" };
}

/** Outbox variant: idempotent on clientUuid (temp/note only). */
export async function syncAdHocRecord(input: {
  siteId: string;
  kind: string;
  equipmentId?: string;
  tempC?: number;
  text?: string;
  clientUuid: string;
  clientCreatedAt: string;
}): Promise<SyncResult> {
  const result = await adHocCore(input);
  if ("ok" in result) return { ok: true, passed: true };
  if (result.error === "invalid") return { error: "drop" };
  if (result.error === "noActor") return { error: "noActor" };
  return { error: "retry" };
}

async function adHocCore(input: {
  siteId: string;
  kind: string;
  equipmentId?: string;
  tempC?: number;
  text?: string;
  clientUuid?: string;
  clientCreatedAt?: string;
}): Promise<{ ok: true } | { error: "noActor" | "invalid" | "error" }> {
  const parsed = adHocSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };

  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "invalid" };
  const audit = makeAudit(supabase);

  if (parsed.data.clientUuid) {
    const { data: existing } = await supabase
      .from("task_completions")
      .select("id")
      .eq("client_uuid", parsed.data.clientUuid)
      .maybeSingle();
    if (existing) return { ok: true };
  }

  if (parsed.data.kind === "deviation") {
    if (!parsed.data.text) return { error: "invalid" };
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
    await audit({
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
      client_created_at: parsed.data.clientCreatedAt ?? null,
      ...(parsed.data.clientUuid ? { client_uuid: parsed.data.clientUuid } : {}),
    })
    .select("id")
    .single();
  if (error || !completion) return { error: "error" };

  await audit({
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
