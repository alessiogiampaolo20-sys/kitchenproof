"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/schemas/auth";

export type SignupFormState = { error: string } | { checkEmail: true } | null;

export async function signup(
  _prev: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
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

  // Confirmation links must land on THIS deployment, not Supabase's Site URL.
  const h = await headers();
  const origin =
    h.get("origin") ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const next = parsed.data.next ?? "/";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: {
        full_name: parsed.data.fullName,
        locale: parsed.data.locale,
      },
    },
  });
  if (error) {
    return { error: "signupFailed" };
  }

  // Email confirmation on: no session yet — tell the user to check their inbox
  // instead of bouncing them to /login unexplained.
  if (!data.session) {
    return { checkEmail: true };
  }

  redirect(next);
}
