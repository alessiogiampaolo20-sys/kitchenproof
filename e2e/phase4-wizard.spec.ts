import { expect, test } from "@playwright/test";

/**
 * Phase 4 DoD e2e: scripted pizzeria interview (fixture provider) → complete
 * AI draft with guardrails applied → review edit → approval. Proves:
 *  - the wizard interview completes on chips alone (§7.2, zero required typing)
 *  - AI-proposed TIGHTER limit is applied (cold storage ≤ 4 °C)
 *  - AI-proposed LOOSER limit is clamped (hot holding stays ≥ 56 °C, §7.3)
 *  - loosening via the editor without a written justification is impossible
 *  - AI rows carry the ai_suggested badge until a human edits (§7.3)
 * Requires AI_PROVIDER=fixture (dev .env.local / CI env) and a published DK pack.
 */

const run = Date.now();
const owner = {
  name: "Wanda Wizard",
  email: `p4-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("AI wizard: interview → guardrailed draft → review → approval", async ({ page }) => {
  // Signup → org → restaurant site
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Pizzeria Vesuvio ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Vesuvio Østerbro");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteCard = page.getByRole("link", { name: /Vesuvio Østerbro/ });
  await expect(siteCard).toBeVisible();
  const siteId = (await siteCard.getAttribute("href"))!.split("/")[2]!;

  // Programme empty state → AI wizard
  await page.goto(`/app/${siteId}/programme`);
  await page.getByTestId("start-wizard").click();
  await page.waitForURL(`**/app/${siteId}/programme/wizard`);

  // Scripted pizzeria interview — chips only, no typing (§15)
  await expect(page.getByTestId("wizard-question")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("chip-pizza").click();
  await page.getByTestId("chip-pasta").click(); // multi-select turn
  await page.getByTestId("wizard-send").click();

  await expect(page.getByTestId("chip-2")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("chip-2").click(); // 2 fridges
  await page.getByTestId("wizard-send").click();

  for (let i = 0; i < 2; i++) {
    // delivery: yes → cooling: yes
    await expect(page.getByTestId("chip-yes")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("chip-yes").click();
    await page.getByTestId("wizard-send").click();
  }

  // Interview done → summary → generate the draft
  await expect(page.getByTestId("wizard-summary")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("wizard-generate").click();
  await page.waitForURL(`**/app/${siteId}/programme`, { timeout: 60_000 });
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });

  // Complete draft: control points incl. prerequisites, all 6 sections' rows
  const cpRows = page.getByTestId("cp-row");
  expect(await cpRows.count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId("cp-source").first()).toContainText(/DK-/);

  // §7.3 guardrails on limits:
  //  - AI's tighter cold-storage proposal (4 °C) was ACCEPTED
  await expect(
    page.getByTestId("cp-limit").filter({ hasText: "≤ 4 °C" }).first(),
  ).toBeVisible();
  //  - AI's looser hot-holding proposal (50 °C) was CLAMPED to the pack default
  await expect(
    page.getByTestId("cp-limit").filter({ hasText: "≥ 56 °C" }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("cp-limit").filter({ hasText: "≥ 50 °C" })).toHaveCount(0);
  // nothing is marked as loosened
  await expect(page.getByText("Lempet")).toHaveCount(0);

  // Loosening via the editor WITHOUT justification is impossible (§7.3)
  const coldCp = cpRows.filter({ hasText: "≤ 4 °C" }).first();
  await coldCp.getByRole("button", { name: "Redigér" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="max"]').fill("10");
  await dialog.getByRole("button", { name: "Redigér" }).click();
  await expect(dialog.getByRole("alert")).toContainText("begrundelse");
  await page.keyboard.press("Escape");

  // AI provenance: rows carry the AI badge until a human edits (§7.3)
  const aiBadges = page.getByTestId("ai-badge");
  const badgesBefore = await aiBadges.count();
  expect(badgesBefore).toBeGreaterThan(0);

  // Review editor: edit one row → badge clears for that row, origin audited
  await page.locator('[data-testid^="edit-row-"]').first().click();
  const rowDialog = page.getByRole("dialog");
  await rowDialog.locator('textarea[name="whatYouDo"]').fill(
    "Vi modtager kølevarer tre gange om ugen fra to faste leverandører.",
  );
  await rowDialog.getByRole("button", { name: "Gem" }).click();
  await expect(rowDialog).not.toBeVisible();
  await expect(aiBadges).toHaveCount(badgesBefore - 1, { timeout: 15_000 });

  // Approve → schedule live
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });
});
