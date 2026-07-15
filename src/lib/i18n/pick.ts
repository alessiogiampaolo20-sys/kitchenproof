import type { Json } from "@/lib/supabase/database.types";
import { DEFAULT_LOCALE } from "./config";

/** Picks a localized string from an i18n jsonb column ({da, en, it?}). */
export function pickText(value: Json | null | undefined, locale: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const candidate = record[locale] ?? record[DEFAULT_LOCALE] ?? record.en;
  return typeof candidate === "string" ? candidate : "";
}
