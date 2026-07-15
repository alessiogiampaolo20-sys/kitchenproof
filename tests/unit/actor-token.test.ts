import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/actor/token";

const secret = new TextEncoder().encode("test-secret-at-least-32-bytes-long!!");
const other = new TextEncoder().encode("other-secret-at-least-32-bytes-long!");

describe("actor session tokens", () => {
  it("round-trips a payload", async () => {
    const token = await signSession(
      { membershipId: "m1", siteId: "s1" },
      60,
      secret,
    );
    const payload = await verifySession<{ membershipId: string; siteId: string }>(
      token,
      secret,
    );
    expect(payload?.membershipId).toBe("m1");
    expect(payload?.siteId).toBe("s1");
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession({ a: "b" }, 60, other);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession({ a: "b" }, -10, secret);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySession("not-a-jwt", secret)).toBeNull();
  });
});
