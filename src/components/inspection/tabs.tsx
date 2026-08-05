// §10.2 inspector-facing tabs — pure server components shared by the
// on-device inspection surface (/app/[site]/inspection) and the magic-link
// page (/inspect/[token]). Everything is read-only; navigation is plain GET
// links so the inspector's device needs no JS state.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pickText } from "@/lib/i18n/pick";
import { formatLimit } from "@/lib/compliance/limits";
import { frequencySchema } from "@/lib/compliance/pack-schema";
import type {
  getDeviationsData,
  getDocumentsData,
  getProgrammeData,
  getRecordsData,
} from "@/lib/inspection/data";
import type { TraceBatch, TraceMove } from "@/lib/inventory/trace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const INSPECTION_TABS = [
  "programme",
  "records",
  "deviations",
  "trace",
  "documents",
] as const;
export type InspectionTab = (typeof INSPECTION_TABS)[number];

export type TabContext = {
  basePath: string;                       // page URL for GET links
  fileHref: (bucket: string, path: string) => string; // resolved per surface
  locale: string;
  exportHref?: (tab: InspectionTab) => string;        // Task: §10.3 exports
  params: Record<string, string | undefined>;         // current searchParams
};

function href(ctx: TabContext, patch: Record<string, string | undefined>): string {
  const merged = { ...ctx.params, ...patch };
  const query = Object.entries(merged)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join("&");
  return query ? `${ctx.basePath}?${query}` : ctx.basePath;
}

export async function InspectionNav({ ctx, active }: { ctx: TabContext; active: InspectionTab }) {
  const t = await getTranslations("inspection");
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto" data-testid="inspection-nav">
      {INSPECTION_TABS.map((tab) => (
        <Link
          key={tab}
          href={href(ctx, { tab, q: undefined })}
          data-testid={`inspection-tab-${tab}`}
          className={`inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 text-sm font-medium ${
            active === tab
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {t(`tabs.${tab}`)}
        </Link>
      ))}
    </nav>
  );
}

export async function ExportBar({ ctx, tab }: { ctx: TabContext; tab: InspectionTab }) {
  const t = await getTranslations("inspection");
  if (!ctx.exportHref) return null;
  return (
    <div className="mb-3 flex justify-end gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={ctx.exportHref(tab)} data-testid={`export-${tab}`}>
          {t("exportPdf")}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        {/* §4.3 the same data as CSV, for the customer's own records */}
        <a href={`${ctx.exportHref(tab)}&format=csv`} data-testid={`export-${tab}-csv`}>
          {t("exportCsv")}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        {/* §10.3 one-click full inspection bundle (ZIP) */}
        <a
          href={ctx.exportHref("bundle" as InspectionTab)}
          data-testid="export-bundle"
        >
          {t("exportBundle")}
        </a>
      </Button>
    </div>
  );
}

/* ── 1. Egenkontrolprogram ─────────────────────────────────────────────────── */

export async function ProgrammeTab({
  ctx,
  data,
}: {
  ctx: TabContext;
  data: Awaited<ReturnType<typeof getProgrammeData>>;
}) {
  const t = await getTranslations("inspection");
  return (
    <div className="grid gap-4">
      {data.approved ? (
        <Card data-testid="approval-block">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("programme.approvalTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>
              {t("programme.version")}: <strong>{data.approved.version}</strong> ·{" "}
              {t("programme.approvedBy")}:{" "}
              <strong>
                {(() => {
                  const raw = data.approved.approver as
                    | { full_name: string }
                    | { full_name: string }[]
                    | null;
                  return Array.isArray(raw)
                    ? (raw[0]?.full_name ?? "")
                    : (raw?.full_name ?? "");
                })()}
              </strong>{" "}
              · {data.approved.approved_at?.slice(0, 10)}
            </p>
            {data.site?.pack_version_pinned ? (
              <p className="text-muted-foreground">
                {t("programme.pack")}: DK {data.site.pack_version_pinned}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {data.documents
                .filter((doc) => doc.risk_analysis_id === data.approved!.id && doc.pdf_path)
                .map((doc) => (
                  <Button key={doc.id} asChild variant="outline" size="sm">
                    <a
                      href={ctx.fileHref("exports", doc.pdf_path!)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="programme-pdf-link"
                    >
                      {t(`programme.docKinds.${doc.kind}`)}
                    </a>
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t("programme.none")}</p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("programme.cpTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {data.controlPoints.map((cp) => {
            const frequency = frequencySchema.safeParse(cp.frequency_json);
            const source = cp.source_ref as { docId?: string; section?: string } | null;
            return (
              <div key={cp.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0" data-testid="inspection-cp">
                <span className="min-w-0 flex-1">
                  {pickText(cp.name_i18n, ctx.locale)}
                  {cp.equipment ? ` — ${cp.equipment.name}` : ""}
                </span>
                <Badge variant="outline" className="font-mono">
                  {formatLimit(cp.limit_json)}
                </Badge>
                {cp.limit_loosened ? (
                  <Badge variant="destructive">{t("programme.loosened")}</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {frequency.success
                    ? "perEvent" in frequency.data
                      ? t("programme.perEvent")
                      : frequency.data.times.join(", ")
                    : ""}
                  {source?.docId ? ` · ${source.docId} §${source.section}` : ""}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("programme.historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {data.history.map((ra) => (
            <p key={ra.id} data-testid="ra-version-row">
              v{ra.version} — {t(`programme.status.${ra.status}`)}
              {ra.approved_at ? ` · ${ra.approved_at.slice(0, 10)}` : ""}
              {ra.wizard_transcript ? ` · ${t("programme.aiAssisted")}` : ""}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 2. Registreringer ─────────────────────────────────────────────────────── */

const RECORD_CATEGORIES = ["temperature", "cleaning", "receiving", "pest", "hygiene", "other"];

export function summarizeValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.temp_c === "number") return `${record.temp_c} °C`;
  if (Array.isArray(record.checklist)) {
    const done = record.checklist.filter(
      (item) => (item as { ok?: boolean }).ok !== false,
    ).length;
    return `${done}/${record.checklist.length}`;
  }
  if (Array.isArray(record.cool_log)) {
    const last = record.cool_log.at(-1) as { temp_c?: number } | undefined;
    return last?.temp_c !== undefined ? `→ ${last.temp_c} °C` : "";
  }
  if (typeof record.note_text === "string") return record.note_text.slice(0, 60);
  if (record.receiving) return `${record.temp_c ?? "—"} °C`;
  return "";
}

export async function RecordsTab({
  ctx,
  data,
  range,
}: {
  ctx: TabContext;
  data: Awaited<ReturnType<typeof getRecordsData>>;
  range: { fromDate: string; toDate: string; category?: string };
}) {
  const t = await getTranslations("inspection");
  const presets = [
    { key: "7", days: 7 },
    { key: "30", days: 30 },
    { key: "90", days: 90 },
  ];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const from = new Date(Date.parse(today) - (preset.days - 1) * 86_400_000)
            .toISOString()
            .slice(0, 10);
          return (
            <Button key={preset.key} asChild variant={range.fromDate === from ? "default" : "outline"} size="sm">
              <Link href={href(ctx, { from, to: today })} data-testid={`records-preset-${preset.key}`}>
                {t(`records.presets.${preset.key}`)}
              </Link>
            </Button>
          );
        })}
        {RECORD_CATEGORIES.map((category) => (
          <Button
            key={category}
            asChild
            variant={range.category === category ? "default" : "outline"}
            size="sm"
          >
            <Link
              href={href(ctx, { cat: range.category === category ? undefined : category })}
              data-testid={`records-cat-${category}`}
            >
              {t(`records.categories.${category}`)}
            </Link>
          </Button>
        ))}
      </div>

      {/* calendar heat-map: done/missed/deviation per day (§10.2) */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-1" data-testid="records-heatmap">
            {data.heatmap.map((day) => {
              // a declared closed day reads as "closed", never as an empty
              // square an inspector would take for a missing record (§3.5)
              const tone = day.closed
                ? "bg-slate-300 dark:bg-slate-600"
                : day.deviations > 0
                  ? "bg-red-500"
                  : day.missed > 0
                    ? "bg-amber-400"
                    : day.done > 0
                      ? "bg-emerald-500"
                      : "bg-muted";
              return (
                <div
                  key={day.date}
                  title={
                    day.closed
                      ? `${day.date}: ${t("records.closedDay")}`
                      : `${day.date}: ${day.done}✓ ${day.missed}✗ ${day.deviations}⚠`
                  }
                  className={`size-4 rounded-sm ${tone}`}
                  data-testid={`heat-${day.date}`}
                  data-closed={day.closed ? "true" : undefined}
                />
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("records.heatmapLegend")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {data.completions.map((completion) => (
          <Card key={completion.id} data-testid="record-row">
            <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {pickText(completion.control_point?.name_i18n ?? null, ctx.locale) ||
                    t("records.adhoc")}
                  {completion.equipment ? ` — ${completion.equipment.name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {completion.created_at.slice(0, 16).replace("T", " ")} ·{" "}
                  {(completion.performer as { full_name: string } | null)?.full_name ?? ""}
                </p>
              </div>
              <span className="font-mono">{summarizeValue(completion.value_json)}</span>
              {completion.passed === false ? (
                <Badge variant="destructive">{t("records.failed")}</Badge>
              ) : null}
              {completion.is_late ? (
                <Badge variant="secondary" data-testid="late-flag">
                  {t("records.late")}
                </Badge>
              ) : null}
              {completion.photo_paths.length > 0 ? (
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={ctx.fileHref("photos", completion.photo_paths[0]!)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("records.photo")}
                </a>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── 3. Afvigelser ─────────────────────────────────────────────────────────── */

export async function DeviationsTab({
  ctx,
  data,
}: {
  ctx: TabContext;
  data: Awaited<ReturnType<typeof getDeviationsData>>;
}) {
  const t = await getTranslations("inspection");
  return (
    <div className="grid gap-2">
      {data.deviations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("deviations.none")}</p>
      ) : null}
      {data.deviations.map((deviation) => {
        const repeats = deviation.control_point_id
          ? (data.repeatCounts.get(deviation.control_point_id) ?? 0)
          : 0;
        return (
          <Card key={deviation.id} data-testid="inspection-deviation">
            <CardContent className="grid gap-1 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{deviation.description}</span>
                <Badge
                  variant={
                    deviation.status === "open"
                      ? "destructive"
                      : deviation.status === "corrected"
                        ? "secondary"
                        : "default"
                  }
                >
                  {t(`deviations.status.${deviation.status}`)}
                </Badge>
                {repeats > 1 ? (
                  <Badge variant="outline" data-testid="repeat-badge">
                    {t("deviations.repeat", { count: repeats })}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {deviation.detected_at.slice(0, 16).replace("T", " ")} ·{" "}
                {(deviation.detector as { full_name: string } | null)?.full_name ?? ""}
                {deviation.control_point
                  ? ` · ${pickText(deviation.control_point.name_i18n, ctx.locale)}`
                  : ""}
              </p>
              {deviation.corrective_action_text ? (
                <p>
                  <strong>{t("deviations.corrective")}:</strong>{" "}
                  {deviation.corrective_action_text}
                </p>
              ) : null}
              {deviation.verification_text ? (
                <p>
                  <strong>{t("deviations.verification")}:</strong>{" "}
                  {deviation.verification_text}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ── 4. Sporbarhed (read-only §9.6) ────────────────────────────────────────── */

export async function TraceTab({
  ctx,
  results,
  query,
}: {
  ctx: TabContext;
  results: { batches: TraceBatch[]; moves: TraceMove[] } | null;
  query: string;
}) {
  const t = await getTranslations("inspection");
  return (
    <div className="grid gap-3">
      <form className="flex gap-2" action={ctx.basePath} method="get">
        {Object.entries(ctx.params)
          .filter(([key, value]) => key !== "q" && value)
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <Input
          name="q"
          defaultValue={query}
          placeholder={t("trace.placeholder")}
          className="min-h-12"
          data-testid="inspection-trace-query"
        />
        <Button type="submit" className="min-h-12" data-testid="inspection-trace-search">
          {t("trace.search")}
        </Button>
      </form>
      {results ? (
        <div className="grid gap-2">
          {results.batches.map((batch) => (
            <Card key={batch.batchId} data-testid="inspection-trace-batch">
              <CardContent className="grid gap-1 py-3 text-sm">
                <p className="font-medium">
                  {batch.productName} · {batch.lotCode} · {batch.remaining}/{batch.quantity}{" "}
                  {batch.unit}
                </p>
                <p className="text-xs text-muted-foreground">
                  {batch.supplierName ?? t("trace.inHouse")}
                  {batch.invoiceNumber ? ` · ${batch.invoiceNumber}` : ""}
                  {batch.receivedAt ? ` · ${batch.receivedAt.slice(0, 10)}` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
          {results.moves.slice(0, 50).map((move, i) => (
            <p key={i} className="text-sm" data-testid="inspection-trace-move">
              {move.movedAt.slice(0, 16).replace("T", " ")} — {move.productName} (
              {move.lotCode}): {t(`trace.moves.${move.kind}`)} {move.quantity}
              {move.b2bCustomerName ? ` → ${move.b2bCustomerName}` : ""}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("trace.hint")}</p>
      )}
    </div>
  );
}

/* ── 5. Dokumenter ─────────────────────────────────────────────────────────── */

export async function DocumentsTab({
  ctx,
  data,
}: {
  ctx: TabContext;
  data: Awaited<ReturnType<typeof getDocumentsData>>;
}) {
  const t = await getTranslations("inspection");
  return (
    <div className="grid gap-2">
      {/* §13 hygiene-training log (inspectors ask for it) */}
      {data.training.length > 0 ? (
        <Card data-testid="training-log">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("documents.trainingTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {data.training.map((record) => (
              <p key={record.id} data-testid="training-row">
                {record.trained_on} — <strong>{record.person_name}</strong>:{" "}
                {record.course}
                {record.certificate_path ? (
                  <>
                    {" · "}
                    <a
                      className="text-primary underline-offset-4 hover:underline"
                      href={ctx.fileHref("documents", record.certificate_path)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("documents.certificate")}
                    </a>
                  </>
                ) : null}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.documents.length === 0 && data.training.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("documents.none")}</p>
      ) : null}
      {data.documents.map((doc) => (
        <Card key={doc.id} data-testid="inspection-document">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{doc.title}</p>
              <p className="text-xs text-muted-foreground">
                {t(`documents.kinds.${doc.kind}`)}
                {doc.valid_until ? ` · ${t("documents.validUntil")} ${doc.valid_until}` : ""}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a
                href={ctx.fileHref("documents", doc.file_path)}
                target="_blank"
                rel="noreferrer"
              >
                {t("documents.open")}
              </a>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
