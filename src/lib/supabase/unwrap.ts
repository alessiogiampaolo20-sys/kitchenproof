import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Turns a PostgREST result into its data, throwing when the query failed.
 *
 * Destructuring `{ data }` and ignoring `error` is how three defects reached
 * production unnoticed (a broken FK embed, a dead cron, an empty inspector
 * view — see the CLAUDE.md decision log). Anything whose failure would make a
 * feature quietly do nothing goes through here instead.
 */
export function unwrap<T>(
  result: { data: T; error: PostgrestError | null },
  context: string,
): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}
