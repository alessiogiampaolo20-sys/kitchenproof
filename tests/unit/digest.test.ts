import { describe, expect, it } from "vitest";
import { isoWeek } from "@/lib/cron/digest";

describe("isoWeek (weekly digest dedupe key)", () => {
  it("computes ISO week ids across year boundaries", () => {
    expect(isoWeek(new Date("2026-07-20T08:00:00Z"))).toBe("2026-W30"); // a Monday
    expect(isoWeek(new Date("2026-01-01T08:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2027-01-01T08:00:00Z"))).toBe("2026-W53"); // ISO year spill
  });
});
