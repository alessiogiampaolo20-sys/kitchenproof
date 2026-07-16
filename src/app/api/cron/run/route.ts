import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runCron } from "@/lib/cron/run";

/**
 * Scheduled entrypoint (§8.4): nightly/15-min materialization, missed marking
 * and reminders. Secured by CRON_SECRET (Vercel Cron header / manual curl).
 * Service role here is legitimate: a scheduled job, not a user request (§17).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const report = await runCron(admin);
  return NextResponse.json(report);
}

export const GET = handle;   // Vercel Cron
export const POST = handle;  // manual/CI trigger
