"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Plus } from "lucide-react";
import { confirmImportAction } from "../../_actions";
import type { ImportGapReport } from "@/lib/compliance/import-mapper";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/compliance/import-mapper";
import type { ImportExtraction } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = ImportExtraction["rows"][number];
type CellField = "whatYouDo" | "whatCanGoWrong" | "controlMeasures" | "ifItGoesWrong";
const CELL_FIELDS: CellField[] = [
  "whatYouDo",
  "whatCanGoWrong",
  "controlMeasures",
  "ifItGoesWrong",
];

/**
 * §7.5 side-by-side review: extracted cells vs the official skema, with
 * provenance (page, confidence) per row and the gap checklist on top. Empty
 * cells stay visibly empty — corrections and gap answers come from the human.
 */
export function ImportReview({
  siteId,
  importId,
  initialRows,
  gapReport,
  sections,
  originals,
}: {
  siteId: string;
  importId: string;
  initialRows: Row[];
  gapReport: ImportGapReport;
  sections: { key: string; label: string }[];
  originals: { name: string; url: string }[];
}) {
  const t = useTranslations("importRa");
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const gapTotal =
    gapReport.missingSections.length +
    gapReport.emptyCriticalCells.length +
    gapReport.lowConfidenceRows.length +
    gapReport.unreadableCheckboxes.length;

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addCustomRow(sectionKey: Row["sectionKey"]) {
    setRows((prev) => [
      ...prev,
      {
        sectionKey,
        activityKey: "custom",
        customName: null,
        applies: true,
        isCritical: false,
        whatYouDo: null,
        whatCanGoWrong: null,
        controlMeasures: null,
        ifItGoesWrong: null,
        confidence: 1, // human-entered
        page: 0,
        region: null,
      },
    ]);
  }

  function confirm() {
    startTransition(async () => {
      const result = await confirmImportAction({ siteId, importId, rows });
      if (result && "ok" in result) {
        toast.success(t("confirmedToast"));
        router.push(`/app/${siteId}/programme`);
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="grid gap-4">
      {/* gap checklist (§7.5) */}
      <Card data-testid="import-gaps">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("gapsTitle", { count: gapTotal })}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {gapTotal === 0 ? <p>{t("noGaps")}</p> : null}
          {gapReport.missingSections.map((key) => (
            <p key={`ms-${key}`} data-testid="gap-missing-section">
              • {t("gapMissingSection", {
                section: sections.find((s) => s.key === key)?.label ?? key,
              })}
            </p>
          ))}
          {gapReport.emptyCriticalCells.map((gap, i) => (
            <p key={`ec-${i}`} data-testid="gap-empty-critical">
              • {t("gapEmptyCritical", { row: gap.activityKey })}
            </p>
          ))}
          {gapReport.lowConfidenceRows.map((gap, i) => (
            <p key={`lc-${i}`} data-testid="gap-low-confidence">
              • {t("gapLowConfidence", { row: gap.activityKey, page: gap.page })}
            </p>
          ))}
          {gapReport.unreadableCheckboxes.map((gap, i) => (
            <p key={`uc-${i}`} data-testid="gap-unreadable">
              • {t("gapUnreadable", { row: gap.activityKey })}
            </p>
          ))}
        </CardContent>
      </Card>

      {/* originals: provenance stays one tap away */}
      {originals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {originals.map((original) => (
            <Button key={original.url} asChild variant="outline" size="sm">
              <a href={original.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                {original.name}
              </a>
            </Button>
          ))}
        </div>
      ) : null}

      {/* per-section extracted rows */}
      {sections.map((section) => {
        const sectionRows = rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.sectionKey === section.key);
        const isMissing = gapReport.missingSections.includes(section.key);
        if (sectionRows.length === 0 && !isMissing) return null;
        return (
          <Card key={section.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.label}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {sectionRows.map(({ row, index }) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border p-3"
                  data-testid={`import-row-${row.activityKey}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {row.customName ?? row.activityKey}
                    </span>
                    {row.page > 0 ? (
                      <Badge variant="outline" data-testid="provenance-page">
                        {t("pageBadge", { page: row.page })}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("manualBadge")}</Badge>
                    )}
                    {row.confidence < LOW_CONFIDENCE_THRESHOLD ? (
                      <Badge variant="destructive" data-testid="low-confidence-badge">
                        {t("confidenceBadge", {
                          pct: Math.round(row.confidence * 100),
                        })}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.applies ? "default" : "outline"}
                      className={row.applies === null ? "border-destructive" : ""}
                      onClick={() => updateRow(index, { applies: !(row.applies ?? false) })}
                      data-testid={`applies-${row.activityKey}`}
                    >
                      {t("applies")}
                      {row.applies === null ? ` (${t("unreadable")})` : ""}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.isCritical ? "destructive" : "outline"}
                      className={row.isCritical === null ? "border-destructive" : ""}
                      onClick={() =>
                        updateRow(index, { isCritical: !(row.isCritical ?? false) })
                      }
                    >
                      {t("critical")}
                      {row.isCritical === null ? ` (${t("unreadable")})` : ""}
                    </Button>
                  </div>
                  {CELL_FIELDS.map((field) => (
                    <div key={field} className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">
                        {t(`cells.${field}`)}
                        {row[field] === null ? (
                          <span
                            className="ml-1 text-destructive"
                            data-testid="cell-empty"
                          >
                            — {t("emptyCell")}
                          </span>
                        ) : null}
                      </Label>
                      <Textarea
                        rows={2}
                        value={row[field] ?? ""}
                        placeholder={t("emptyCellPlaceholder")}
                        onChange={(e) =>
                          updateRow(index, {
                            [field]: e.target.value === "" ? null : e.target.value,
                          } as Partial<Row>)
                        }
                        data-testid={`cell-${index}-${field}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {/* §7.5 gap mini-wizard: missing sections are ASKED, never filled */}
              {isMissing ? (
                <div className="grid gap-2 rounded-lg border border-dashed p-3">
                  <p className="text-sm text-muted-foreground">
                    {t("missingSectionPrompt", { section: section.label })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    onClick={() => addCustomRow(section.key as Row["sectionKey"])}
                    data-testid={`add-row-${section.key}`}
                  >
                    <Plus className="size-4" />
                    {t("addRowButton")}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t("errors.error")}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="min-h-14"
        disabled={pending}
        onClick={confirm}
        data-testid="import-confirm"
      >
        {t("confirmButton")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("confirmHint")}</p>
    </div>
  );
}
