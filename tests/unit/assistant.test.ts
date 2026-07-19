import { describe, expect, it } from "vitest";
import { assistantAnswerSchema } from "@/lib/ai/schemas";
import { assistantFixtureKey } from "@/lib/ai/runners/assistant";

describe("assistantAnswerSchema (§13: cite or refuse)", () => {
  it("accepts an in-scope answer WITH citations", () => {
    const result = assistantAnswerSchema.safeParse({
      inScope: true,
      answer: "Nedkøling fra 56 til 10 °C på højst 4 timer.",
      citations: [{ docId: "DK-HYGIEJNE", section: "kap. 26.7" }],
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS an in-scope answer without citations — the mechanical guarantee", () => {
    const result = assistantAnswerSchema.safeParse({
      inScope: true,
      answer: "Bare gør det hurtigt.",
      citations: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a refusal without citations", () => {
    const result = assistantAnswerSchema.safeParse({
      inScope: false,
      answer: "Det ligger uden for mit område — kontakt en konsulent.",
      citations: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("assistantFixtureKey", () => {
  it("slugs questions deterministically incl. Danish letters", () => {
    expect(assistantFixtureKey("Hvor hurtigt skal maden køles ned?")).toBe(
      "hvor-hurtigt-skal-maden-køles-ned",
    );
    expect(assistantFixtureKey("   ")).toBe("question");
  });
});
