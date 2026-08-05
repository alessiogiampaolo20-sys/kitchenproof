// §9.1 (decision 2026-07-27): the kitchen labels with masking tape and a pen,
// so the code the app generates has to be short enough that a cook will
// actually copy it — and unambiguous enough that reading it back off tape
// works. Nobody is buying a label printer to use this software.

/**
 * No 0/O, 1/I/L, 2/Z, 5/S, 8/B: the pairs that get misread from handwriting.
 * 26 symbols, 4 characters ≈ 457k combinations — plenty per site, and short
 * enough to write between two pans.
 */
const ALPHABET = "34679ACDEFGHJKMNPQRTUVWXY";

export const SHORT_CODE_LENGTH = 4;

export function generateShortCode(
  random: () => number = Math.random,
): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Reading a code back off tape: people type lowercase and add spaces or
 * dashes. Both members of every ambiguous pair are already absent from the
 * alphabet, so there is no honest way to "correct" a 0 or an S into something
 * else — guessing which character was meant could send the operator to the
 * wrong container. Anything unrecognisable is dropped, the lookup misses, and
 * the search falls back to name + date, which is what the tape really says.
 */
export function normalizeShortCode(input: string): string {
  const upper = input.trim().toUpperCase();
  return [...upper].filter((char) => ALPHABET.includes(char)).join("");
}

/**
 * A code unique among the ones already in use. Retries a handful of times;
 * the caller decides what to do if the (vanishingly unlikely) collision
 * streak wins — silence is not one of the options.
 */
export function uniqueShortCode(
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
  attempts = 12,
): string | null {
  for (let i = 0; i < attempts; i++) {
    const code = generateShortCode(random);
    if (!taken.has(code)) return code;
  }
  return null;
}
