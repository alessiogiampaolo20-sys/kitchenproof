import { z } from "zod";
import { LOCALES } from "@/lib/i18n/config";

/** §2 activity type codes [DECISION] — mirrors public.activity_type enum. */
export const ACTIVITY_TYPES = [
  "restaurant",
  "cafe",
  "takeaway",
  "canteen",
  "bakery",
  "butcher",
  "catering",
  "foodtruck",
  "retail_kiosk",
  "hotel_breakfast",
  "small_producer",
  "wholesale_small",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Invitable roles (§4.2). org_owner memberships are created by create_organization(). */
export const INVITABLE_ROLES = [
  "org_admin",
  "site_manager",
  "operator",
  "consultant",
] as const;

export const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(200),
  locale: z.enum(LOCALES).default("da"),
});

export const createSiteSchema = z.object({
  orgId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  activityType: z.enum(ACTIVITY_TYPES),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(12).optional().or(z.literal("")),
  cvrPNumber: z.string().trim().max(20).optional().or(z.literal("")),
});

export const createInviteSchema = z.object({
  orgId: z.uuid(),
  email: z.email(),
  role: z.enum(INVITABLE_ROLES),
  // empty array is treated as "all sites" (site_ids = null)
  siteIds: z.array(z.uuid()).default([]),
});

export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "pin_must_be_4_digits");

export const setPinSchema = z.object({
  membershipId: z.uuid(),
  pin: pinSchema,
});

export const verifyPinSchema = z.object({
  membershipId: z.uuid(),
  siteId: z.uuid(),
  pin: pinSchema,
});

export const registerDeviceSchema = z.object({
  siteId: z.uuid(),
  deviceName: z.string().trim().min(1).max(100),
});
