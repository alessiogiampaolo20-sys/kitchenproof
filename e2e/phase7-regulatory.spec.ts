import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { processPackUpdates } from "@/lib/compliance/pack-update";

/**
 * Phase 7 DoD (§13): a pack change fans out review tasks with correct diffs;
 * one-tap apply updates the CP, keep-mine demands a justification; nothing
 * resolves until every item is decided (R9).
 *
 * Strategy: publish an OLDER historical pack version (published_at in the
 * past, so the real latest stays latest for every other spec), pin the site
 * to it, run the fan-out — the diff is old → current.
 */

const run = Date.now();
const owner = {
  name: "Rita Regelsen",
  email: `p7-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// must satisfy the pack schema's YYYY.MM version format
const OLD_VERSION = "2020.01";

test("pack update: fan-out with correct diffs, apply + keep-mine", async ({ page }) => {
  test.setTimeout(240_000);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── publish the OLD pack version (hot holding 50, fridge max 6) ───────────
  const pack = JSON.parse(
    readFileSync(resolve("supabase/seed/dk-pack.json"), "utf8"),
  );
  pack.version = OLD_VERSION;
  for (const tpl of pack.controlPointTemplates) {
    if (tpl.key === "hot_holding_56") tpl.defaultLimit = { min: 50, unit: "°C" };
    if (tpl.key === "cold_storage_temp") tpl.defaultLimit = { max: 6, unit: "°C" };
  }
  const { data: existing } = await admin
    .from("pack_versions")
    .select("id")
    .eq("pack_code", "DK")
    .eq("version", OLD_VERSION)
    .maybeSingle();
  if (!existing) {
    const { error } = await admin.from("pack_versions").insert({
      pack_code: "DK",
      version: OLD_VERSION,
      content: pack,
      changelog: "historical version for the fan-out e2e",
      published_at: "2020-01-01T00:00:00Z", // older than the real latest
    });
    expect(error).toBeNull();
  }

  // ── org/site/programme approved (pins the REAL latest) ────────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Regelsen ApS ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Regelsen Køkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Regelsen Køkken/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // simulate a site authored under the OLD rules
  await admin
    .from("sites")
    .update({ pack_version_pinned: OLD_VERSION })
    .eq("id", siteId);

  // ── the cron fan-out (idempotent) ─────────────────────────────────────────
  const first = await processPackUpdates(admin as never);
  expect(first.reviewTasks).toBeGreaterThanOrEqual(1);
  const again = await processPackUpdates(admin as never);
  expect(again.reviewTasks).toBe(0); // unique(site, update) makes it idempotent

  // ── banner → review page with correct diffs ───────────────────────────────
  await page.goto(`/app/${siteId}/programme`);
  await page.getByTestId("review-task-banner").first().click();
  await page.waitForURL("**/programme/review/**");

  // correct diff values: hot holding 50 → 56, cold storage 6 → 5
  const hotItem = page.getByTestId("review-item-hot_holding_56-limit_changed");
  await expect(hotItem.getByTestId("diff-before")).toHaveText("≥ 50 °C");
  await expect(hotItem.getByTestId("diff-after")).toHaveText("≥ 56 °C");
  const coldItem = page.getByTestId("review-item-cold_storage_temp-limit_changed");
  await expect(coldItem.getByTestId("diff-before")).toHaveText("≤ 6 °C");
  await expect(coldItem.getByTestId("diff-after")).toHaveText("≤ 5 °C");

  // ── one-tap apply on hot holding ──────────────────────────────────────────
  await hotItem.getByTestId("apply-change").click();
  await expect(hotItem.getByTestId("item-decision")).toHaveText("Anvendt", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("review-status")).toHaveText("Åben"); // not all decided

  // ── keep-mine on cold storage: justification is mandatory ─────────────────
  await coldItem.getByTestId("keep-mine").click();
  await expect(coldItem.getByTestId("confirm-keep")).toBeDisabled(); // empty justification
  await coldItem
    .getByTestId("keep-justification")
    .fill("Vores køleskabe kører stabilt på 5 °C — værdien er allerede strammere end den nye standard.");
  await coldItem.getByTestId("confirm-keep").click();
  await expect(coldItem.getByTestId("item-decision")).toHaveText("Beholdt (begrundet)", {
    timeout: 15_000,
  });

  // all decided → resolved; banner gone from the programme page
  await expect(page.getByTestId("review-status")).toHaveText("Gennemgået");
  await page.goto(`/app/${siteId}/programme`);
  await expect(page.getByTestId("review-task-banner")).toHaveCount(0);

  // ── audit trail ───────────────────────────────────────────────────────────
  const { data: audits } = await admin
    .from("audit_log")
    .select("action")
    .eq("site_id", siteId);
  const actions = new Set((audits ?? []).map((row) => row.action));
  expect(actions.has("review_task.change_applied")).toBe(true);
  expect(actions.has("review_task.change_kept")).toBe(true);
});
