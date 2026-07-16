import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeName, similarity } from "@/lib/inventory/similarity";
import {
  matchProduct,
  matchSupplier,
  totalMismatch,
  totalNeedsReview,
  MATCH_AUTO_THRESHOLD,
} from "@/lib/inventory/matching";
import { planBatch } from "@/lib/inventory/batch-plan";
import {
  invoiceExtractionSchema,
  productEnrichSchema,
  type InvoiceExtraction,
  type InvoiceLine,
} from "@/lib/ai/schemas";

function loadFixture(name: string): InvoiceExtraction {
  const raw = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "fixtures/ai/invoice_extract", `${name}.json`),
      "utf8",
    ),
  );
  return invoiceExtractionSchema.parse(raw);
}

const FIXTURES = [
  "dansk-cater-faktura",
  "grossisten-flerside",
  "torvehal-folgeseddel",
  "dansk-cater-kreditnota",
  "dansk-cater-faktura-kopi",
];

function mkLine(overrides: Partial<InvoiceLine>): InvoiceLine {
  return {
    rawText: "X",
    description: "X",
    quantity: null,
    unit: null,
    unitsPerBox: null,
    unitPrice: null,
    lineTotal: null,
    lotCode: null,
    expiryDate: null,
    gtin: null,
    isFood: true,
    confidence: 0.9,
    page: 1,
    ...overrides,
  };
}

describe("normalizeName (§9.1 matching key)", () => {
  it("strips quantities, units and punctuation", () => {
    expect(normalizeName("MOZZARELLA FIOR DI LATTE 8X125G KS")).toBe(
      "mozzarella fior di latte",
    );
    expect(normalizeName("Sødmælk 1L")).toBe("sødmælk");
    expect(normalizeName("OKSEKØD HAKKET 8-12% 5KG")).toBe("oksekød hakket");
  });

  it("maps English synonyms onto the Danish catalog key", () => {
    expect(normalizeName("Onions 10 kg")).toBe("løg");
    expect(normalizeName("chicken breast")).toBe("kylling breast");
  });
});

describe("similarity (trigram, pg_trgm-style)", () => {
  it("identical → 1, disjoint → 0, close variants score high", () => {
    expect(similarity("mozzarella", "mozzarella")).toBe(1);
    expect(similarity("mozzarella", "xyz")).toBe(0);
    expect(similarity("mozzarella fior di latte", "mozzarella fior latte")).toBeGreaterThan(0.6);
  });
});

describe("matchSupplier (§9.1 step 1)", () => {
  const candidates = [
    { id: "s1", name: "Dansk Cater A/S", cvr: "12345678", postal_code: "2600" },
    { id: "s2", name: "Grossisten Nord ApS", cvr: null, postal_code: "8000" },
  ];

  it("CVR wins even with a different display name", () => {
    const match = matchSupplier(
      { name: "DANSK CATER", cvr: "12 34 56 78", address: null, city: null, postal: null, country: null, email: null },
      candidates,
    );
    expect(match).toEqual({ action: "matched", supplierId: "s1", by: "cvr" });
  });

  it("falls back to fuzzy name+postal", () => {
    const match = matchSupplier(
      { name: "Grossisten Nord", cvr: null, address: null, city: null, postal: "8000", country: null, email: null },
      candidates,
    );
    expect(match).toEqual({ action: "matched", supplierId: "s2", by: "fuzzy" });
  });

  it("unknown supplier → create (flagged ai_created downstream)", () => {
    const match = matchSupplier(
      { name: "Helt Ny Leverandør", cvr: null, address: null, city: null, postal: null, country: null, email: null },
      candidates,
    );
    expect(match).toEqual({ action: "create" });
  });
});

describe("matchProduct (§9.1 step 2, thresholds [DEFAULT])", () => {
  const catalog = [
    { id: "p1", normalized_name: "mozzarella fior di latte", merged_into_id: null },
    { id: "p2", normalized_name: "sødmælk", merged_into_id: null },
    { id: "p3", normalized_name: "mozzarella fior di latte", merged_into_id: "p1" },
  ];

  it("≥0.90 auto-matches", () => {
    const match = matchProduct(
      mkLine({ rawText: "MOZZARELLA FIOR DI LATTE 8X125G", description: "Mozzarella fior di latte" }),
      null,
      catalog,
      [],
    );
    expect(match.action).toBe("auto");
    expect(match.productId).toBe("p1");
    expect(match.confidence).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
  });

  it("0.60–0.90 suggests (one-tap accept) — e.g. typos on a known product", () => {
    const match = matchProduct(
      mkLine({ description: "Mozarella fior di late" }), // handwriting typos
      null,
      catalog,
      [],
    );
    expect(match.action).toBe("suggest");
    expect(match.productId).toBe("p1");
  });

  it("<0.60 proposes create-new", () => {
    const match = matchProduct(
      mkLine({ description: "Basilikum frisk" }),
      null,
      catalog,
      [],
    );
    expect(match.action).toBe("create");
    expect(match.productId).toBeNull();
  });

  it("purchase history for the same supplier is the strongest signal", () => {
    const history = [
      { supplier_id: "s1", raw_text: "MOZZ. FIOR DI LATTE 8X125G KS", product_id: "p2" },
    ];
    const match = matchProduct(
      mkLine({ rawText: "MOZZ. FIOR DI LATTE 8X125G KS", description: "Fior di latte" }),
      "s1",
      catalog,
      history,
    );
    expect(match.action).toBe("auto");
    expect(match.productId).toBe("p2"); // history overrides name similarity
  });

  it("merged duplicates never match (§9.2)", () => {
    const onlyMerged = [{ id: "p3", normalized_name: "mozzarella fior di latte", merged_into_id: "p1" }];
    const match = matchProduct(
      mkLine({ description: "Mozzarella fior di latte" }),
      null,
      onlyMerged,
      [],
    );
    expect(match.action).toBe("create");
  });
});

describe("total sanity check (§9.1: mismatch >2% flags review)", () => {
  it("consistent totals pass", () => {
    const clean = loadFixture("dansk-cater-faktura");
    expect(totalMismatch(clean)).toBeLessThanOrEqual(0.02);
    expect(totalNeedsReview(clean)).toBe(false);
  });

  it("a >2% gap flags review", () => {
    const clean = loadFixture("dansk-cater-faktura");
    const skewed = { ...clean, totalAmount: clean.totalAmount! * 1.1 };
    expect(totalNeedsReview(skewed)).toBe(true);
  });

  it("credit notes (negative totals) are checked on absolute value", () => {
    const credit = loadFixture("dansk-cater-kreditnota");
    expect(totalNeedsReview(credit)).toBe(false);
  });

  it("no printed total → no check (delivery notes)", () => {
    const note = loadFixture("torvehal-folgeseddel");
    expect(totalMismatch(note)).toBeNull();
  });
});

describe("planBatch (§9.1 step 4)", () => {
  it("printed lot and printed expiry win (use_by)", () => {
    const plan = planBatch({
      line: mkLine({ quantity: 6, unit: "pcs", lotCode: "L2607A", expiryDate: "2026-07-24" }),
      lineNo: 1,
      invoiceNumber: "F-88412",
      receivedAtIso: "2026-07-16T10:00:00Z",
      defaultShelfLifeDays: 7,
    });
    expect(plan.lotCode).toBe("L2607A");
    expect(plan.expiryDate).toBe("2026-07-24");
    expect(plan.expiryKind).toBe("use_by");
  });

  it("missing lot → AUTO-{invoice}-{line}; missing expiry → internal default", () => {
    const plan = planBatch({
      line: mkLine({ quantity: 5, unit: "kg" }),
      lineNo: 3,
      invoiceNumber: "F-88412",
      receivedAtIso: "2026-07-16T10:00:00Z",
      defaultShelfLifeDays: 2,
    });
    expect(plan.lotCode).toBe("AUTO-F-88412-3");
    expect(plan.expiryDate).toBe("2026-07-18");
    expect(plan.expiryKind).toBe("internal");
  });

  it("no shelf-life default → no expiry, kind null (never invented)", () => {
    const plan = planBatch({
      line: mkLine({ quantity: 1, unit: "pcs" }),
      lineNo: 1,
      invoiceNumber: null,
      receivedAtIso: "2026-07-16T10:00:00Z",
      defaultShelfLifeDays: null,
    });
    expect(plan.lotCode).toBe("AUTO-NA-1");
    expect(plan.expiryDate).toBeNull();
    expect(plan.expiryKind).toBeNull();
  });

  it("box(=N pcs) normalizes to pieces", () => {
    const plan = planBatch({
      line: mkLine({ quantity: 4, unit: "box", unitsPerBox: 8 }),
      lineNo: 1,
      invoiceNumber: "F-1",
      receivedAtIso: "2026-07-16T10:00:00Z",
      defaultShelfLifeDays: null,
    });
    expect(plan.quantity).toBe(32);
    expect(plan.unit).toBe("pcs");
  });
});

describe("DoD fixture set (5 invoices)", () => {
  it("all five satisfy the extraction schema", () => {
    for (const name of FIXTURES) {
      expect(() => loadFixture(name), name).not.toThrow();
    }
  });

  it("handwritten delivery note carries low-confidence lines (full review)", () => {
    const note = loadFixture("torvehal-folgeseddel");
    expect(note.documentKind).toBe("delivery_note");
    expect(note.lines.some((l) => l.confidence < 0.6)).toBe(true);
    // unreadable quantity stays null — never guessed (§9.1)
    expect(note.lines.find((l) => l.description === "Muslinger")?.quantity).toBeNull();
  });

  it("credit note keeps printed negative quantities", () => {
    const credit = loadFixture("dansk-cater-kreditnota");
    expect(credit.documentKind).toBe("credit_note");
    expect(credit.lines[0]!.quantity).toBeLessThan(0);
  });

  it("duplicate fixture shares supplier + invoiceNumber with the original", () => {
    const original = loadFixture("dansk-cater-faktura");
    const copy = loadFixture("dansk-cater-faktura-kopi");
    expect(copy.invoiceNumber).toBe(original.invoiceNumber);
    expect(copy.supplier.cvr).toBe(original.supplier.cvr);
  });

  it("enrichment fixtures satisfy the schema and cover the new products", () => {
    for (const name of FIXTURES) {
      const raw = JSON.parse(
        readFileSync(
          resolve(process.cwd(), "fixtures/ai/product_enrich", `enrich-${name}.json`),
          "utf8",
        ),
      );
      expect(() => productEnrichSchema.parse(raw), name).not.toThrow();
    }
  });
});
