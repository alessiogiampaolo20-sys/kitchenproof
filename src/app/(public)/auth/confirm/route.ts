// Email-confirmation landing: Supabase's confirmation mail can carry either a
// PKCE `code` or a `token_hash`+`type` pair depending on template/flow. Both
// are handled here, then the user continues into the app with a session.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next") ?? "/";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const dest = url.clone();
  dest.search = "";
  if (ok) {
    dest.pathname = next.startsWith("/") ? next : "/";
  } else {
    dest.pathname = "/login";
    dest.searchParams.set("confirm", "failed");
  }
  return NextResponse.redirect(dest);
}
