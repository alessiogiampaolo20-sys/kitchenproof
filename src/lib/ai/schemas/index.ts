import { z } from "zod";

/**
 * Zod schemas for every AI output (§14: all outputs Zod-validated). These are
 * the single source of truth for structured-output formats; the provider
 * enforces them via output_config.format and re-validates client-side.
 */

/* ── Wizard interview (§7.2): one adaptive turn ────────────────────────────── */

export const wizardChipSchema = z
  .object({
    id: z.string(),
    label_da: z.string(),
    label_en: z.string(),
  })
  .strict();

export const wizardTurnSchema = z
  .object({
    done: z.boolean(),
    question: z
      .object({
        id: z.string(),
        text_da: z.string(),
        text_en: z.string(),
        chips: z.array(wizardChipSchema).max(8),
        allowFreeText: z.boolean(),
        multiSelect: z.boolean(),
      })
      .strict()
      .nullable(),
    summary_da: z.string().nullable(),
  })
  .strict();
export type WizardTurn = z.infer<typeof wizardTurnSchema>;

/* ── Wizard draft generation (§7.3): one official skema section per call ───── */

export const draftHazardSchema = z
  .object({
    category: z.enum(["micro", "chemical", "physical", "allergen"]),
    description_da: z.string(),
    description_en: z.string(),
    likelihood: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    isCcp: z.boolean(),
    controlMeasure_da: z.string(),
    controlMeasure_en: z.string(),
    justification_da: z.string(),
    justification_en: z.string(),
  })
  .strict();

export const draftRowSchema = z
  .object({
    activityKey: z.string(), // official row key from the pack skema, or "custom"
    customName_da: z.string().nullable(),
    customName_en: z.string().nullable(),
    applies: z.boolean(),
    critical: z.boolean(),
    whatYouDo_da: z.string().nullable(),
    whatYouDo_en: z.string().nullable(),
    whatCanGoWrong_da: z.string().nullable(),
    whatCanGoWrong_en: z.string().nullable(),
    controlMeasures_da: z.string().nullable(),
    controlMeasures_en: z.string().nullable(),
    ifItGoesWrong_da: z.string().nullable(),
    ifItGoesWrong_en: z.string().nullable(),
    hazards: z.array(draftHazardSchema).max(6),
    controlPointKeys: z.array(z.string()).max(6),
    notRelevantBecause_da: z.string().nullable(), // §7.3 completeness: explicit reasoning
  })
  .strict();

export const draftSectionSchema = z
  .object({
    sectionKey: z.enum([
      "modtagelse",
      "opbevaring",
      "tilberedning",
      "salg_servering",
      "transport",
      "andet",
    ]),
    rows: z.array(draftRowSchema).max(12),
    // §7.3 guardrail: AI may only propose TIGHTER limits than pack defaults;
    // the server clamps anything looser back to the pack value.
    tighterLimits: z
      .array(
        z
          .object({
            templateKey: z.string(),
            max: z.number().nullable(),
            min: z.number().nullable(),
            reason_da: z.string(),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();
export type DraftSection = z.infer<typeof draftSectionSchema>;

/* ── Import extraction (§7.5): official skema as the target, per page ──────── */

export const importCellRegionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  })
  .strict();

export const importRowSchema = z
  .object({
    sectionKey: z.enum([
      "modtagelse",
      "opbevaring",
      "tilberedning",
      "salg_servering",
      "transport",
      "andet",
    ]),
    activityKey: z.string(), // official row key or "custom"
    customName: z.string().nullable(),
    applies: z.boolean().nullable(),    // null = checkbox not readable
    isCritical: z.boolean().nullable(),
    // §7.5 [DECISION]: extraction NEVER invents content — an empty cell is
    // null, never a plausible-sounding paraphrase.
    whatYouDo: z.string().nullable(),
    whatCanGoWrong: z.string().nullable(),
    controlMeasures: z.string().nullable(),
    ifItGoesWrong: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    page: z.number().int(),
    region: importCellRegionSchema.nullable(),
  })
  .strict();

export const importExtractionSchema = z
  .object({
    documentLanguage: z.enum(["da", "en", "it", "mixed", "unknown"]),
    looksLikeOfficialSkema: z.boolean(),
    rows: z.array(importRowSchema).max(60),
    unreadableNotes: z.array(z.string()).max(20),
  })
  .strict();
export type ImportExtraction = z.infer<typeof importExtractionSchema>;

/* ── Invoice / delivery-note extraction (§9.1) ─────────────────────────────── */

export const INVOICE_UNITS = ["kg", "g", "l", "ml", "pcs", "box"] as const;

export const invoiceSupplierSchema = z
  .object({
    name: z.string(),
    cvr: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    postal: z.string().nullable(),
    country: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();

export const invoiceLineSchema = z
  .object({
    rawText: z.string(),              // exact line as printed (§9.1)
    description: z.string(),          // cleaned product name
    quantity: z.number().nullable(),
    unit: z.enum(INVOICE_UNITS).nullable(),
    unitsPerBox: z.number().nullable(),   // box(=N pcs) when stated
    unitPrice: z.number().nullable(),
    lineTotal: z.number().nullable(),     // for the total sanity check
    lotCode: z.string().nullable(),
    expiryDate: z.string().nullable(),    // ISO date when PRINTED (delivery notes)
    gtin: z.string().nullable(),
    isFood: z.boolean(),                  // excludes napkins, detergents, fees…
    confidence: z.number().min(0).max(1),
    page: z.number().int(),
  })
  .strict();

export const invoiceExtractionSchema = z
  .object({
    documentKind: z.enum(["invoice", "delivery_note", "credit_note", "receipt"]),
    supplier: invoiceSupplierSchema,
    invoiceNumber: z.string().nullable(),
    invoiceDate: z.string().nullable(),   // ISO date
    currency: z.string().nullable(),
    totalAmount: z.number().nullable(),
    lines: z.array(invoiceLineSchema).max(80),
    overallConfidence: z.number().min(0).max(1),
  })
  .strict();
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
export type InvoiceLine = InvoiceExtraction["lines"][number];

/* ── New-product enrichment (§9.1 step 3) — AI-suggested, human-confirmed ──── */

export const EU_ALLERGENS = [
  "gluten", "crustaceans", "eggs", "fish", "peanuts", "soybeans", "milk",
  "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs",
] as const;

export const productEnrichSchema = z
  .object({
    products: z
      .array(
        z
          .object({
            description: z.string(),   // echo of the line description (join key)
            category: z.enum([
              "meat", "fish", "dairy", "produce", "dry", "frozen",
              "beverage", "bakery", "packaging", "nonfood", "other",
            ]),
            storageType: z.enum(["fridge", "freezer", "dry", "ambient"]),
            shelfLifeDays: z.number().int().positive().nullable(),
            allergens: z.array(z.enum(EU_ALLERGENS)).max(14),
            unitDefault: z.enum(INVOICE_UNITS),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type ProductEnrichment = z.infer<typeof productEnrichSchema>;

/* ── Compliance assistant (§13/§14): RAG with mandatory citations ──────────── */

export const assistantAnswerSchema = z
  .object({
    inScope: z.boolean(),
    /** answer in the requested locale; when out of scope: a short referral */
    answer: z.string().min(1),
    citations: z
      .array(
        z
          .object({
            docId: z.string().min(1),
            section: z.string().min(1),
          })
          .strict(),
      )
      .max(8),
  })
  .strict()
  // §13 [DECISION]: an in-scope answer without sources is INVALID — the
  // provider retry loop turns this into "cite or refuse".
  .refine((value) => !value.inScope || value.citations.length > 0, {
    message: "in-scope answers must cite at least one source",
  });
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

/* ── Thermometer/display photo reading (§8.2/§14) ──────────────────────────── */

export const photoReadSchema = z
  .object({
    value: z.number().nullable(),
    unit: z.enum(["celsius", "fahrenheit", "unknown"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type PhotoRead = z.infer<typeof photoReadSchema>;
