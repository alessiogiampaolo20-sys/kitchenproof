"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/schemas/auth";
import type { AuthFormState } from "../login/_actions";

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getLocale();
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    locale,
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    return { error: "signupFailed" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        locale: parsed.data.locale,
      },
    },
  });
  if (error) {
    return { error: "signupFailed" };
  }

  redirect(parsed.data.next ?? "/");
}
