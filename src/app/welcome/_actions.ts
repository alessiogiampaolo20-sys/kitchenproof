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

  const store = await cookies();
  store.set(ORG_COOKIE, orgId, { path: "/", sameSite: "lax" });
  redirect("/org/sites");
}
