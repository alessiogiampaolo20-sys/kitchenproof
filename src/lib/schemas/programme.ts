import { z } from "zod";

export const startTemplateSchema = z.object({ siteId: z.uuid() });

export const approveSchema = z.object({
  siteId: z.uuid(),
  riskAnalysisId: z.uuid(),
});

const timesSchema = z
  .string()
  .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(6));

export const editControlPointSchema = z.object({
  siteId: z.uuid(),
  controlPointId: z.uuid(),
  // limit values — presence depends on the CP's limit shape
  max: z.coerce.number().optional(),
  min: z.coerce.number().optional(),
  coolFrom: z.coerce.number().optional(),
  coolTo: z.coerce.number().optional(),
  withinMinutes: z.coerce.number().int().positive().optional(),
  times: timesSchema.optional(),
  justification: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((s) => (s === "" ? undefined : s)),
});

export const toggleControlPointSchema = z.object({
  siteId: z.uuid(),
  controlPointId: z.uuid(),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const createControlPointSchema = z.object({
  siteId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  category: z.enum(["temperature", "cleaning", "receiving", "pest", "hygiene", "other"]),
  limitType: z.enum(["max", "min", "checklist"]),
  value: z.coerce.number().optional(),
  times: timesSchema,
  monitoringMethod: z.enum(["manual_temp", "photo_temp", "photo_only", "checklist", "probe"]),
  equipmentId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
});
