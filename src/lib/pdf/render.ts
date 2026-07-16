// Server-side programme snapshot rendering (§7.4/§7.6): on approval the full
// programme is rendered in the OFFICIAL layouts (da + en) and stored — this is
// the document shown to inspectors (R2).
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pickText } from "@/lib/i18n/pick";
import { formatLimit } from "@/lib/compliance/limits";
import { frequencySchema } from "@/lib/compliance/pack-schema";
import { RisikoanalysePdf, type RaPdfData, type RaPdfRow } from "./risikoanalyse";
import { EgenkontrolPdf, type EkPdfData } from "./egenkontrol";
import type { SkemaLocale } from "./officials";

type Client = SupabaseClient<Database>;

const SECTION_ORDER = [
  "modtagelse",
  "opbevaring",
  "tilberedning",
  "salg_servering",
  "transport",
  "andet",
];

function describeFrequency(raw: unknown, locale: SkemaLocale): string {
  const parsed = frequencySchema.safeParse(raw);
  if (!parsed.success) return "";
  if ("perEvent" in parsed.data) {
    return locale === "da" ? "Hver gang" : "Every time";
  }
  const daily = parsed.data.rrule.includes("DAILY");
  const times = parsed.data.times.join(", ");
  if (daily) return locale === "da" ? `Dagligt kl. ${times}` : `Daily at ${times}`;
  return `${parsed.data.rrule} ${times}`;
}

export async function buildProgrammePdfData(
  supabase: Client,
  siteId: string,
  riskAnalysisId: string,
  locale: SkemaLocale,
): Promise<{ ra: RaPdfData; ek: EkPdfData }> {
  const [{ data: site }, { data: ra }, { data: steps }, { data: rows }, { data: cps }] =
    await Promise.all([
      supabase
        .from("sites")
        .select("name, address, city, postal_code, cvr_p_number")
        .eq("id", siteId)
        .single(),
      supabase
        .from("risk_analyses")
        .select("version, approved_at, approver:profiles!risk_analyses_approved_by_fkey(full_name)")
        .eq("id", riskAnalysisId)
        .single(),
      supabase
        .from("process_steps")
        .select("id, key, position")
        .eq("risk_analysis_id", riskAnalysisId)
        .order("position"),
      supabase
        .from("ra_activity_rows")
        .select(
          "process_step_id, position, activity_key, applies, is_critical, what_you_do_i18n, what_can_go_wrong_i18n, control_measures_i18n, if_it_goes_wrong_i18n",
        )
        .eq("risk_analysis_id", riskAnalysisId)
        .order("position"),
      supabase
        .from("control_points")
        .select(
          "name_i18n, category, limit_json, frequency_json, monitoring_method, instructions_i18n, corrective_guidance_i18n, source_ref, active, equipment:equipment(name)",
        )
        .eq("risk_analysis_id", riskAnalysisId)
        .eq("active", true),
    ]);
  if (!site || !ra) throw new Error("programme data not found");

  const address = [site.address, site.postal_code, site.city].filter(Boolean).join(", ");
  const stepByKey = new Map((steps ?? []).map((step) => [step.id, step.key]));
  const approverRaw = ra.approver as { full_name: string } | { full_name: string }[] | null;
  const approverName = Array.isArray(approverRaw)
    ? (approverRaw[0]?.full_name ?? "")
    : (approverRaw?.full_name ?? "");

  const sections = SECTION_ORDER.map((key) => ({
    key,
    rows: (rows ?? [])
      .filter((row) => stepByKey.get(row.process_step_id) === key && row.applies)
      .map(
        (row): RaPdfRow => ({
          name: row.activity_key,
          applies: row.applies,
          critical: row.is_critical,
          whatYouDo: pickText(row.what_you_do_i18n, locale),
          whatCanGoWrong: pickText(row.what_can_go_wrong_i18n, locale),
          controlMeasures: pickText(row.control_measures_i18n, locale),
          ifItGoesWrong: pickText(row.if_it_goes_wrong_i18n, locale),
        }),
      ),
  })).filter((section) => section.rows.length > 0);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const raData: RaPdfData = {
    locale,
    site: {
      name: site.name,
      address,
      cvr: site.cvr_p_number ?? "",
      owner: approverName,
      registeredDate: "",
      description: "",
    },
    version: ra.version,
    generatedAt,
    sections,
  };

  const ekData: EkPdfData = {
    locale,
    site: {
      name: site.name,
      address,
      cvr: site.cvr_p_number ?? "",
      description: "",
    },
    version: ra.version,
    approvedBy: approverName,
    approvedAt: ra.approved_at?.slice(0, 10) ?? generatedAt,
    generatedAt,
    activities: (cps ?? []).map((cp) => ({
      name:
        pickText(cp.name_i18n, locale) + (cp.equipment ? ` — ${cp.equipment.name}` : ""),
      checked: true,
      docFrequency: describeFrequency(cp.frequency_json, locale),
    })),
    controlPoints: (cps ?? []).map((cp) => {
      const source = cp.source_ref as
        | { docId?: string; section?: string; page?: number }
        | null;
      return {
        name: pickText(cp.name_i18n, locale),
        area: cp.equipment?.name ?? "",
        limit: formatLimit(cp.limit_json),
        frequency: describeFrequency(cp.frequency_json, locale),
        monitoring: cp.monitoring_method,
        instructions: pickText(cp.instructions_i18n, locale),
        corrective: pickText(cp.corrective_guidance_i18n, locale),
        source: source?.docId ? `${source.docId} §${source.section}, s. ${source.page}` : "",
      };
    }),
  };

  return { ra: raData, ek: ekData };
}

export async function renderRisikoanalyse(data: RaPdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(RisikoanalysePdf, { data }) as React.ReactElement<DocumentProps>,
  );
}

export async function renderEgenkontrol(data: EkPdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(EgenkontrolPdf, { data }) as React.ReactElement<DocumentProps>,
  );
}

/** Renders and stores the approval snapshot (da + en, §7.4). */
export async function uploadProgrammeSnapshot(
  supabase: Client,
  siteId: string,
  riskAnalysisId: string,
): Promise<{ egenkontrolPath: string; raPaths: string[] }> {
  const raPaths: string[] = [];
  let egenkontrolPath = "";

  for (const locale of ["da", "en"] as const) {
    const { ra, ek } = await buildProgrammePdfData(supabase, siteId, riskAnalysisId, locale);

    const raBuffer = await renderRisikoanalyse(ra);
    const raPath = `${siteId}/programme/${riskAnalysisId}-risikoanalyse-${locale}.pdf`;
    const { error: raError } = await supabase.storage
      .from("exports")
      .upload(raPath, raBuffer, { contentType: "application/pdf", upsert: true });
    if (raError) throw new Error(`risikoanalyse upload: ${raError.message}`);
    raPaths.push(raPath);

    const ekBuffer = await renderEgenkontrol(ek);
    const ekPath = `${siteId}/programme/${riskAnalysisId}-egenkontrol-${locale}.pdf`;
    const { error: ekError } = await supabase.storage
      .from("exports")
      .upload(ekPath, ekBuffer, { contentType: "application/pdf", upsert: true });
    if (ekError) throw new Error(`egenkontrol upload: ${ekError.message}`);
    if (locale === "da") egenkontrolPath = ekPath;
  }

  return { egenkontrolPath, raPaths };
}
