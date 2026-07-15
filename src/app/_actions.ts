"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { ORG_COOKIE } from "@/lib/org-context";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(ORG_COOKIE);
  redirect("/login");
}

const activeOrgSchema = z.object({
  orgId: z.uuid(),
  next: z.string().startsWith("/").default("/org/sites"),
});

export async function setActiveOrg(formData: FormData) {
  const parsed = activeOrgSchema.parse({
    orgId: formData.get("orgId"),
    next: formData.get("next") ?? undefined,
  });

  // Only allow switching to an org the user is actually a member of.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", parsed.orgId)
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (!membership) redirect("/");

  const store = await cookies();
  store.set(ORG_COOKIE, parsed.orgId, { path: "/", sameSite: "lax" });
  redirect(parsed.next);
}

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (typeof locale === "string" && isLocale(locale)) {
    const store = await cookies();
    store.set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
}
