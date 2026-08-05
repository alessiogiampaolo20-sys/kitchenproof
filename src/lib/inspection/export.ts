// §10.3 exports: per-tab PDF + the full inspection bundle ZIP. Shared by the
// authenticated route and the magic-link route (client is pre-scoped there).
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getTranslations } from "next-intl/server";
import { pickText } from "@/lib/i18n/pick";
import { formatLimit } from "@/lib/compliance/limits";
import { searchTrace } from "@/lib/inventory/trace";
import {
  getDeviationsData,
  getDocumentsData,
  getIntegrityFooter,
  getProgrammeData,
  getRecordsData,
} from "./data";
import { summarizeValue } from "@/components/inspection/tabs";
import {
  InspectionReportPdf,
  type InspectionReportData,
  type ReportSection,
} from "@/lib/pdf/inspection-report";

type Client = SupabaseClient<Database>;

export type ExportTab =
  | "programme"
  | "records"
  | "deviations"
  | "trace"
  | "documents"
  | "bundle";

const LOCALE = "da"; // exports are authority-facing (§10.2 Danish-first)

async function siteHeader(supabase: Client, siteId: string) {
  const { data: site } = await supabase
    .from("sites")
    .select("name, address, city, postal_code, cvr_p_number")
    .eq("id", siteId)
    .single();
  return {
    siteName: site?.name ?? "",
    siteAddress: [site?.address, site?.postal_code, site?.city].filter(Boolean).join(", "),
    cvr: site?.cvr_p_number ?? "",
  };
}

async function buildSections(
  supabase: Client,
  siteId: string,
  tab: Exclude<ExportTab, "bundle">,
  options: { fromDate: string; toDate: string; query?: string },
): Promise<{ title: string; sections: ReportSection[] }> {
  const t = await getTranslations({ locale: LOCALE, namespace: "inspection" });
  const fmt = (iso: string | null) =>
    iso ? iso.slice(0, 16).replace("T", " ") : "";

  if (tab === "programme") {
    const data = await getProgrammeData(supabase, siteId);
    const approverRaw = data.approved?.approver as
      | { full_name: string }
      | { full_name: string }[]
      | null
      | undefined;
    const approver = Array.isArray(approverRaw)
      ? (approverRaw[0]?.full_name ?? "")
      : (approverRaw?.full_name ?? "");
    return {
      title: t("tabs.programme"),
      sections: [
        {
          kind: "text",
          title: t("programme.approvalTitle"),
          lines: data.approved
            ? [
                `${t("programme.version")} ${data.approved.version} — ${t("programme.approvedBy")}: ${approver} (${data.approved.approved_at?.slice(0, 10) ?? ""})`,
                data.site?.pack_version_pinned
                  ? `${t("programme.pack")}: DK ${data.site.pack_version_pinned}`
                  : "",
              ].filter(Boolean)
            : [t("programme.none")],
        },
        {
          kind: "table",
          title: t("programme.cpTitle"),
          columns: [
            { label: t("export.colName"), width: "34%" },
            { label: t("export.colLimit"), width: "18%" },
            { label: t("export.colFrequency"), width: "18%" },
            { label: t("export.colSource"), width: "30%" },
          ],
          rows: data.controlPoints.map((cp) => {
            const source = cp.source_ref as { docId?: string; section?: string } | null;
            return [
              pickText(cp.name_i18n, LOCALE) + (cp.equipment ? ` — ${cp.equipment.name}` : ""),
              formatLimit(cp.limit_json),
              (() => {
                const frequency = cp.frequency_json as { times?: string[]; perEvent?: boolean } | null;
                return frequency?.perEvent
                  ? t("programme.perEvent")
                  : (frequency?.times ?? []).join(", ");
              })(),
              source?.docId ? `${source.docId} §${source.section ?? ""}` : "",
            ];
          }),
        },
      ],
    };
  }

  if (tab === "records") {
    const data = await getRecordsData(supabase, siteId, options);
    const totals = data.heatmap.reduce(
      (acc, day) => ({
        done: acc.done + day.done,
        missed: acc.missed + day.missed,
        deviations: acc.deviations + day.deviations,
      }),
      { done: 0, missed: 0, deviations: 0 },
    );
    return {
      title: `${t("tabs.records")} ${options.fromDate} – ${options.toDate}`,
      sections: [
        {
          kind: "text",
          title: t("export.summary"),
          lines: [
            t("export.recordTotals", {
              done: totals.done,
              missed: totals.missed,
              deviations: totals.deviations,
            }),
          ],
        },
        {
          kind: "table",
          title: t("tabs.records"),
          // §4.3: the official own-check forms carry the deviation and the
          // corrective action next to the check, and a "checked by" column —
          // an inspector looks for who signed off. Empty stays empty: a record
          // without a deviation shows blank cells, never a plausible filler.
          columns: [
            { label: t("export.colWhen"), width: "11%" },
            { label: t("export.colName"), width: "20%" },
            { label: t("export.colValue"), width: "10%" },
            { label: t("export.colKind"), width: "8%" },
            { label: t("export.colResult"), width: "8%" },
            { label: t("export.colWho"), width: "13%" },
            { label: t("export.colDeviation"), width: "15%" },
            { label: t("export.colCorrective"), width: "15%" },
          ],
          rows: data.completions.map((completion) => {
            const deviation = completion.deviation as
              | { description: string | null; corrective_action_text: string | null }
              | null;
            return [
              fmt(completion.created_at),
              pickText(completion.control_point?.name_i18n ?? null, LOCALE) ||
                t("records.adhoc"),
              summarizeValue(completion.value_json),
              completion.measurement_kind
                ? t(`export.kind.${completion.measurement_kind}`)
                : "",
              completion.passed === false ? t("records.failed") : "OK",
              (completion.performer as { full_name: string } | null)?.full_name ?? "",
              deviation?.description ?? "",
              deviation?.corrective_action_text ?? "",
            ];
          }),
        },
      ],
    };
  }

  if (tab === "deviations") {
    const data = await getDeviationsData(supabase, siteId);
    return {
      title: t("tabs.deviations"),
      sections: [
        {
          kind: "table",
          title: t("tabs.deviations"),
          columns: [
            { label: t("export.colWhen"), width: "14%" },
            { label: t("export.colDescription"), width: "30%" },
            { label: t("export.colStatus"), width: "12%" },
            { label: t("deviations.corrective"), width: "22%" },
            { label: t("deviations.verification"), width: "22%" },
          ],
          rows: data.deviations.map((deviation) => [
            fmt(deviation.detected_at),
            deviation.description,
            t(`deviations.status.${deviation.status}`),
            deviation.corrective_action_text ?? "",
            deviation.verification_text ?? "",
          ]),
        },
      ],
    };
  }

  if (tab === "trace") {
    const results = options.query
      ? await searchTrace(supabase, siteId, { query: options.query })
      : { batches: [], moves: [] };
    return {
      title: `${t("tabs.trace")}${options.query ? ` — "${options.query}"` : ""}`,
      sections: [
        {
          kind: "table",
          title: t("export.traceIn"),
          columns: [
            { label: t("export.colName"), width: "26%" },
            { label: t("export.colLot"), width: "16%" },
            { label: t("export.colSupplier"), width: "22%" },
            { label: t("export.colInvoice"), width: "14%" },
            { label: t("export.colQty"), width: "12%" },
            { label: t("export.colStatus"), width: "10%" },
          ],
          rows: results.batches.map((batch) => [
            batch.productName,
            batch.lotCode,
            batch.supplierName ?? t("trace.inHouse"),
            batch.invoiceNumber ?? "",
            `${batch.remaining}/${batch.quantity} ${batch.unit}`,
            batch.status,
          ]),
        },
        {
          kind: "table",
          title: t("export.traceOut"),
          columns: [
            { label: t("export.colWhen"), width: "18%" },
            { label: t("export.colName"), width: "28%" },
            { label: t("export.colKind"), width: "16%" },
            { label: t("export.colQty"), width: "12%" },
            { label: t("export.colDetail"), width: "26%" },
          ],
          rows: results.moves.map((move) => [
            fmt(move.movedAt),
            `${move.productName} (${move.lotCode})`,
            t(`trace.moves.${move.kind}`),
            String(move.quantity),
            move.b2bCustomerName ?? move.reason ?? "",
          ]),
        },
      ],
    };
  }

  // documents
  const data = await getDocumentsData(supabase, siteId);
  return {
    title: t("tabs.documents"),
    sections: [
      {
        kind: "table",
        title: t("tabs.documents"),
        columns: [
          { label: t("export.colName"), width: "40%" },
          { label: t("documents.kindLabel"), width: "25%" },
          { label: t("documents.validUntil"), width: "15%" },
          { label: t("export.colWhen"), width: "20%" },
        ],
        rows: data.documents.map((doc) => [
          doc.title,
          t(`documents.kinds.${doc.kind}`),
          doc.valid_until ?? "",
          fmt(doc.created_at),
        ]),
      },
    ],
  };
}

export async function renderInspectionPdf(
  supabase: Client,
  siteId: string,
  tab: Exclude<ExportTab, "bundle">,
  options: { fromDate: string; toDate: string; query?: string },
): Promise<Buffer> {
  const t = await getTranslations({ locale: LOCALE, namespace: "inspection" });
  const [header, body, integrity] = await Promise.all([
    siteHeader(supabase, siteId),
    buildSections(supabase, siteId, tab, options),
    getIntegrityFooter(supabase, siteId),
  ]);
  const data: InspectionReportData = {
    ...header,
    ...body,
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    sections: body.sections,
    integrity: { latestHash: integrity.latestHash, entries: integrity.entries },
    labels: {
      generated: t("export.generated"),
      integrity: t("export.integrityFooter"),
      page: t("export.page"),
    },
  };
  return renderToBuffer(
    React.createElement(InspectionReportPdf, { data }) as React.ReactElement<DocumentProps>,
  );
}

/** §10.3 full inspection bundle: programme + 12-month records + deviations + trace index. */
export async function buildInspectionBundle(
  supabase: Client,
  siteId: string,
): Promise<Buffer> {
  const zip = new JSZip();
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.parse(today) - 364 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // official-layout programme snapshots straight from storage
  const { data: documents } = await supabase
    .from("programme_documents")
    .select("kind, pdf_path")
    .eq("site_id", siteId)
    .not("pdf_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(6);
  for (const doc of documents ?? []) {
    const { data: file } = await supabase.storage.from("exports").download(doc.pdf_path!);
    if (file) {
      zip.file(
        `programme/${doc.pdf_path!.split("/").pop()}`,
        Buffer.from(await file.arrayBuffer()),
      );
    }
  }

  const range = { fromDate: yearAgo, toDate: today };
  zip.file("records-12mdr.pdf", await renderInspectionPdf(supabase, siteId, "records", range));
  zip.file("afvigelser.pdf", await renderInspectionPdf(supabase, siteId, "deviations", range));
  zip.file("dokumenter.pdf", await renderInspectionPdf(supabase, siteId, "documents", range));

  // traceability index CSV (one-step-back/forward, R5)
  const { data: traceRows } = await supabase
    .from("v_traceability_lookup")
    .select("product_name, lot_code, quantity, remaining, unit, status, supplier_name, invoice_number, received_at, expiry_date")
    .eq("site_id", siteId)
    .limit(2000);
  const csvHeader =
    "product;lot;quantity;remaining;unit;status;supplier;invoice;received_at;expiry";
  const csvLines = (traceRows ?? []).map((row) =>
    [
      row.product_name,
      row.lot_code,
      row.quantity,
      row.remaining,
      row.unit,
      row.status,
      row.supplier_name ?? "",
      row.invoice_number ?? "",
      row.received_at ?? "",
      row.expiry_date ?? "",
    ]
      .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
      .join(";"),
  );
  zip.file("sporbarhed-index.csv", [csvHeader, ...csvLines].join("\n"));

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

/**
 * §4.3: the same tab as CSV, for the customer's own records and for anyone who
 * wants the data in a spreadsheet. Built from the very same sections as the
 * PDF, so the two can never disagree — and blank cells stay blank.
 */
export async function renderInspectionCsv(
  supabase: Client,
  siteId: string,
  tab: Exclude<ExportTab, "bundle">,
  options: { fromDate: string; toDate: string; query?: string },
): Promise<string> {
  const [header, body] = await Promise.all([
    siteHeader(supabase, siteId),
    buildSections(supabase, siteId, tab, options),
  ]);

  const escape = (value: string) =>
    /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines: string[] = [
    // the page furniture the PDF carries, kept with the data
    escape(header.siteName),
    escape(
      [header.siteAddress, header.cvr ? `CVR ${header.cvr}` : ""]
        .filter(Boolean)
        .join(" · "),
    ),
    escape(`${options.fromDate} – ${options.toDate}`),
    escape(new Date().toISOString().slice(0, 16).replace("T", " ")),
    "",
  ];

  for (const section of body.sections) {
    lines.push(escape(section.title));
    if (section.kind === "table") {
      lines.push(section.columns.map((c) => escape(c.label)).join(","));
      for (const row of section.rows) lines.push(row.map(escape).join(","));
    } else {
      for (const line of section.lines) lines.push(escape(line));
    }
    lines.push("");
  }
  return lines.join("\n");
}
