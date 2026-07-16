// §9.1 step 4 — deterministic batch creation plan per confirmed food line:
// lot = printed lotCode else AUTO-{invoiceNumber}-{line}; expiry = printed
// date when extracted else received_at + product default shelf life, with
// expiry_kind='internal' when defaulted.
import type { InvoiceLine } from "@/lib/ai/schemas";

export type BatchPlan = {
  lotCode: string;
  quantity: number;
  unit: string;
  expiryDate: string | null; // ISO date
  expiryKind: "use_by" | "internal" | null;
};

function isoDatePlusDays(fromIso: string, days: number): string {
  const date = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function planBatch(args: {
  line: InvoiceLine;
  lineNo: number;
  invoiceNumber: string | null;
  receivedAtIso: string; // timestamptz of the goods receipt
  defaultShelfLifeDays: number | null;
}): BatchPlan {
  const { line } = args;
  const lotCode =
    line.lotCode ?? `AUTO-${args.invoiceNumber ?? "NA"}-${args.lineNo}`;

  // box(=N pcs if stated) normalizes to pieces for stock tracking
  const isBoxWithContent = line.unit === "box" && line.unitsPerBox !== null;
  const quantity = isBoxWithContent
    ? (line.quantity ?? 1) * line.unitsPerBox!
    : (line.quantity ?? 1);
  const unit = isBoxWithContent ? "pcs" : (line.unit ?? "pcs");

  let expiryDate: string | null = null;
  let expiryKind: BatchPlan["expiryKind"] = null;
  if (line.expiryDate) {
    expiryDate = line.expiryDate;
    expiryKind = "use_by"; // printed on the document
  } else if (args.defaultShelfLifeDays !== null) {
    expiryDate = isoDatePlusDays(args.receivedAtIso, args.defaultShelfLifeDays);
    expiryKind = "internal"; // defaulted, not printed (§9.1)
  }

  return { lotCode, quantity, unit, expiryDate, expiryKind };
}
