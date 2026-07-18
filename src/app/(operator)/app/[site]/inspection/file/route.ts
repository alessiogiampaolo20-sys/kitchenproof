import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";

const ALLOWED_BUCKETS = new Set(["exports", "photos", "documents", "invoices", "imports"]);

/**
 * On-device inspection file access: signs a short-lived URL under the
 * caller's own RLS (site member) — uniform href shape with the magic-link
 * surface, no service role involved.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ site: string }> },
) {
  const { site: siteId } = await params;
  const bucket = request.nextUrl.searchParams.get("bucket") ?? "";
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!ALLOWED_BUCKETS.has(bucket) || !path.startsWith(`${siteId}/`)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return new NextResponse("not found", { status: 404 });
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return new NextResponse("forbidden", { status: 403 });

  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 600);
  if (!signed) return new NextResponse("not found", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
