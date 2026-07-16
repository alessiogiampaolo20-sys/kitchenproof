import { z } from "zod";
import { checkValueSchema } from "@/lib/compliance/checks";

export const completeTaskSchema = z.object({
  siteId: z.uuid(),
  taskId: z.uuid(),
  value: checkValueSchema,
  note: z.string().trim().max(2000).optional(),
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
});
