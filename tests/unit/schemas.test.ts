import { describe, expect, it } from "vitest";
import {
  createInviteSchema,
  createOrgSchema,
  createSiteSchema,
  pinSchema,
  verifyPinSchema,
} from "@/lib/schemas/tenancy";
import { loginSchema, signupSchema } from "@/lib/schemas/auth";

const uuid = "01900000-0000-7000-8000-000000000000";

describe("tenancy schemas", () => {
  it("accepts a valid site", () => {
    expect(
      createSiteSchema.safeParse({
        orgId: uuid,
        name: "Testkøkken",
        activityType: "restaurant",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown activity types (§2 codes are closed)", () => {
    expect(
      createSiteSchema.safeParse({
        orgId: uuid,
        name: "X",
        activityType: "nightclub",
      }).success,
    ).toBe(false);
  });

  it("rejects org names beyond 200 chars", () => {
    expect(
      createOrgSchema.safeParse({ name: "a".repeat(201) }).success,
    ).toBe(false);
  });

  it("invites cannot carry org_owner role", () => {
    expect(
      createInviteSchema.safeParse({
        orgId: uuid,
        email: "a@b.dk",
        role: "org_owner",
      }).success,
    ).toBe(false);
  });

  it("PIN must be exactly 4 digits", () => {
    expect(pinSchema.safeParse("1234").success).toBe(true);
    expect(pinSchema.safeParse("123").success).toBe(false);
    expect(pinSchema.safeParse("12345").success).toBe(false);
    expect(pinSchema.safeParse("12a4").success).toBe(false);
  });

  it("verifyPin requires membership, site and pin", () => {
    expect(
      verifyPinSchema.safeParse({
        membershipId: uuid,
        siteId: uuid,
        pin: "0000",
      }).success,
    ).toBe(true);
  });
});

describe("auth schemas", () => {
  it("signup enforces 8-char password", () => {
    expect(
      signupSchema.safeParse({
        fullName: "A B",
        email: "a@b.dk",
        password: "1234567",
      }).success,
    ).toBe(false);
  });

  it("login next must be a relative path (open-redirect guard)", () => {
    expect(
      loginSchema.safeParse({
        email: "a@b.dk",
        password: "x",
        next: "https://evil.example",
      }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@b.dk", password: "x", next: "/org" })
        .success,
    ).toBe(true);
  });
});
