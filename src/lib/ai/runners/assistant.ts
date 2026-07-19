// §13 compliance assistant: FTS retrieval over the official corpus + pack
// guidance + the site's own programme → answer with MANDATORY citations or a
// refusal. Grounding is exclusive (§3.3 [DECISION]) — enforcement lives in
// the Zod schema (in-scope without citations fails validation → retry/refuse).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runAi } from "../run";
import { PROMPT_VERSIONS, assistantSystem } from "../prompts";
import { assistantAnswerSchema, type AssistantAnswer } from "../schemas";
import { loadPackVersion } from "@/lib/compliance/pack";
import { pickText } from "@/lib/i18n/pick";
import { formatLimit } from "@/lib/compliance/limits";

type Client = SupabaseClient<Database>;

export function assistantFixtureKey(question: string): string {
  return (
    question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "question"
  );
}

/** Simple-config websearch FTS over the official corpus (738 chunks). */
export async function retrieveCorpusChunks(
  supabase: Client,
  question: string,
  limit = 6,
): Promise<{ docId: string; section: string | null; page: number; content: string }[]> {
  const { data } = await supabase
    .from("corpus_chunks")
    .select("doc_id, section, page_from, content")
    .textSearch("tsv", question, { type: "websearch", config: "simple" })
    .limit(limit);
  return (data ?? []).map((chunk) => ({
    docId: chunk.doc_id,
    section: chunk.section,
    page: chunk.page_from,
    content: chunk.content.slice(0, 1200),
  }));
}

export async function askAssistant(args: {
  supabase: Client;
  orgId: string;
  siteId: string;
  locale: string;
  question: string;
}): Promise<AssistantAnswer> {
  const [chunks, { pack }, { data: cps }] = await Promise.all([
    retrieveCorpusChunks(args.supabase, args.question),
    loadPackVersion(args.supabase, "DK"),
    args.supabase
      .from("control_points")
      .select("name_i18n, limit_json, frequency_json, source_ref")
      .eq("site_id", args.siteId)
      .eq("active", true),
  ]);

  const programme = (cps ?? []).map((cp) => ({
    name: pickText(cp.name_i18n, args.locale),
    limit: (() => {
      try {
        return formatLimit(cp.limit_json);
      } catch {
        return "";
      }
    })(),
    frequency: cp.frequency_json,
    sourceRef: cp.source_ref,
  }));

  const result = await runAi(
    {
      supabase: args.supabase,
      orgId: args.orgId,
      siteId: args.siteId,
      promptVersion: PROMPT_VERSIONS.assistant,
      inputRef: `assistant:${args.siteId}`,
    },
    {
      feature: "assistant",
      system: assistantSystem({
        locale: args.locale,
        corpusChunksJson: JSON.stringify(chunks),
        guidanceJson: JSON.stringify(pack.guidance),
        programmeJson: JSON.stringify(programme),
      }),
      messages: [{ role: "user", content: args.question }],
      schema: assistantAnswerSchema,
      schemaName: "assistant_answer",
      maxTokens: 2000,
      fixtureKey: assistantFixtureKey(args.question),
    },
  );
  return result.output;
}
