import { z } from "zod";

/**
 * Compliance pack schema (§3.2). Enforces the §3.3 grounding rules at parse
 * time: every control point template, limit and guidance text carries a
 * sourceRef into the official corpus; gaps must be explicit TODO(pack-review)
 * markers — never silently filled.
 */

export const CORPUS_DOC_IDS = [
  "DK-RA-SKEMA",
  "DK-RA-SKEMA-EN",
  "DK-EK-EXAMPLE",
  "DK-HYGIEJNE",
  "DK-AUTORISATION",
  "DK-KONTROL-BILAG",
  "DK-INSPECT-EN",
] as const;

export const sourceRefSchema = z.object({
  docId: z.enum(CORPUS_DOC_IDS),
  section: z.string().min(1),
  page: z.number().int().positive(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/** Localized string: da + en mandatory in the DK pack (§18 gate); it optional. */
export const i18nSchema = z
  .object({
    da: z.string().min(1),
    en: z.string().min(1),
    it: z.string().min(1).optional(),
  })
  .strict();
export type I18nText = z.infer<typeof i18nSchema>;

/**
 * Which temperature a limit is about (DK-HYGIEJNE kap. 26.2, p. 57):
 * "Temperaturkravene i hygiejneforordningen for animalske fødevarer og i
 * dybfrostbekendtgørelsen er i de fleste tilfælde produkttemperaturer, mens
 * temperaturbestemmelserne i hygiejnebekendtgørelsen er omgivelsestemperaturer."
 *
 * It matters because checking a fridge's air against a limit written for the
 * food itself (or the reverse) produces a wrong verdict in either direction.
 * Optional so packs and site limits written before this stay valid — but a
 * reading whose kind is unknown is not evaluated, it is asked about.
 */
export const measurementKindSchema = z.enum(["product", "ambient"]);
export type MeasurementKind = z.infer<typeof measurementKindSchema>;

export const limitSchema = z.union([
  z
    .object({
      max: z.number(),
      unit: z.literal("°C"),
      measurementKind: measurementKindSchema.optional(),
    })
    .strict(),
  z
    .object({
      min: z.number(),
      unit: z.literal("°C"),
      measurementKind: measurementKindSchema.optional(),
    })
    .strict(),
  z
    .object({
      coolFrom: z.number(),
      coolTo: z.number(),
      withinMinutes: z.number().int().positive(),
      unit: z.literal("°C"),
      measurementKind: measurementKindSchema.optional(),
    })
    .strict(),
  z.object({ checklist: z.literal(true) }).strict(),
]);
export type PackLimit = z.infer<typeof limitSchema>;

export const frequencySchema = z.union([
  // Scheduled: rrule (day granularity) + wall-clock times in the site TZ.
  z
    .object({
      rrule: z.string().startsWith("FREQ="),
      times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
      dueWindowMinutes: z.number().int().positive().default(120),
    })
    .strict(),
  // Event-driven (per delivery / per batch): no scheduled tasks are
  // materialized; records come from the corresponding flow (Phase 2/5).
  z.object({ perEvent: z.literal(true) }).strict(),
]);
export type PackFrequency = z.infer<typeof frequencySchema>;

export const MONITORING_METHODS = [
  "manual_temp",
  "photo_temp",
  "photo_only",
  "checklist",
  "probe",
] as const;

export const controlPointTemplateSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    category: z.enum(["temperature", "cleaning", "receiving", "pest", "hygiene", "other"]),
    name: i18nSchema,
    appliesTo: z.array(z.string()).min(1), // "equipment:fridge" | "process:cooling" | "area:kitchen" | "supplier:*"
    defaultLimit: limitSchema,
    defaultFrequency: frequencySchema,
    monitoringMethod: z.enum(MONITORING_METHODS),
    instructions: i18nSchema,
    correctiveGuidance: i18nSchema,
    legalBasis: z.string().min(1),
    sourceRef: sourceRefSchema, // REQUIRED — §3.3 rule (a)
    /**
     * Where `defaultLimit.measurementKind` comes from. It is a different
     * citation from `sourceRef`: the threshold is set in one section, the
     * product/ambient rule in kap. 26.2 — and §3.3(a) wants every limit fact
     * traceable, not just the number.
     */
    measurementKindRef: sourceRefSchema.optional(),
    notes: z.string().optional(),
  })
  .strict();
export type ControlPointTemplate = z.infer<typeof controlPointTemplateSchema>;

export const hazardEntrySchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    category: z.enum(["micro", "chemical", "physical", "allergen"]),
    description: i18nSchema,
    controlMeasure: i18nSchema,
    sourceRef: sourceRefSchema.optional(),
    todo: z.string().startsWith("TODO(pack-review)").optional(),
  })
  .strict()
  .refine((h) => h.sourceRef !== undefined || h.todo !== undefined, {
    message: "hazard entries need a sourceRef or an explicit TODO(pack-review) marker",
  });
export type HazardEntry = z.infer<typeof hazardEntrySchema>;

/** Official skema structure (§3.3.1) — 6 sections with their official rows. */
export const skemaRowSchema = z
  .object({
    key: z.string(), // e.g. "modtagelse.chilled"
    name: i18nSchema,
    defaultTexts: z
      .object({
        whatYouDo: i18nSchema.optional(),
        whatCanGoWrong: i18nSchema.optional(),
        controlMeasures: i18nSchema.optional(),
        ifItGoesWrong: i18nSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const skemaSectionSchema = z
  .object({
    key: z.enum(["modtagelse", "opbevaring", "tilberedning", "salg_servering", "transport", "andet"]),
    name: i18nSchema,
    rows: z.array(skemaRowSchema).min(1),
    sourceRef: sourceRefSchema,
  })
  .strict();

export const activityRowConfigSchema = z
  .object({
    applies: z.boolean(),
    critical: z.boolean(),
    controlPointKeys: z.array(z.string()).default([]),
    hazardKeys: z.array(z.string()).default([]),
    texts: z
      .object({
        whatYouDo: i18nSchema.optional(),
        whatCanGoWrong: i18nSchema.optional(),
        controlMeasures: i18nSchema.optional(),
        ifItGoesWrong: i18nSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ACTIVITY_TYPE_CODES = [
  "restaurant",
  "cafe",
  "takeaway",
  "canteen",
  "bakery",
  "butcher",
  "catering",
  "foodtruck",
  "retail_kiosk",
  "hotel_breakfast",
  "small_producer",
  "wholesale_small",
] as const;

export const activityTemplateSchema = z
  .object({
    code: z.enum(ACTIVITY_TYPE_CODES),
    name: i18nSchema,
    focus: i18nSchema, // typical CCP/OPRP focus (§2 table)
    equipmentSuggestions: z.array(
      z
        .object({
          kind: z.enum(["fridge", "freezer", "hot_holding", "dishwasher", "probe", "oven", "blast_chiller", "other"]),
          count: z.number().int().positive(),
          name: i18nSchema,
        })
        .strict(),
    ),
    rows: z.record(z.string(), activityRowConfigSchema),
    branchekode: z.string().startsWith("TODO(pack-review)"), // not in provided corpus (§3.3)
  })
  .strict();
export type ActivityTemplate = z.infer<typeof activityTemplateSchema>;

export const guidanceEntrySchema = z
  .object({
    key: z.string(),
    topic: z.string(),
    text: i18nSchema,
    sourceRef: sourceRefSchema, // REQUIRED — guidance is regulatory content (§3.3)
    officialUrl: z.string().url().optional(),
  })
  .strict();

export const packSchema = z
  .object({
    pack: z.literal("DK"),
    version: z.string().regex(/^\d{4}\.\d{2}$/),
    authority: z
      .object({
        name: z.string(),
        agencyNote: z.string().optional(),
        inspectionScheme: z.string(),
        publicRegistry: z.string(),
      })
      .strict(),
    locales: z.array(z.enum(["da", "en", "it"])).min(2),
    corpus: z.array(
      z
        .object({
          docId: z.enum(CORPUS_DOC_IDS),
          title: z.string(),
          version: z.string().min(1), // freeform label from §3.3 (never fabricate dates)
          versionDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(), // only when the document states it
          file: z.string(),
          pages: z.number().int().positive(),
          lang: z.enum(["da", "en"]),
        })
        .strict(),
    ),
    officialSkema: z.object({ sections: z.array(skemaSectionSchema).length(6) }).strict(),
    controlPointTemplates: z.array(controlPointTemplateSchema).min(1),
    // Standing prerequisite programmes instantiated for EVERY site regardless
    // of skema rows (DK-EK-EXAMPLE p. 3: cleaning, personal hygiene,
    // maintenance/pest control, training).
    prerequisiteControlPointKeys: z.array(z.string()).min(1),
    hazardLibrary: z.array(hazardEntrySchema).min(1),
    activityTemplates: z.array(activityTemplateSchema).length(12),
    traceability: z
      .object({
        retentionYearsDefault: z.number(),
        retentionMonthsPerishable: z.number(),
        requiredFields: z.array(z.string()).min(1),
        sourceRef: sourceRefSchema,
      })
      .strict(),
    documentRetention: z
      .object({ selfControlMonths: z.number(), archiveYears: z.number() })
      .strict(),
    revisionTriggers: z
      .object({
        repeatedDeviationCount: z.number(),
        windowDays: z.number(),
        annualReview: z.literal(true),
        sourceRef: sourceRefSchema,
      })
      .strict(),
    guidance: z.array(guidanceEntrySchema),
  })
  .strict();

export type CompliancePack = z.infer<typeof packSchema>;

/** Cross-reference checks Zod cannot express — §3.3.1 validator rules included. */
export function validatePack(pack: CompliancePack): string[] {
  const errors: string[] = [];
  const cpKeys = new Set(pack.controlPointTemplates.map((t) => t.key));
  for (const k of pack.prerequisiteControlPointKeys) {
    if (!cpKeys.has(k)) errors.push(`prerequisite: unknown control point "${k}"`);
  }
  const hazardKeys = new Set(pack.hazardLibrary.map((h) => h.key));
  const rowKeys = new Set(
    pack.officialSkema.sections.flatMap((s) => s.rows.map((r) => r.key)),
  );

  for (const tpl of pack.activityTemplates) {
    for (const [rowKey, cfg] of Object.entries(pack ? tpl.rows : {})) {
      if (!rowKeys.has(rowKey)) {
        errors.push(`${tpl.code}: unknown skema row "${rowKey}"`);
      }
      for (const k of cfg.controlPointKeys) {
        if (!cpKeys.has(k)) errors.push(`${tpl.code}/${rowKey}: unknown control point "${k}"`);
      }
      for (const k of cfg.hazardKeys) {
        if (!hazardKeys.has(k)) errors.push(`${tpl.code}/${rowKey}: unknown hazard "${k}"`);
      }
      // §3.3.1: critical rows MUST have monitoring control points
      if (cfg.critical && cfg.controlPointKeys.length === 0) {
        errors.push(`${tpl.code}/${rowKey}: critical row without a monitoring control point`);
      }
      if (cfg.critical && !cfg.applies) {
        errors.push(`${tpl.code}/${rowKey}: critical row must also apply`);
      }
    }
  }
  return errors;
}

export function parsePack(content: unknown): CompliancePack {
  const pack = packSchema.parse(content);
  const errors = validatePack(pack);
  if (errors.length > 0) {
    throw new Error(`pack cross-reference validation failed:\n${errors.join("\n")}`);
  }
  return pack;
}
