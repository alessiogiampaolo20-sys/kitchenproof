// AI provider abstraction (§14): every feature goes through here. Claude first,
// models swappable per feature; a deterministic fixture provider serves tests
// and CI (never the real API — secrets stay out of pipelines).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { z } from "zod";

export type AiFeature =
  | "risk_wizard"
  | "wizard_draft"
  | "ra_import_extract"
  | "invoice_extract"
  | "product_enrich"
  | "photo_read"
  | "assistant"
  | "deviation_polish";

/** §14 model table [DEFAULT] — wizard/extraction on Sonnet, light tasks on Haiku. */
export const AI_MODELS: Record<AiFeature, string> = {
  risk_wizard: "claude-sonnet-5",
  wizard_draft: "claude-sonnet-5",
  ra_import_extract: "claude-sonnet-5",
  invoice_extract: "claude-sonnet-5",
  product_enrich: "claude-haiku-4-5",
  photo_read: "claude-haiku-4-5",
  assistant: "claude-sonnet-5",
  deviation_polish: "claude-haiku-4-5",
};

export type StructuredRequest<T> = {
  feature: AiFeature;
  system: string;
  messages: Anthropic.MessageParam[];
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
  /** Deterministic fixture id — used ONLY by the fixture provider. */
  fixtureKey?: string;
};

export type StructuredResult<T> = {
  output: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempts: number;
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiProvider {
  readonly name: string;
  runStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/* ── Claude (production) ───────────────────────────────────────────────────── */

export class ClaudeProvider implements AiProvider {
  readonly name = "claude";
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new AiError("ANTHROPIC_API_KEY is not configured", false);
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async runStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const model = AI_MODELS[request.feature];
    const started = Date.now();
    let lastError = "";

    // §14 rule 1: Zod-parse failure → retry ≤2 with validator feedback appended
    for (let attempt = 1; attempt <= 3; attempt++) {
      const messages: Anthropic.MessageParam[] =
        attempt === 1
          ? request.messages
          : [
              ...request.messages,
              {
                role: "user",
                content: `Your previous output failed validation: ${lastError}. Return output that strictly matches the required schema.`,
              },
            ];
      try {
        const response = await this.client.messages.parse({
          model,
          max_tokens: request.maxTokens ?? 8000,
          system: request.system,
          messages,
          output_config: {
            format: zodOutputFormat(request.schema),
          },
        });
        if (response.parsed_output == null) {
          lastError = `stop_reason=${response.stop_reason}, no parsed output`;
          continue;
        }
        return {
          output: response.parsed_output,
          model,
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          latencyMs: Date.now() - started,
          attempts: attempt,
        };
      } catch (err) {
        if (err instanceof Anthropic.APIError) {
          const retryable = err.status === 429 || (err.status ?? 500) >= 500;
          if (!retryable) throw new AiError(`${err.status}: ${err.message}`, false);
          lastError = err.message;
        } else {
          lastError = err instanceof Error ? err.message : "unknown";
        }
      }
    }
    throw new AiError(`AI output failed validation after retries: ${lastError}`, true);
  }
}

/* ── Fixture (tests/CI/dev without a key): deterministic, schema-checked ───── */

export class FixtureProvider implements AiProvider {
  readonly name = "fixture";

  constructor(private baseDir = resolve(process.cwd(), "fixtures/ai")) {}

  async runStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (!request.fixtureKey) {
      throw new AiError(`fixture provider needs a fixtureKey for ${request.feature}`, false);
    }
    const path = resolve(this.baseDir, request.feature, `${request.fixtureKey}.json`);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new AiError(`missing AI fixture: ${request.feature}/${request.fixtureKey}`, false);
    }
    // fixtures must satisfy the same contract as real outputs
    const parsed = request.schema.safeParse(raw);
    if (!parsed.success) {
      throw new AiError(
        `fixture ${request.feature}/${request.fixtureKey} violates schema: ${parsed.error.message}`,
        false,
      );
    }
    return {
      output: parsed.data,
      model: `fixture:${AI_MODELS[request.feature]}`,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      attempts: 1,
    };
  }
}

/* ── Factory ───────────────────────────────────────────────────────────────── */

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const mode = process.env.AI_PROVIDER;
  if (mode === "fixture") {
    cached = new FixtureProvider();
  } else if (process.env.ANTHROPIC_API_KEY) {
    cached = new ClaudeProvider();
  } else {
    // §14: AI is never a hard dependency — callers surface the manual path.
    throw new AiError(
      "No AI provider available: set ANTHROPIC_API_KEY or AI_PROVIDER=fixture",
      false,
    );
  }
  return cached;
}

export function resetAiProviderForTests(): void {
  cached = null;
}
