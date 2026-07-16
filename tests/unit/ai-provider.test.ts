import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AiError,
  FixtureProvider,
  getAiProvider,
  resetAiProviderForTests,
} from "@/lib/ai/provider";
import { wizardTurnSchema, importExtractionSchema } from "@/lib/ai/schemas";

afterEach(() => {
  resetAiProviderForTests();
  delete process.env.AI_PROVIDER;
});

describe("FixtureProvider (§14 test double)", () => {
  it("returns a schema-validated fixture", async () => {
    const provider = new FixtureProvider();
    const result = await provider.runStructured({
      feature: "risk_wizard",
      system: "irrelevant",
      messages: [],
      schema: wizardTurnSchema,
      schemaName: "wizard_turn",
      fixtureKey: "smoke-turn",
    });
    expect(result.output.done).toBe(false);
    expect(result.output.question?.chips.length).toBeGreaterThan(0);
    expect(result.model).toContain("fixture:");
  });

  it("rejects fixtures that violate the schema (fixtures stay honest)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kp-ai-"));
    mkdirSync(join(dir, "risk_wizard"), { recursive: true });
    writeFileSync(
      join(dir, "risk_wizard", "bad.json"),
      JSON.stringify({ done: "yes" }), // wrong type
    );
    const provider = new FixtureProvider(dir);
    await expect(
      provider.runStructured({
        feature: "risk_wizard",
        system: "",
        messages: [],
        schema: wizardTurnSchema,
        schemaName: "wizard_turn",
        fixtureKey: "bad",
      }),
    ).rejects.toThrow(AiError);
  });

  it("fails loudly on a missing fixture or fixtureKey", async () => {
    const provider = new FixtureProvider();
    await expect(
      provider.runStructured({
        feature: "ra_import_extract",
        system: "",
        messages: [],
        schema: importExtractionSchema,
        schemaName: "import",
        fixtureKey: "does-not-exist",
      }),
    ).rejects.toThrow(/missing AI fixture/);
    await expect(
      provider.runStructured({
        feature: "ra_import_extract",
        system: "",
        messages: [],
        schema: importExtractionSchema,
        schemaName: "import",
      }),
    ).rejects.toThrow(/fixtureKey/);
  });
});

describe("getAiProvider factory", () => {
  it("selects the fixture provider via AI_PROVIDER=fixture", () => {
    process.env.AI_PROVIDER = "fixture";
    expect(getAiProvider().name).toBe("fixture");
  });

  it("fails closed without a key (manual path stays available, §14)", () => {
    delete process.env.AI_PROVIDER;
    const hadKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => getAiProvider()).toThrow(AiError);
    } finally {
      if (hadKey) process.env.ANTHROPIC_API_KEY = hadKey;
    }
  });
});
