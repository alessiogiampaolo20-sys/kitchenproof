import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const ALLOWED_BUCKETS = new Set(["exports", "photos", "documents", "invoices", "imports"]);

/**
 * Magic-link file access (§10.2): token re-validated, path locked to the
 * resolved site, access audited — then the file is streamed. The service
 * client is used only after the token check (CLAUDE.md decision log).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const bucket = request.nextUrl.searchParams.get("bucket") ?? "";
  const path = request.nextUrl.searchParams.get("path") ?? "";

  const anon = await createClient();
  const { data: resolved } = await anon.rpc("resolve_inspector_link", { p_token: token });
  const link = resolved?.[0];
  if (!link) return new NextResponse("forbidden", { status: 403 });
  if (!ALLOWED_BUCKETS.has(bucket) || !path.startsWith(`${link.site_id}/`)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const service = createServiceClient();
  const { data: file, error } = await service.storage.from(bucket).download(path);
  if (error || !file) return new NextResponse("not found", { status: 404 });

  const { data: site } = await service
    .from("sites")
    .select("org_id")
    .eq("id", link.site_id)
    .single();
  const { data: linkRow } = await service
    .from("inspector_links")
    .select("id, created_by")
    .eq("site_id", link.site_id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (site && linkRow) {
    await service.from("audit_log").insert({
      org_id: site.org_id,
      site_id: link.site_id,
      actor_id: linkRow.created_by,
      actor_role: "inspector_guest",
      action: "inspection.file_viewed",
      entity_table: "storage.objects",
      diff: { bucket, path },
    });
  }

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${path.split("/").pop()}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
