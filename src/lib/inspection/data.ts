// §10.2 inspector tabs — shared data layer. Works with BOTH the authenticated
// client (on-device mode, RLS applies) and the token-scoped service client
// (/inspect/[token]); every query filters by site_id explicitly, so the
// service path never reads beyond the resolved site.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/* ── 1. Egenkontrolprogram ─────────────────────────────────────────────────── */

export async function getProgrammeData(supabase: Client, siteId: string) {
  const [{ data: site }, { data: analyses }, { data: cps }, { data: documents }] =
    await Promise.all([
      supabase
        .from("sites")
        .select("name, address, city, postal_code, cvr_p_number, pack_version_pinned")
        .eq("id", siteId)
        .single(),
      supabase
        .from("risk_analyses")
        .select(
          "id, version, status, approved_at, wizard_transcript, approver:profiles!risk_analyses_approved_by_fkey(full_name)",
        )
        .eq("site_id", siteId)
        .order("version", { ascending: false }),
      supabase
        .from("control_points")
        .select(
          "id, name_i18n, category, limit_json, frequency_json, monitoring_method, source_ref, active, limit_loosened, limit_justification, equipment:equipment(name)",
        )
        .eq("site_id", siteId)
        .eq("active", true)
        .order("category"),
      supabase
        .from("programme_documents")
        .select("id, kind, pdf_path, created_at, risk_analysis_id")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false }),
    ]);

  const approved = (analyses ?? []).find((ra) => ra.status === "approved") ?? null;
  return {
    site,
    approved,
    history: analyses ?? [],
    controlPoints: cps ?? [],
    documents: documents ?? [],
  };
}

/* ── 2. Registreringer: records + calendar heat-map ────────────────────────── */

export type DayCell = {
  date: string; // ISO date
  done: number;
  missed: number;
  deviations: number;
};

/** Pure aggregation for the calendar heat-map (unit-tested). */
export function aggregateDays(args: {
  fromDate: string; // ISO date inclusive
  toDate: string;   // ISO date inclusive
  completions: { created_at: string }[];
  missedTasks: { due_at: string }[];
  deviations: { detected_at: string }[];
}): DayCell[] {
  const cells = new Map<string, DayCell>();
  const cursor = new Date(`${args.fromDate}T00:00:00Z`);
  const end = new Date(`${args.toDate}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    cells.set(date, { date, done: 0, missed: 0, deviations: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const bump = (iso: string, key: "done" | "missed" | "deviations") => {
    const cell = cells.get(iso.slice(0, 10));
    if (cell) cell[key]++;
  };
  for (const completion of args.completions) bump(completion.created_at, "done");
  for (const task of args.missedTasks) bump(task.due_at, "missed");
  for (const deviation of args.deviations) bump(deviation.detected_at, "deviations");
  return [...cells.values()];
}

export async function getRecordsData(
  supabase: Client,
  siteId: string,
  range: { fromDate: string; toDate: string; category?: string },
) {
  const fromIso = `${range.fromDate}T00:00:00Z`;
  const toIso = `${range.toDate}T23:59:59Z`;

  let completionsQuery = supabase
    .from("task_completions")
    .select(
      "id, value_json, passed, is_late, photo_paths, note, created_at, client_created_at, performer:profiles!task_completions_performed_by_fkey(full_name), control_point:control_points(name_i18n, category), equipment:equipment(name)",
    )
    .eq("site_id", siteId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (range.category) {
    completionsQuery = completionsQuery.eq("control_point.category", range.category);
  }

  const [{ data: completions }, { data: missedTasks }, { data: deviations }] =
    await Promise.all([
      completionsQuery,
      supabase
        .from("tasks")
        .select("id, due_at, control_point:control_points(name_i18n, category)")
        .eq("site_id", siteId)
        .eq("status", "missed")
        .gte("due_at", fromIso)
        .lte("due_at", toIso),
      supabase
        .from("deviations")
        .select("id, detected_at")
        .eq("site_id", siteId)
        .gte("detected_at", fromIso)
        .lte("detected_at", toIso),
    ]);

  const filteredCompletions = (completions ?? []).filter(
    (completion) => !range.category || completion.control_point?.category === range.category,
  );

  return {
    completions: filteredCompletions,
    heatmap: aggregateDays({
      fromDate: range.fromDate,
      toDate: range.toDate,
      completions: filteredCompletions,
      missedTasks: missedTasks ?? [],
      deviations: deviations ?? [],
    }),
  };
}

/* ── 3. Afvigelser + repeat analysis ───────────────────────────────────────── */

export async function getDeviationsData(supabase: Client, siteId: string) {
  const { data: deviations } = await supabase
    .from("deviations")
    .select(
      "id, detected_at, description, severity, status, food_assessment, corrective_action_text, corrective_action_at, verification_text, verified_at, control_point_id, control_point:control_points(name_i18n), detector:profiles!deviations_detected_by_fkey(full_name)",
    )
    .eq("site_id", siteId)
    .order("detected_at", { ascending: false })
    .limit(300);

  // §10.2: repeat-deviation analysis per control point (R9 transparency)
  const repeatCounts = new Map<string, number>();
  for (const deviation of deviations ?? []) {
    if (!deviation.control_point_id) continue;
    repeatCounts.set(
      deviation.control_point_id,
      (repeatCounts.get(deviation.control_point_id) ?? 0) + 1,
    );
  }

  return { deviations: deviations ?? [], repeatCounts };
}

/* ── 5. Dokumenter ─────────────────────────────────────────────────────────── */

export async function getDocumentsData(supabase: Client, siteId: string) {
  const { data: documents } = await supabase
    .from("site_documents")
    .select("id, kind, title, file_path, valid_until, created_at, uploader:profiles!site_documents_uploaded_by_fkey(full_name)")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  return { documents: documents ?? [] };
}

/* ── §17 integrity footer ──────────────────────────────────────────────────── */

export async function getIntegrityFooter(supabase: Client, siteId: string) {
  const { data: last } = await supabase
    .from("audit_log")
    .select("after_hash, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId);
  return {
    latestHash: last?.after_hash ?? null,
    entries: count ?? 0,
    at: last?.created_at ?? null,
  };
}
