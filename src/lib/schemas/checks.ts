import { z } from "zod";
import { checkValueSchema } from "@/lib/compliance/checks";

const deviationStepsInline = z
  .object({
    foodAssessment: z.enum(["kept", "moved", "discarded", "recalled", "na"]),
    correctiveAction: z.string().trim().min(1).max(2000),
    followUpHours: z.number().int().min(1).max(48),
    skipFollowUp: z.boolean(),
  })
  .strict();

export const completeTaskSchema = z.object({
  siteId: z.uuid(),
  taskId: z.uuid(),
  value: checkValueSchema,
  note: z.string().trim().max(2000).optional(),
  clientUuid: z.uuid(),
  clientCreatedAt: z.string().datetime({ offset: true }),
  photoPaths: z.array(z.string().max(300)).max(4).default([]),
  deviationSteps: deviationStepsInline.optional(),
});

export const deviationStepsSchema = z.object({
  siteId: z.uuid(),
  deviationId: z.uuid(),
  foodAssessment: z.enum(["kept", "moved", "discarded", "recalled", "na"]),
  correctiveAction: z.string().trim().min(1).max(2000),
  followUpHours: z.coerce.number().int().min(1).max(48).default(2),
  skipFollowUp: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const adHocSchema = z.object({
  siteId: z.uuid(),
  kind: z.enum(["temp", "note", "deviation"]),
  equipmentId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  tempC: z.coerce.number().min(-60).max(300).optional(),
  text: z.string().trim().max(2000).optional(),
  clientUuid: z.uuid().optional(),
  clientCreatedAt: z.string().datetime({ offset: true }).optional(),
});
