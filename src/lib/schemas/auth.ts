import { z } from "zod";
import { LOCALES } from "@/lib/i18n/config";

export const signupSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(8).max(200),
  locale: z.enum(LOCALES).default("da"),
  next: z.string().startsWith("/").optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
  next: z.string().startsWith("/").optional(),
});
