"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSiteSchema } from "@/lib/schemas/tenancy";
import { getOrgContext } from "@/lib/tenancy";
import { writeAudit } from "@/lib/audit/log";

export type SiteFormState = { error: string } | { ok: true } | null;

export async function createSite(
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  const parsed = createSiteSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    activityType: formData.get("activityType"),
    address: formData.get("address") ?? "",
    city: formData.get("city") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    cvrPNumber: formData.get("cvrPNumber") ?? "",
  });
  if (!parsed.success) {
    return { error: "error" };
  }

  const supabase = await createClient();
  const ctx = await getOrgContext(supabase, parsed.data.orgId);
  if (!ctx) return { error: "error" };

  // RLS enforces org_owner (§4.2); this insert runs under the user's token.
  const { data: site, error } = await supabase
    .from("sites")
    .insert({
      org_id: parsed.data.orgId,
      name: parsed.data.name,
      activity_type: parsed.data.activityType,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      postal_code: parsed.data.postalCode || null,
      cvr_p_number: parsed.data.cvrPNumber || null,
    })
    .select("id, name")
    .single();
  if (error || !site) {
    return { error: "error" };
  }

  await writeAudit(supabase, {
    orgId: parsed.data.orgId,
    siteId: site.id,
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "site.created",
    entityTable: "sites",
    entityId: site.id,
    diff: { name: site.name, activity_type: parsed.data.activityType },
  });

  revalidatePath("/org/sites");
  return { ok: true };
}
