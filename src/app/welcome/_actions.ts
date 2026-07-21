"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrgSchema } from "@/lib/schemas/tenancy";
import { ORG_COOKIE } from "@/lib/org-context";

export type FormState = { error: string } | null;

export async function createOrganization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createOrgSchema.safeParse({
    name: formData.get("name"),
    locale: formData.get("locale") ?? undefined,
    cvr: formData.get("cvr") ?? "",
    billingEmail: formData.get("billingEmail") ?? "",
  });
  if (!parsed.success) {
    return { error: "error" };
  }

  const supabase = await createClient();
  // Atomic org + owner membership + audit row (security definer RPC).
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_default_locale: parsed.data.locale,
  });
  if (error || !orgId) {
    return { error: "error" };
  }

  // Legal-entity details (CVR = Danish VAT number) — owner update under RLS.
  if (parsed.data.cvr || parsed.data.billingEmail) {
    await supabase
      .from("organizations")
      .update({
        vat_number: parsed.data.cvr || null,
        billing_email: parsed.data.billingEmail || null,
      })
      .eq("id", orgId);
  }

  const store = await cookies();
  store.set(ORG_COOKIE, orgId, { path: "/", sameSite: "lax" });
  redirect("/org/sites");
}
