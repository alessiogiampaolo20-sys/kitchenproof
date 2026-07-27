import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runCron } from "@/lib/cron/run";

/**
 * Scheduled entrypoint (§8.4): nightly/15-min materialization, missed marking
 * and reminders. Secured by CRON_SECRET (Vercel Cron header / manual curl).
 * Service role here is legitimate: a scheduled job, not a user request (§17).
 *
 * A run that could not do its job answers 500, so Vercel Cron records a failed
 * invocation instead of a green one. Reporting `{"sitesMaterialized":0}` with
 * HTTP 200 is what let production sit dead for five days (docs/audit.md §3).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let report;
  try {
    report = await runCron(createServiceClient());
  } catch (err) {
    // misconfigured environment or an unreachable database
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] run failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (report.errors.length > 0) {
    console.error("[cron] completed with errors:", report.errors.join(" | "));
    return NextResponse.json(report, { status: 500 });
  }
  return NextResponse.json(report);
}

export const GET = handle;   // Vercel Cron
export const POST = handle;  // manual/CI trigger
