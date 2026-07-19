"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { AiError } from "@/lib/ai/provider";
import { askAssistant } from "@/lib/ai/runners/assistant";
import type { AssistantAnswer } from "@/lib/ai/schemas";

const askSchema = z.object({
  siteId: z.uuid(),
  question: z.string().trim().min(3).max(600),
});

export type AskState =
  | { ok: true; answer: AssistantAnswer }
  | { error: "error" | "aiUnavailable" }
  | null;

/** §13 advisory chat — every run logged to ai_runs; grounding enforced by schema. */
export async function askAssistantAction(input: unknown): Promise<AskState> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { error: "error" };

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (!site) return { error: "error" };
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) return { error: "error" };

  try {
    const answer = await askAssistant({
      supabase,
      orgId: site.org_id,
      siteId: site.id,
      locale: await getLocale(),
      question: parsed.data.question,
    });
    return { ok: true, answer };
  } catch (err) {
    return { error: err instanceof AiError ? "aiUnavailable" : "error" };
  }
}
