import { describe, expect, it } from "vitest";
import { aggregateDays } from "@/lib/inspection/data";
import { summarizeValue } from "@/components/inspection/tabs";

describe("aggregateDays (§10.2 calendar heat-map)", () => {
  it("buckets completions, misses and deviations per day over the range", () => {
    const cells = aggregateDays({
      fromDate: "2026-07-01",
      toDate: "2026-07-03",
      completions: [
        { created_at: "2026-07-01T08:00:00Z" },
        { created_at: "2026-07-01T15:00:00Z" },
        { created_at: "2026-07-03T09:00:00Z" },
      ],
      missedTasks: [{ due_at: "2026-07-02T08:00:00Z" }],
      deviations: [{ detected_at: "2026-07-03T10:00:00Z" }],
    });
    expect(cells).toHaveLength(3);
    expect(cells[0]).toEqual({ date: "2026-07-01", done: 2, missed: 0, deviations: 0 });
    expect(cells[1]).toEqual({ date: "2026-07-02", done: 0, missed: 1, deviations: 0 });
    expect(cells[2]).toEqual({ date: "2026-07-03", done: 1, missed: 0, deviations: 1 });
  });

  it("ignores events outside the range; empty range handled", () => {
    const cells = aggregateDays({
      fromDate: "2026-07-10",
      toDate: "2026-07-10",
      completions: [{ created_at: "2026-07-09T23:59:00Z" }],
      missedTasks: [],
      deviations: [],
    });
    expect(cells).toEqual([{ date: "2026-07-10", done: 0, missed: 0, deviations: 0 }]);
  });
});

describe("summarizeValue (record drill-down)", () => {
  it("summarizes each value_json shape", () => {
    expect(summarizeValue({ temp_c: 3.4 })).toBe("3.4 °C");
    expect(summarizeValue({ checklist: [{ ok: true }, { ok: false }, { ok: true }] })).toBe("2/3");
    expect(summarizeValue({ cool_log: [{ temp_c: 56 }, { temp_c: 9.5 }] })).toBe("→ 9.5 °C");
    expect(summarizeValue({ note_text: "Ekstra rengøring efter service" })).toContain("Ekstra");
    expect(summarizeValue({ receiving: true, temp_c: 4 })).toBe("4 °C");
    expect(summarizeValue(null)).toBe("");
  });
});
