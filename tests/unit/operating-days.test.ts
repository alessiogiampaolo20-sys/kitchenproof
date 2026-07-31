import { describe, expect, it } from "vitest";
import {
  addDays,
  findUnresolvedGaps,
  isoWeekday,
  nextOpenDay,
  parsePattern,
  resolveDayStatus,
  type DayStatus,
} from "@/lib/compliance/operating-days";

describe("isoWeekday", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    expect(isoWeekday("2026-07-27")).toBe(1); // Monday
    expect(isoWeekday("2026-08-02")).toBe(7); // Sunday
  });
});

describe("resolveDayStatus", () => {
  const weekdays = { mode: "weekdays" as const, weekdays: [1, 2, 3, 4, 5] };

  it("treats a site with no pattern as open every day — nothing changes for existing sites", () => {
    expect(resolveDayStatus({ pattern: null, day: "2026-08-02" })).toBe("open");
  });

  it("derives closed from the weekday pattern without asking", () => {
    expect(resolveDayStatus({ pattern: weekdays, day: "2026-07-27" })).toBe("open");
    expect(resolveDayStatus({ pattern: weekdays, day: "2026-08-02" })).toBe("closed");
  });

  it("lets booked work override the pattern — a Sunday event is a working day", () => {
    expect(
      resolveDayStatus({ pattern: weekdays, day: "2026-08-02", hasScheduledWork: true }),
    ).toBe("open");
  });

  it("asks rather than guessing for a caterer with nothing booked", () => {
    expect(resolveDayStatus({ pattern: { mode: "scheduled_only" }, day: "2026-08-02" })).toBe(
      "unknown",
    );
  });

  it("obeys an explicit confirmation over every derivation", () => {
    expect(
      resolveDayStatus({ explicit: "closed", pattern: weekdays, day: "2026-07-27" }),
    ).toBe("closed");
    expect(
      resolveDayStatus({
        explicit: "open",
        pattern: weekdays,
        day: "2026-08-02",
        hasScheduledWork: false,
      }),
    ).toBe("open");
  });
});

describe("nextOpenDay", () => {
  const closedWeekend = (day: string): DayStatus =>
    [6, 7].includes(isoWeekday(day)) ? "closed" : "open";

  it("returns the day itself when it is open", () => {
    expect(nextOpenDay("2026-07-27", closedWeekend)).toBe("2026-07-27");
  });

  it("rolls a weekend check forward to Monday", () => {
    expect(nextOpenDay("2026-08-01", closedWeekend)).toBe("2026-08-03");
  });

  it("treats an uncertain day as open so a check never silently vanishes", () => {
    expect(nextOpenDay("2026-08-01", () => "unknown")).toBe("2026-08-01");
  });

  it("gives up rather than rolling forever when everything is closed", () => {
    expect(nextOpenDay("2026-08-01", () => "closed", 5)).toBeNull();
  });
});

describe("findUnresolvedGaps", () => {
  it("lists only days with neither records nor a declared status", () => {
    const gaps = findUnresolvedGaps({
      from: "2026-07-20",
      to: "2026-07-24",
      daysWithRecords: new Set(["2026-07-20", "2026-07-22"]),
      daysWithStatus: new Set(["2026-07-21"]),
    });
    expect(gaps).toEqual(["2026-07-23", "2026-07-24"]);
  });

  it("returns nothing when every day is accounted for", () => {
    expect(
      findUnresolvedGaps({
        from: "2026-07-20",
        to: "2026-07-21",
        daysWithRecords: new Set(["2026-07-20"]),
        daysWithStatus: new Set(["2026-07-21"]),
      }),
    ).toEqual([]);
  });
});

describe("parsePattern", () => {
  it("accepts the two supported shapes", () => {
    expect(parsePattern({ mode: "weekdays", weekdays: [1, 5] })).toEqual({
      mode: "weekdays",
      weekdays: [1, 5],
    });
    expect(parsePattern({ mode: "scheduled_only" })).toEqual({ mode: "scheduled_only" });
  });

  it("rejects nonsense instead of half-applying it", () => {
    expect(parsePattern({ mode: "weekdays", weekdays: [0, 9] })).toBeNull();
    expect(parsePattern({ mode: "whenever" })).toBeNull();
    expect(parsePattern(null)).toBeNull();
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });
});
