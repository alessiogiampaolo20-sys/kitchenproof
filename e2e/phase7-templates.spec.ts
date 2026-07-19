import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * Phase 7 (§11): programme templating — template from one site, roll-out to a
 * fresh site as a DRAFT, central push to a site with a programme becomes a
 * PROPOSAL requiring local approval (R9).
 */

const run = Date.now();
const owner = {
  name: "Tanja Templier",
  email: `p7-tpl-${run}@e2e.local`,
  password: "e2e-password-123",
};

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

test("template roll-out: fresh draft + proposal with local approval", async ({ page }) => {
  test.setTimeout(240_000);

  // ── org + site1 with approved programme + empty site2 ─────────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Templier Gruppen ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Templier Nord");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const site1 = (await page
    .getByRole("link", { name: /Templier Nord/ })
    .getAttribute("href"))!.split("/")[2]!;
  await page.goto("/org/sites");
  await page.fill("#site-name", "Templier Syd");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const site2 = (await page
    .getByRole("link", { name: /Templier Syd/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${site1}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // ── create the template from site1 and roll it out to empty site2 ─────────
  await page.goto("/org/templates");
  await page.getByTestId("template-name").fill("Standard restaurant");
  await page.getByTestId("template-source").click();
  await page.getByRole("option", { name: "Templier Nord" }).click();
  await page.getByTestId("create-template").click();
  await expect(page.getByText("Skabelonen er oprettet")).toBeVisible({ timeout: 30_000 });

  const deployTarget = page.locator('[data-testid^="deploy-target-"]').first();
  await deployTarget.click();
  await page.getByRole("option", { name: "Templier Syd" }).click();
  await page.locator('[data-testid^="deploy-"][data-testid*="-"]').first();
  await page.locator('button[data-testid^="deploy-"]:not([data-testid^="deploy-target-"])').first().click();
  await expect(page.getByText("Kladde oprettet på stedet")).toBeVisible({ timeout: 30_000 });

  await page.goto(`/app/${site2}/programme`);
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  expect(await page.getByTestId("cp-row").count()).toBeGreaterThanOrEqual(10);

  // ── make site2 diverge (tighter fridge limit 4 °C — no justification) ─────
  const coldRow = page.getByTestId("cp-row").filter({ hasText: "≤ 5 °C" }).first();
  await coldRow.getByRole("button", { name: "Redigér" }).click();
  await page.locator('input[name="max"]').fill("4");
  await page.getByRole("dialog").getByRole("button", { name: "Redigér" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // ── central push: same template again → PROPOSAL with the 4→5 diff ────────
  await page.goto("/org/templates");
  const target2 = page.locator('[data-testid^="deploy-target-"]').first();
  await target2.click();
  await page.getByRole("option", { name: "Templier Syd" }).click();
  await page.locator('button[data-testid^="deploy-"]:not([data-testid^="deploy-target-"])').first().click();
  await expect(page.getByText("Forslag sendt til stedet")).toBeVisible({ timeout: 30_000 });

  // ── local decision on site2 ───────────────────────────────────────────────
  await page.goto(`/app/${site2}/programme`);
  const proposal = page.getByTestId("proposal-card").first();
  await expect(proposal).toBeVisible();
  await expect(proposal.getByTestId("proposal-item").first()).toContainText("≤ 4 °C");
  await expect(proposal.getByTestId("proposal-item").first()).toContainText("≤ 5 °C");
  await proposal.getByTestId("apply-proposal").click();
  await expect(page.getByTestId("proposal-card")).toHaveCount(0, { timeout: 30_000 });
  // the CP is back on the template value
  await expect(
    page.getByTestId("cp-limit").filter({ hasText: "≤ 5 °C" }).first(),
  ).toBeVisible();

  // ── audit trail ───────────────────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: audits } = await admin
    .from("audit_log")
    .select("action")
    .in("site_id", [site1, site2]);
  const actions = new Set((audits ?? []).map((row) => row.action));
  for (const expected of [
    "programme_template.created",
    "programme_template.applied",
    "programme_proposal.pushed",
    "programme_proposal.applied",
  ]) {
    expect(actions.has(expected), expected).toBe(true);
  }
});
