// §9.1 matching pipeline — DETERMINISTIC (code, not AI). Suppliers by CVR
// else fuzzy name+postal; products by normalized_name similarity + purchase
// history for the same supplier. Thresholds [DEFAULT]: ≥0.90 auto-match,
// 0.60–0.90 suggested (one-tap accept), <0.60 create-new proposal.
import type { InvoiceExtraction, InvoiceLine } from "@/lib/ai/schemas";
import { normalizeName, similarity } from "./similarity";

export const MATCH_AUTO_THRESHOLD = 0.9;   // [DEFAULT]
export const MATCH_SUGGEST_THRESHOLD = 0.6; // [DEFAULT]
export const HISTORY_RAW_THRESHOLD = 0.8;   // same supplier + similar raw line
export const TOTAL_MISMATCH_TOLERANCE = 0.02; // §9.1: >2% flags review

export type CatalogProduct = {
  id: string;
  normalized_name: string;
  merged_into_id: string | null;
};

export type SupplierCandidate = {
  id: string;
  name: string;
  cvr: string | null;
  postal_code: string | null;
};

export type PurchaseHistoryEntry = {
  supplier_id: string;
  raw_text: string;
  product_id: string;
};

export type SupplierMatch =
  | { action: "matched"; supplierId: string; by: "cvr" | "fuzzy" }
  | { action: "create" };

export function matchSupplier(
  extracted: InvoiceExtraction["supplier"],
  candidates: SupplierCandidate[],
): SupplierMatch {
  const cvr = extracted.cvr?.replace(/\D/g, "");
  if (cvr) {
    const byCvr = candidates.find((c) => c.cvr?.replace(/\D/g, "") === cvr);
    if (byCvr) return { action: "matched", supplierId: byCvr.id, by: "cvr" };
  }
  const name = normalizeName(extracted.name);
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    let score = similarity(name, normalizeName(candidate.name));
    // postal agreement strengthens a name match; disagreement weakens it
    if (extracted.postal && candidate.postal_code) {
      score += extracted.postal === candidate.postal_code ? 0.1 : -0.1;
    }
    if (!best || score > best.score) best = { id: candidate.id, score };
  }
  if (best && best.score >= MATCH_SUGGEST_THRESHOLD) {
    return { action: "matched", supplierId: best.id, by: "fuzzy" };
  }
  return { action: "create" };
}

export type ProductMatch = {
  line: InvoiceLine;
  action: "auto" | "suggest" | "create";
  productId: string | null;
  confidence: number;
};

export function matchProduct(
  line: InvoiceLine,
  supplierId: string | null,
  catalog: CatalogProduct[],
  history: PurchaseHistoryEntry[],
): ProductMatch {
  // strongest signal: this supplier billed a near-identical raw line before
  if (supplierId) {
    for (const entry of history) {
      if (entry.supplier_id !== supplierId) continue;
      if (similarity(line.rawText.toLowerCase(), entry.raw_text.toLowerCase()) >= HISTORY_RAW_THRESHOLD) {
        return { line, action: "auto", productId: entry.product_id, confidence: 0.95 };
      }
    }
  }

  const normalized = normalizeName(line.description);
  let best: { id: string; score: number } | null = null;
  for (const product of catalog) {
    if (product.merged_into_id) continue; // §9.2 merged duplicates are history
    const score = similarity(normalized, product.normalized_name);
    if (!best || score > best.score) best = { id: product.id, score };
  }

  if (best && best.score >= MATCH_AUTO_THRESHOLD) {
    return { line, action: "auto", productId: best.id, confidence: best.score };
  }
  if (best && best.score >= MATCH_SUGGEST_THRESHOLD) {
    return { line, action: "suggest", productId: best.id, confidence: best.score };
  }
  return { line, action: "create", productId: null, confidence: best?.score ?? 0 };
}

/** §9.1 sanity check: computed line total vs printed total, >2% flags review. */
export function totalMismatch(extraction: InvoiceExtraction): number | null {
  if (extraction.totalAmount === null || extraction.totalAmount === 0) return null;
  const computed = extraction.lines.reduce((sum, line) => {
    if (line.lineTotal !== null) return sum + line.lineTotal;
    if (line.quantity !== null && line.unitPrice !== null) {
      return sum + line.quantity * line.unitPrice;
    }
    return sum;
  }, 0);
  if (computed === 0) return null;
  return Math.abs(computed - extraction.totalAmount) / Math.abs(extraction.totalAmount);
}

export function totalNeedsReview(extraction: InvoiceExtraction): boolean {
  const mismatch = totalMismatch(extraction);
  return mismatch !== null && mismatch > TOTAL_MISMATCH_TOLERANCE;
}
