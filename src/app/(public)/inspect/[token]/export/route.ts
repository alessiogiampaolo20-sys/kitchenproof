import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildInspectionBundle,
  renderInspectionPdf,
  type ExportTab,
} from "@/lib/inspection/export";

const TABS = new Set(["programme", "records", "deviations", "trace", "documents", "bundle"]);

/** §10.3 exports over the magic link — token-gated, site-scoped, audited. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tab = (request.nextUrl.searchParams.get("tab") ?? "programme") as ExportTab;
  if (!TABS.has(tab)) return new NextResponse("bad request", { status: 400 });

  const anon = await createClient();
  const { data: resolved } = await anon.rpc("resolve_inspector_link", { p_token: token });
  const link = resolved?.[0];
  if (!link) return new NextResponse("forbidden", { status: 403 });

  const service = createServiceClient();
  const siteId = link.site_id;
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
      ? await buildInspectionBundle(service, siteId)
      : await renderInspectionPdf(service, siteId, tab, options);

  const [{ data: site }, { data: linkRow }] = await Promise.all([
    service.from("sites").select("org_id").eq("id", siteId).single(),
    service
      .from("inspector_links")
      .select("id, created_by")
      .eq("site_id", siteId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (site && linkRow) {
    await service.from("audit_log").insert({
      org_id: site.org_id,
      site_id: siteId,
      actor_id: linkRow.created_by,
      actor_role: "inspector_guest",
      action: "inspection.exported",
      entity_table: "inspector_links",
      entity_id: linkRow.id,
      diff: { tab, ...options },
    });
  }

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
