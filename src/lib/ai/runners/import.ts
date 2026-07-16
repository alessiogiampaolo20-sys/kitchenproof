// §7.5 extraction runner: original files → ImportExtraction via Claude vision
// (photos/PDF as native blocks; DOCX/XLSX text-extracted first). The fixture
// provider keys on the first file's basename, so CI never touches the API.
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runAi } from "../run";
import { PROMPT_VERSIONS, importExtractSystem } from "../prompts";
import { importExtractionSchema, type ImportExtraction } from "../schemas";
import { loadPackVersion } from "@/lib/compliance/pack";

type Client = SupabaseClient<Database>;

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function extension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`# Sheet: ${sheet.name}`);
    sheet.eachRow((row, rowNumber) => {
      const cells = (row.values as unknown[])
        .slice(1) // exceljs row.values is 1-based
        .map((v) => (v == null ? "" : String(v)));
      lines.push(`${rowNumber}: ${cells.join(" | ")}`);
    });
  });
  return lines.join("\n");
}

/** Builds the user-message content blocks for the document set. */
async function buildContentBlocks(
  supabase: Client,
  filePaths: string[],
): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const path of filePaths) {
    const { data, error } = await supabase.storage.from("imports").download(path);
    if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = extension(path);
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
    } else if (ext === "docx") {
      blocks.push({
        type: "text",
        text: `DOCX document "${path}" (raw text):\n${await extractDocxText(buffer)}`,
      });
    } else if (ext === "xlsx") {
      blocks.push({
        type: "text",
        text: `XLSX workbook "${path}" (cells):\n${await extractXlsxText(buffer)}`,
      });
    } else {
      throw new Error(`unsupported import file type: ${path}`);
    }
  }
  blocks.push({
    type: "text",
    text: "Extract this document set into the official skema structure. Follow the absolute rules.",
  });
  return blocks;
}

export function importFixtureKey(filePaths: string[]): string {
  const name = filePaths[0]?.split("/").pop() ?? "import";
  return name.replace(/\.[^.]+$/, "");
}

export async function extractImportFiles(args: {
  supabase: Client;
  orgId: string;
  siteId: string;
  importId: string;
  filePaths: string[];
}): Promise<ImportExtraction> {
  const { pack, version } = await loadPackVersion(args.supabase, "DK");
  const fixtureKey = importFixtureKey(args.filePaths);

  // fixture mode never needs the binary content; only build blocks for Claude
  const content: Anthropic.ContentBlockParam[] =
    process.env.AI_PROVIDER === "fixture"
      ? [{ type: "text", text: `fixture:${fixtureKey}` }]
      : await buildContentBlocks(args.supabase, args.filePaths);

  const result = await runAi(
    {
      supabase: args.supabase,
      orgId: args.orgId,
      siteId: args.siteId,
      promptVersion: PROMPT_VERSIONS.ra_import_extract,
      inputRef: `import:${args.importId}`,
    },
    {
      feature: "ra_import_extract",
      system: importExtractSystem({
        packVersion: version,
        officialSkemaJson: JSON.stringify(pack.officialSkema),
      }),
      messages: [{ role: "user", content }],
      schema: importExtractionSchema,
      schemaName: "import_extraction",
      maxTokens: 32000,
      fixtureKey,
    },
  );
  return result.output;
}
