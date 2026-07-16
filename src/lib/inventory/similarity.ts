// Deterministic text matching for the §9.1 pipeline (code, not AI).
// Trigram similarity mirrors pg_trgm semantics (padded trigrams, Jaccard),
// implemented in TS so the matcher is unit-testable and identical in CI.

const UNIT_NOISE =
  /\b(\d+([.,]\d+)?\s*(kg|gr?|l|ltr|ml|cl|stk|pcs|pk|ks|krt|kasse[rn]?|bakke[rn]?|ps|x)\.?)\b|\b(kg|gr?|ltr|ml|cl|stk|pcs|pk|ks|krt|ps)\.?\b|\d+([.,]\d+)?/gi;

/** da/en synonym table → canonical Danish token (extensible, [DEFAULT]). */
const SYNONYMS: Record<string, string> = {
  onion: "løg",
  onions: "løg",
  chicken: "kylling",
  beef: "oksekød",
  pork: "svinekød",
  milk: "mælk",
  cream: "fløde",
  cheese: "ost",
  butter: "smør",
  flour: "mel",
  tomato: "tomat",
  tomatoes: "tomat",
  potato: "kartoffel",
  potatoes: "kartoffel",
  salmon: "laks",
  shrimp: "rejer",
  prawns: "rejer",
  egg: "æg",
  eggs: "æg",
};

/** §9.1: lowercased, unit-stripped, synonym-normalized matching key. */
export function normalizeName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(UNIT_NOISE, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    // single-char leftovers are packaging noise ("8X125G" → "x", "g")
    .filter((token) => token.length > 1)
    .map((token) => SYNONYMS[token] ?? token);
  return tokens.join(" ");
}

function trigramsOf(value: string): Set<string> {
  const grams = new Set<string>();
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const padded = `  ${word} `; // pg_trgm pads 2 leading + 1 trailing blank
    for (let i = 0; i <= padded.length - 3; i++) {
      grams.add(padded.slice(i, i + 3));
    }
  }
  return grams;
}

/** Jaccard similarity over padded word trigrams (0..1), pg_trgm-style. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const gram of ta) if (tb.has(gram)) shared++;
  return shared / (ta.size + tb.size - shared);
}
