import { z } from "zod";

export const wizardAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1000),
});

export const wizardTurnInputSchema = z.object({
  siteId: z.uuid(),
  answers: z.array(wizardAnswerSchema).max(30),
});

export const generateDraftInputSchema = z.object({
  siteId: z.uuid(),
  answers: z.array(wizardAnswerSchema).min(1).max(30),
});

export const editRaRowSchema = z.object({
  siteId: z.uuid(),
  rowId: z.uuid(),
  applies: z.enum(["true", "false"]).transform((v) => v === "true"),
  critical: z.enum(["true", "false"]).transform((v) => v === "true"),
  whatYouDo: z.string().trim().max(2000),
  whatCanGoWrong: z.string().trim().max(2000),
  controlMeasures: z.string().trim().max(2000),
  ifItGoesWrong: z.string().trim().max(2000),
});
