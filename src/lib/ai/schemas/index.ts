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

/* ── Thermometer/display photo reading (§8.2/§14) ──────────────────────────── */

export const photoReadSchema = z
  .object({
    value: z.number().nullable(),
    unit: z.enum(["celsius", "fahrenheit", "unknown"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type PhotoRead = z.infer<typeof photoReadSchema>;
