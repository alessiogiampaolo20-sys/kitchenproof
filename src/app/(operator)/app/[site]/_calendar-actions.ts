"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { operatingPatternSchema } from "@/lib/compliance/operating-days";
import { materializeSiteTasks } from "@/lib/compliance/materialize-runner";

export type CalendarState = { ok: true } | { error: "error" } | null;

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

const daySchema = z.object({
  siteId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["open", "closed"]),
});

/**
 * §3.5: records that a day was worked or not. Anyone on site may answer — it
 * is the person standing in the kitchen who knows — and the answer is
 * attributed and audited, because "closed, no production" is a statement the
 * authority reads. `confirmed_at` is server-set, so a day declared after the
 * fact is visibly declared late rather than looking like a live entry.
 */
export async function confirmOperatingDay(input: unknown): Promise<CalendarState> {
  const parsed = daySchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc) return { error: "error" };

  const existing = await sc.supabase
    .from("site_operating_days")
    .select("id, status")
    .eq("site_id", sc.site.id)
    .eq("day", parsed.data.day)
    .maybeSingle();

  const row = {
    site_id: sc.site.id,
    day: parsed.data.day,
    status: parsed.data.status,
    confirmed_by: sc.ctx.user.id,
    confirmed_at: new Date().toISOString(),
  };

  const { error } = existing.data
    ? await sc.supabase.from("site_operating_days").update(row).eq("id", existing.data.id)
    : await sc.supabase.from("site_operating_days").insert(row);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: existing.data ? "operating_day.changed" : "operating_day.confirmed",
    entityTable: "site_operating_days",
    entityId: existing.data?.id ?? sc.site.id,
    diff: {
      day: parsed.data.day,
      status: parsed.data.status,
      previous: existing.data?.status ?? null,
    },
  });

  // closing a day withdraws its scheduled work; opening one restores it
  await materializeSiteTasks(sc.supabase, sc.site.id);

  revalidatePath(`/app/${sc.site.id}/today`);
  return { ok: true };
}

const patternSchema = z.object({
  siteId: z.uuid(),
  pattern: operatingPatternSchema.nullable(),
});

/** The site's normal rhythm — managers only, it shapes everyone's schedule. */
export async function setOperatingPattern(input: unknown): Promise<CalendarState> {
  const parsed = patternSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };
  const sc = await siteContext(parsed.data.siteId);
  if (!sc || !MANAGER_ROLES.includes(sc.ctx.role)) return { error: "error" };

  const { error } = await sc.supabase
    .from("sites")
    .update({ operating_pattern: parsed.data.pattern })
    .eq("id", sc.site.id);
  if (error) return { error: "error" };

  await writeAudit(sc.supabase, {
    orgId: sc.site.org_id,
    siteId: sc.site.id,
    actorId: sc.ctx.user.id,
    actorRole: sc.ctx.role,
    action: "site.operating_pattern_set",
    entityTable: "sites",
    entityId: sc.site.id,
    diff: { pattern: parsed.data.pattern },
  });

  await materializeSiteTasks(sc.supabase, sc.site.id);

  revalidatePath(`/app/${sc.site.id}/today`);
  revalidatePath(`/app/${sc.site.id}/setup`);
  return { ok: true };
}
