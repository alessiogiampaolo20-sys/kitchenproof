import { describe, expect, it } from "vitest";
import {
  SHORT_CODE_LENGTH,
  generateShortCode,
  normalizeShortCode,
  uniqueShortCode,
} from "@/lib/inventory/short-code";

/** Deterministic stand-in for Math.random. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("generateShortCode", () => {
  it("is short enough to write on masking tape", () => {
    expect(generateShortCode()).toHaveLength(SHORT_CODE_LENGTH);
  });

  it("never emits a character that gets misread by hand", () => {
    const forbidden = /[015 28BILOSZ]/;
    for (let i = 0; i < 500; i++) {
      expect(generateShortCode()).not.toMatch(forbidden);
    }
  });

  it("is deterministic for a given random source", () => {
    expect(generateShortCode(sequence([0, 0, 0, 0]))).toBe("3333");
  });
});

describe("normalizeShortCode", () => {
  it("accepts what a hurried person types", () => {
    expect(normalizeShortCode(" k7f9 ")).toBe("K7F9");
    expect(normalizeShortCode("K7-F9")).toBe("K7F9");
  });

  it("drops characters the alphabet never produces instead of guessing", () => {
    // 0/O/S/B are excluded by design; inventing a substitution could point the
    // operator at the wrong container
    expect(normalizeShortCode("K0F9")).toBe("KF9"); // 0 is never generated
    expect(normalizeShortCode("SBIL")).toBe("");
  });
});

describe("uniqueShortCode", () => {
  it("avoids codes already in use", () => {
    const taken = new Set(["3333"]);
    // first draw collides, second is free
    const code = uniqueShortCode(taken, sequence([0, 0, 0, 0, 0.9, 0.9, 0.9, 0.9]));
    expect(code).not.toBeNull();
    expect(taken.has(code!)).toBe(false);
  });

  it("returns null rather than silently reusing a code", () => {
    const everything = new Set(["3333"]);
    expect(uniqueShortCode(everything, () => 0, 5)).toBeNull();
  });
});
