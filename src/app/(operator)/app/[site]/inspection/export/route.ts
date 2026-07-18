import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { writeAudit } from "@/lib/audit/log";
import {
  buildInspectionBundle,
  renderInspectionPdf,
  type ExportTab,
} from "@/lib/inspection/export";

const TABS = new Set(["programme", "records", "deviations", "trace", "documents", "bundle"]);

/** §10.3: any tab → PDF; "bundle" → full inspection ZIP. Every export audited. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ site: string }> },
) {
  const { site: siteId } = await params;
  const tab = (request.nextUrl.searchParams.get("tab") ?? "programme") as ExportTab;
  if (!TABS.has(tab)) return new NextResponse("bad request", { status: 400 });

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return new NextResponse("not found", { status: 404 });
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return new NextResponse("forbidden", { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const options = {
    fromDate:
      request.nextUrl.searchParams.get("from") ??
      new Date(Date.parse(today) - 89 * 86_400_000).toISOString().slice(0, 10),
    toDate: request.nextUrl.searchParams.get("to") ?? today,
    query: request.nextUrl.searchParams.get("q") ?? undefined,
  };

  const buffer =
    tab === "bundle"
      ? await buildInspectionBundle(supabase, siteId)
      : await renderInspectionPdf(supabase, siteId, tab, options);

  await writeAudit(supabase, {
    orgId: site.org_id,
    siteId,
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "inspection.exported",
    entityTable: "sites",
    entityId: siteId,
    diff: { tab, ...options },
  });

  const filename =
    tab === "bundle" ? `inspektionspakke-${today}.zip` : `${tab}-${today}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": tab === "bundle" ? "application/zip" : "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
