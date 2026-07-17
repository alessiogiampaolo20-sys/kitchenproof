"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext } from "@/lib/tenancy";
import { getActorSession } from "@/lib/actor/session";

async function siteContext(siteId: string) {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return null;
  return { supabase, site, ctx };
}

const startSchema = z.object({
  siteId: z.uuid(),
  serviceLabel: z.string().trim().min(1).max(40),
});

export type StartSessionState =
  | { ok: true; sessionId: string }
  | { error: "error" | "noActor" }
  | null;

export async function startLeftoverSession(input: unknown): Promise<StartSessionState> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const { data: session, error } = await sc.supabase
    .from("leftover_sessions")
    .insert({
      site_id: sc.site.id,
      service_label: parsed.data.serviceLabel,
      started_by: actor.profileId,
    })
    .select("id")
    .single();
  if (error || !session) return { error: "error" };
  return { ok: true, sessionId: session.id };
}

const decisionSchema = z.object({
  siteId: z.uuid(),
  sessionId: z.uuid(),
  batchId: z.uuid(),
  decision: z.enum(["used_up", "kept", "discarded"]),
  newRemaining: z.number().min(0).nullable(), // for kept with adjusted quantity
  reason: z.enum(["expired", "dropped", "overproduction", "deviation", "other"]).nullable(),
});

export type DecisionState = { ok: true } | { error: "error" | "noActor" } | null;

/** §9.5 one card decision → append-only moves + batch update. */
export async function recordLeftoverDecision(input: unknown): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  if (parsed.data.decision === "discarded" && !parsed.data.reason) {
    return { error: "error" }; // waste always carries a reason (§9.5)
  }
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const { data: batch } = await sc.supabase
    .from("batches")
    .select("id, remaining")
    .eq("id", parsed.data.batchId)
    .eq("site_id", sc.site.id)
    .eq("status", "active")
    .maybeSingle();
  if (!batch) return { error: "error" };
  const remaining = Number(batch.remaining);

  if (parsed.data.decision === "used_up") {
    if (remaining > 0) {
      await sc.supabase.from("inventory_moves").insert({
        site_id: sc.site.id,
        batch_id: batch.id,
        kind: "use",
        quantity: remaining,
        moved_by: actor.profileId,
        leftover_session_id: parsed.data.sessionId,
      });
    }
    await sc.supabase
      .from("batches")
      .update({ remaining: 0, status: "finished" })
      .eq("id", batch.id);
    return { ok: true };
  }

  if (parsed.data.decision === "discarded") {
    if (remaining > 0) {
      await sc.supabase.from("inventory_moves").insert({
        site_id: sc.site.id,
        batch_id: batch.id,
        kind: "waste",
        quantity: remaining,
        reason: parsed.data.reason,
        moved_by: actor.profileId,
        leftover_session_id: parsed.data.sessionId,
      });
    }
    await sc.supabase
      .from("batches")
      .update({ remaining: 0, status: "discarded" })
      .eq("id", batch.id);
    return { ok: true };
  }

  // kept — optionally with an adjusted (lower) remaining quantity
  const target = parsed.data.newRemaining;
  if (target !== null && target < remaining) {
    const used = remaining - target;
    await sc.supabase.from("inventory_moves").insert({
      site_id: sc.site.id,
      batch_id: batch.id,
      kind: "use",
      quantity: used,
      moved_by: actor.profileId,
      leftover_session_id: parsed.data.sessionId,
    });
    await sc.supabase
      .from("batches")
      .update({ remaining: target, status: target === 0 ? "finished" : "active" })
      .eq("id", batch.id);
  }
  return { ok: true };
}

const completeSchema = z.object({
  siteId: z.uuid(),
  sessionId: z.uuid(),
  itemsCount: z.number().int().min(0),
  discardedCount: z.number().int().min(0),
});

export async function completeLeftoverSession(input: unknown): Promise<DecisionState> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };
  const actor = await getActorSession(parsed.data.siteId);
  if (!actor) return { error: "noActor" };

  const { error } = await sc.supabase
    .from("leftover_sessions")
    .update({
      completed_at: new Date().toISOString(),
      items_count: parsed.data.itemsCount,
      discarded_count: parsed.data.discardedCount,
    })
    .eq("id", parsed.data.sessionId)
    .eq("site_id", sc.site.id);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: actor.profileId,
    actorRole: actor.role,
    action: "leftover_session.completed",
    entityTable: "leftover_sessions",
    entityId: parsed.data.sessionId,
    diff: { items: parsed.data.itemsCount, discarded: parsed.data.discardedCount },
  });

  revalidatePath(`/app/${sc.site.id}/leftovers`);
  revalidatePath(`/app/${sc.site.id}/stock`);
  return { ok: true };
}
