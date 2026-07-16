// Wizard runners (§7.2/§7.3): interview turns + section-by-section draft
// generation with the [DECISION] guardrails applied server-side.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { runAi } from "../run";
import { PROMPT_VERSIONS, wizardDraftSystem, wizardInterviewSystem } from "../prompts";
import {
  draftSectionSchema,
  wizardTurnSchema,
  type DraftSection,
  type WizardTurn,
} from "../schemas";
import { loadPackVersion } from "@/lib/compliance/pack";
import { compareStrictness } from "@/lib/compliance/limits";
import type { CompliancePack, PackLimit } from "@/lib/compliance/pack-schema";

type Client = SupabaseClient<Database>;

export type WizardAnswer = { questionId: string; question: string; answer: string };

export async function nextInterviewTurn(args: {
  supabase: Client;
  orgId: string;
  siteId: string;
  activityType: string;
  siteName: string;
  answers: WizardAnswer[];
}): Promise<WizardTurn> {
  const { pack, version } = await loadPackVersion(args.supabase, "DK");
  const template = pack.activityTemplates.find((t) => t.code === args.activityType);

  const result = await runAi(
    {
      supabase: args.supabase,
      orgId: args.orgId,
      siteId: args.siteId,
      promptVersion: PROMPT_VERSIONS.risk_wizard,
      inputRef: `wizard:${args.siteId}:turn-${args.answers.length + 1}`,
    },
    {
      feature: "risk_wizard",
      system: wizardInterviewSystem({
        packVersion: version,
        locale: "da",
        activityTemplateJson: JSON.stringify(template ?? {}),
        siteFactsJson: JSON.stringify({
          name: args.siteName,
          activityType: args.activityType,
        }),
        answeredSoFarJson: JSON.stringify(args.answers),
      }),
      messages: [
        {
          role: "user",
          content:
            args.answers.length === 0
              ? "Start the interview."
              : "Continue the interview based on the transcript in the system prompt.",
        },
      ],
      schema: wizardTurnSchema,
      schemaName: "wizard_turn",
      maxTokens: 2000,
      fixtureKey: `turn-${args.answers.length + 1}`,
    },
  );
  return result.output;
}

/** §7.3 guardrail: keep only limits that are STRICTLY TIGHTER than the pack default. */
export function clampTighterLimits(
  pack: CompliancePack,
  proposals: DraftSection["tighterLimits"],
): { accepted: Map<string, PackLimit>; rejected: string[] } {
  const accepted = new Map<string, PackLimit>();
  const rejected: string[] = [];
  for (const proposal of proposals) {
    const tpl = pack.controlPointTemplates.find((t) => t.key === proposal.templateKey);
    if (!tpl) {
      rejected.push(`${proposal.templateKey}: unknown template`);
      continue;
    }
    let candidate: PackLimit | null = null;
    if ("max" in tpl.defaultLimit && proposal.max !== null) {
      candidate = { max: proposal.max, unit: "°C" };
    } else if ("min" in tpl.defaultLimit && proposal.min !== null) {
      candidate = { min: proposal.min, unit: "°C" };
    }
    if (!candidate) {
      rejected.push(`${proposal.templateKey}: shape mismatch`);
      continue;
    }
    if (compareStrictness(tpl.defaultLimit, candidate) === "tighter") {
      accepted.set(proposal.templateKey, candidate);
    } else {
      // AI may NEVER loosen (§7.3 [DECISION]) — silently proposed loosenings
      // are dropped and reported for the quality console.
      rejected.push(`${proposal.templateKey}: not tighter than pack default`);
    }
  }
  return { accepted, rejected };
}

/** §7.3 completeness validator: every applying row needs hazards or an explicit reason. */
export function validateDraftCompleteness(sections: DraftSection[]): string[] {
  const problems: string[] = [];
  const seen = new Set(sections.map((s) => s.sectionKey));
  for (const key of ["modtagelse", "opbevaring", "tilberedning", "salg_servering", "transport", "andet"]) {
    if (!seen.has(key as DraftSection["sectionKey"])) problems.push(`missing section ${key}`);
  }
  for (const section of sections) {
    for (const row of section.rows) {
      if (!row.applies) continue;
      if (row.hazards.length === 0 && !row.notRelevantBecause_da) {
        problems.push(`${section.sectionKey}/${row.activityKey}: no hazards and no explicit reason`);
      }
      if (row.critical && row.controlPointKeys.length === 0) {
        problems.push(`${section.sectionKey}/${row.activityKey}: critical without control point`);
      }
    }
  }
  return problems;
}

export async function generateDraftSections(args: {
  supabase: Client;
  orgId: string;
  siteId: string;
  activityType: string;
  answers: WizardAnswer[];
  equipment: { kind: string; name: string }[];
}): Promise<{ sections: DraftSection[]; pack: CompliancePack; packVersion: string }> {
  const { pack, version } = await loadPackVersion(args.supabase, "DK");
  const sections: DraftSection[] = [];

  for (const section of pack.officialSkema.sections) {
    const result = await runAi(
      {
        supabase: args.supabase,
        orgId: args.orgId,
        siteId: args.siteId,
        promptVersion: PROMPT_VERSIONS.wizard_draft,
        inputRef: `draft:${args.siteId}:${section.key}`,
      },
      {
        feature: "wizard_draft",
        system: wizardDraftSystem({
          packVersion: version,
          sectionKey: section.key,
          officialSectionJson: JSON.stringify(section),
          controlPointTemplatesJson: JSON.stringify(
            pack.controlPointTemplates.map((t) => ({
              key: t.key,
              category: t.category,
              appliesTo: t.appliesTo,
              defaultLimit: t.defaultLimit,
            })),
          ),
          hazardLibraryJson: JSON.stringify(pack.hazardLibrary),
          transcriptJson: JSON.stringify(args.answers),
          equipmentJson: JSON.stringify(args.equipment),
        }),
        messages: [{ role: "user", content: `Draft the ${section.key} section.` }],
        schema: draftSectionSchema,
        schemaName: "draft_section",
        maxTokens: 16000,
        fixtureKey: `draft-${section.key}`,
      },
    );
    sections.push(result.output);
  }

  return { sections, pack, packVersion: version };
}

export function transcriptToJson(answers: WizardAnswer[]): Json {
  return { answers, updatedAt: new Date().toISOString() } as unknown as Json;
}
