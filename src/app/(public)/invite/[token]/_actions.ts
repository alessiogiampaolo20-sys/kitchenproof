"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org-context";

const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);

export type AcceptState = { error: string } | null;

export async function acceptInvite(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  // accept_invite() RPC binds the invite to the caller atomically and audits.
  const { data: orgId, error } = await supabase.rpc("accept_invite", {
    p_token: parsed.data,
  });
  if (error || !orgId) {
    return {
      error: error?.message.includes("already_member")
        ? "alreadyMember"
        : "invalid",
    };
  }

  const store = await cookies();
  store.set(ORG_COOKIE, orgId, { path: "/", sameSite: "lax" });
  redirect("/");
}
