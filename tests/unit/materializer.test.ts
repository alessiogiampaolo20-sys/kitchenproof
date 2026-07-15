import { describe, expect, it } from "vitest";
import {
  expandFrequency,
  materializeTasks,
  wallTimeToUtc,
} from "@/lib/compliance/materializer";

const TZ = "Europe/Copenhagen";

describe("wallTimeToUtc (site TZ, DST-safe)", () => {
  it("converts CEST (summer, +2)", () => {
    expect(wallTimeToUtc(2026, 7, 15, 8, 0, TZ).toISOString()).toBe(
      "2026-07-15T06:00:00.000Z",
    );
  });

  it("converts CET (winter, +1)", () => {
    expect(wallTimeToUtc(2026, 1, 15, 8, 0, TZ).toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
  });

  it("handles the spring-forward transition day (2026-03-29)", () => {
    // 08:00 local on the day DST starts is CEST (+2)
    expect(wallTimeToUtc(2026, 3, 29, 8, 0, TZ).toISOString()).toBe(
      "2026-03-29T06:00:00.000Z",
    );
    // the day before is still CET (+1)
    expect(wallTimeToUtc(2026, 3, 28, 8, 0, TZ).toISOString()).toBe(
      "2026-03-28T07:00:00.000Z",
    );
  });
});

describe("expandFrequency", () => {
  const window7d = {
    from: new Date("2026-07-15T00:00:00Z"),
    to: new Date("2026-07-22T00:00:00Z"),
  };

  it("daily with two times over 7 days → 14 occurrences", () => {
    const occ = expandFrequency(
      { rrule: "FREQ=DAILY", times: ["12:00", "18:30"], dueWindowMinutes: 90 },
      window7d,
      TZ,
    );
    expect(occ).toHaveLength(14);
    expect(occ[0]!.dueAt.toISOString()).toBe("2026-07-15T10:00:00.000Z"); // 12:00 CEST
    expect(occ[0]!.dueWindowMinutes).toBe(90);
    expect(occ[13]!.dueAt.toISOString()).toBe("2026-07-21T16:30:00.000Z");
  });

  it("weekly on Mondays → only Mondays", () => {
    const occ = expandFrequency(
      { rrule: "FREQ=WEEKLY;BYDAY=MO", times: ["09:00"], dueWindowMinutes: 120 },
      window7d,
      TZ,
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]!.dueAt.toISOString()).toBe("2026-07-20T07:00:00.000Z"); // Mon 2026-07-20
  });

  it("monthly on the 1st inside/outside the window", () => {
    const occ = expandFrequency(
      { rrule: "FREQ=MONTHLY;BYMONTHDAY=1", times: ["09:00"], dueWindowMinutes: 1440 },
      window7d,
      TZ,
    );
    expect(occ).toHaveLength(0); // no 1st between Jul 15 and Jul 22

    const aug = expandFrequency(
      { rrule: "FREQ=MONTHLY;BYMONTHDAY=1", times: ["09:00"], dueWindowMinutes: 1440 },
      { from: new Date("2026-07-28T00:00:00Z"), to: new Date("2026-08-04T00:00:00Z") },
      TZ,
    );
    expect(aug).toHaveLength(1);
    expect(aug[0]!.dueAt.toISOString()).toBe("2026-08-01T07:00:00.000Z");
  });

  it("perEvent frequencies produce no scheduled tasks", () => {
    expect(expandFrequency({ perEvent: true }, window7d, TZ)).toEqual([]);
  });

  it("stays inside the half-open window [from, to)", () => {
    const occ = expandFrequency(
      { rrule: "FREQ=DAILY", times: ["01:00"], dueWindowMinutes: 60 },
      {
        from: new Date("2026-07-15T06:00:00Z"),
        to: new Date("2026-07-16T06:00:00Z"),
      },
      TZ,
    );
    // 01:00 CEST on Jul 15 = 23:00Z Jul 14 (before from); Jul 16 01:00 CEST = 23:00Z Jul 15 (inside)
    expect(occ).toHaveLength(1);
    expect(occ[0]!.dueAt.toISOString()).toBe("2026-07-15T23:00:00.000Z");
  });

  it("crosses the DST boundary with correct offsets", () => {
    const occ = expandFrequency(
      { rrule: "FREQ=DAILY", times: ["08:00"], dueWindowMinutes: 120 },
      {
        from: new Date("2026-03-28T00:00:00Z"),
        to: new Date("2026-03-31T00:00:00Z"),
      },
      TZ,
    );
    expect(occ.map((o) => o.dueAt.toISOString())).toEqual([
      "2026-03-28T07:00:00.000Z", // CET
      "2026-03-29T06:00:00.000Z", // CEST from here
      "2026-03-30T06:00:00.000Z",
    ]);
  });

  it("rejects malformed frequencies (Zod fail-closed)", () => {
    expect(() => expandFrequency({ rrule: "BOGUS" }, window7d, TZ)).toThrow();
  });
});

describe("materializeTasks", () => {
  it("expands active CPs, skips inactive and perEvent, is deterministic", () => {
    const cps = [
      {
        id: "cp-daily",
        site_id: "site-1",
        frequency_json: { rrule: "FREQ=DAILY", times: ["08:00"], dueWindowMinutes: 120 },
        responsible_role: "operator",
        active: true,
      },
      {
        id: "cp-event",
        site_id: "site-1",
        frequency_json: { perEvent: true },
        responsible_role: null,
        active: true,
      },
      {
        id: "cp-inactive",
        site_id: "site-1",
        frequency_json: { rrule: "FREQ=DAILY", times: ["08:00"], dueWindowMinutes: 120 },
        responsible_role: null,
        active: false,
      },
    ];
    const window = {
      from: new Date("2026-07-15T00:00:00Z"),
      to: new Date("2026-07-22T00:00:00Z"),
    };
    const a = materializeTasks(cps, window, TZ);
    const b = materializeTasks(cps, window, TZ);
    expect(a).toHaveLength(7);
    expect(a.every((t) => t.control_point_id === "cp-daily")).toBe(true);
    expect(a[0]!.assigned_role).toBe("operator");
    expect(a).toEqual(b); // deterministic → safe to upsert idempotently
  });
});
