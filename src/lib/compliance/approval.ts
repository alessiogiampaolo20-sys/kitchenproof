import type { ActivityTemplate } from "./pack-schema";

/**
 * §3.3.1 approval validator: every applying CRITICAL skema row must be covered
 * by at least one ACTIVE monitoring control point of a template mapped to that
 * row. Returns the offending row keys (empty = approvable).
 */
export function findUncoveredCriticalRows(
  rows: { activity_key: string; applies: boolean; is_critical: boolean }[],
  activeTemplateKeys: ReadonlySet<string | null>,
  template: ActivityTemplate | undefined,
): string[] {
  const uncovered: string[] = [];
  for (const row of rows) {
    if (!row.applies || !row.is_critical) continue;
    const required = template?.rows[row.activity_key]?.controlPointKeys ?? [];
    if (required.length > 0 && !required.some((k) => activeTemplateKeys.has(k))) {
      uncovered.push(row.activity_key);
    }
  }
  return uncovered;
}
