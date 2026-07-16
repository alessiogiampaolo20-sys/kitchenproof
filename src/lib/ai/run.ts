// AI runner: provider call + mandatory ai_runs logging (§14 rule 2).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  getAiProvider,
  AiError,
  type AiFeature,
  type StructuredRequest,
  type StructuredResult,
} from "./provider";

type Client = SupabaseClient<Database>;

export type AiRunContext = {
  supabase: Client;
  orgId: string;
  siteId?: string;
  promptVersion: string;
  inputRef?: string;
};

export async function runAi<T>(
  context: AiRunContext,
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const provider = getAiProvider();
  const log = async (fields: {
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
    error?: string;
  }) => {
    await context.supabase.from("ai_runs").insert({
      org_id: context.orgId,
      site_id: context.siteId ?? null,
      feature: request.feature satisfies AiFeature,
      model: fields.model,
      prompt_version: context.promptVersion,
      input_ref: context.inputRef ?? null,
      tokens_in: fields.tokensIn ?? null,
      tokens_out: fields.tokensOut ?? null,
      latency_ms: fields.latencyMs ?? null,
      error: fields.error ?? null,
    });
  };

  try {
    const result = await provider.runStructured(request);
    await log({
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await log({ model: provider.name, error: message });
    throw err instanceof AiError ? err : new AiError(message, true);
  }
}

/** Marks the quality outcome once a human has reviewed the output (§14 rule 2). */
export async function markAiOutcome(
  supabase: Client,
  aiRunFilter: { orgId: string; feature: AiFeature; inputRef: string },
  outcome: { accepted: boolean; edited: boolean },
): Promise<void> {
  // ai_runs is append-only: outcomes are recorded as a linked follow-up row.
  await supabase.from("ai_runs").insert({
    org_id: aiRunFilter.orgId,
    feature: aiRunFilter.feature,
    model: "outcome",
    prompt_version: "outcome",
    input_ref: aiRunFilter.inputRef,
    accepted: outcome.accepted,
    edited: outcome.edited,
  });
}
