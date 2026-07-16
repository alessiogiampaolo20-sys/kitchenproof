// §9.1 invoice extraction + §9.1(3) new-product enrichment runners.
// Photos/PDF go to Claude vision natively; the fixture provider keys on the
// first file's basename (CI and the 5-invoice DoD fixture set never hit the API).
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runAi } from "../run";
import {
  PROMPT_VERSIONS,
  invoiceExtractSystem,
  productEnrichSystem,
} from "../prompts";
import {
  invoiceExtractionSchema,
  productEnrichSchema,
  type InvoiceExtraction,
  type ProductEnrichment,
} from "../schemas";

type Client = SupabaseClient<Database>;

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function invoiceFixtureKey(filePaths: string[]): string {
  const name = filePaths[0]?.split("/").pop() ?? "invoice";
  return name.replace(/\.[^.]+$/, "");
}

async function buildContentBlocks(
  supabase: Client,
  filePaths: string[],
): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const path of filePaths) {
    const { data, error } = await supabase.storage.from("invoices").download(path);
    if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (IMAGE_TYPES[ext]) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: IMAGE_TYPES[ext],
          data: buffer.toString("base64"),
        },
      });
    } else if (ext === "pdf") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      });
    } else {
      throw new Error(`unsupported invoice file type: ${path}`);
    }
  }
  blocks.push({
    type: "text",
    text: "Extract this document. Follow the absolute rules.",
  });
  return blocks;
}

export async function extractInvoiceFiles(args: {
  supabase: Client;
  orgId: string;
  siteId: string;
  invoiceId: string;
  filePaths: string[];
}): Promise<InvoiceExtraction> {
  const fixtureKey = invoiceFixtureKey(args.filePaths);
  const content: Anthropic.ContentBlockParam[] =
    process.env.AI_PROVIDER === "fixture"
      ? [{ type: "text", text: `fixture:${fixtureKey}` }]
      : await buildContentBlocks(args.supabase, args.filePaths);

  const result = await runAi(
    {
      supabase: args.supabase,
      orgId: args.orgId,
      siteId: args.siteId,
      promptVersion: PROMPT_VERSIONS.invoice_extract,
      inputRef: `invoice:${args.invoiceId}`,
    },
    {
      feature: "invoice_extract",
      system: invoiceExtractSystem(),
      messages: [{ role: "user", content }],
      schema: invoiceExtractionSchema,
      schemaName: "invoice_extraction",
      maxTokens: 16000,
      fixtureKey,
    },
  );
  return result.output;
}

/** §9.1 step 3: classify products the catalog has never seen (AI-suggested). */
export async function enrichNewProducts(args: {
  supabase: Client;
  orgId: string;
  siteId: string;
  invoiceId: string;
  descriptions: string[];
  /** deterministic fixture id, e.g. `enrich-<invoice fixture key>` */
  fixtureKey: string;
}): Promise<ProductEnrichment> {
  if (args.descriptions.length === 0) return { products: [] };
  const result = await runAi(
    {
      supabase: args.supabase,
      orgId: args.orgId,
      siteId: args.siteId,
      promptVersion: PROMPT_VERSIONS.product_enrich,
      inputRef: `invoice:${args.invoiceId}:enrich`,
    },
    {
      feature: "product_enrich",
      system: productEnrichSystem(),
      messages: [
        {
          role: "user",
          content: `New product line descriptions:\n${JSON.stringify(args.descriptions)}`,
        },
      ],
      schema: productEnrichSchema,
      schemaName: "product_enrichment",
      maxTokens: 8000,
      fixtureKey: args.fixtureKey,
    },
  );
  return result.output;
}
