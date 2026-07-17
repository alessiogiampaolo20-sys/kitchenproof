import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Phase 5 (§9.4/§9.5) — prep batch trace + the leftover deck DoD:
 *  - prep: input batches → produced output with parent links both directions
 *  - leftover deck: 25+ item session completed in ≤ 2 minutes (measured),
 *    with used-up / kept / discarded(reason) / skip decisions
 */

const run = Date.now();
const owner = {
  name: "Lars Lukkevagt",
  email: `p5-left-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("prep trace + 25-item leftover session ≤ 2 min", async ({ page }) => {
  test.setTimeout(300_000);

  // ── setup: org/site/programme/PIN ──────────────────────────────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Aftenkøkkenet ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Aftenkøkkenet Øst");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Aftenkøkkenet Øst/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  await page.goto("/org/members");
  await page
    .getByTestId("member-row")
    .filter({ hasText: owner.name })
    .getByRole("button", { name: "Sæt PIN" })
    .click();
  await page.fill('input[name="pin"]', "1234");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("PIN gemt")).toBeVisible();
  await page.goto(`/app/${siteId}/today`);
  await page.getByRole("button", { name: "Registrér enhed" }).click();
  await page.getByRole("button", { name: "Skift bruger" }).click();
  await page.locator("button", { hasText: owner.name }).first().click();
  for (const d of ["1", "2", "3", "4"]) {
    await page.getByTestId(`pin-key-${d}`).click();
  }
  await expect(page.getByTestId("active-actor")).toContainText(owner.name);

  // ── 18 batches from 4 fixture documents ────────────────────────────────────
  for (const file of [
    "dansk-cater-faktura.pdf",
    "grossisten-flerside.pdf",
    "dansk-cater-faktura-kopi.pdf",
    "torvehal-folgeseddel.png",
  ]) {
    await page.goto(`/app/${siteId}/receive`);
    await page.getByTestId("invoice-files").setInputFiles(resolve(`fixtures/invoices/${file}`));
    await page.getByTestId("invoice-submit").click();
    await page.waitForURL("**/receive/review/**", { timeout: 60_000 });
    await page.getByTestId("confirm-invoice").click();
    await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });
  }

  // ── +7 batches via quick receive → 25 active ───────────────────────────────
  await page.goto(`/app/${siteId}/receive/quick`);
  await page.getByTestId("quick-supplier-name").fill("Torvet");
  for (let i = 0; i < 7; i++) {
    await page.locator('[data-testid^="quick-product-"]').nth(i).click();
    await expect(page.getByTestId(`quick-line-${i}`)).toBeVisible();
  }
  await page.getByTestId("quick-submit").click();
  await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });

  await page.goto(`/app/${siteId}/stock`);
  expect(await page.getByTestId("stock-batch").count()).toBe(25);

  // ── §9.4 prep: 2 partial inputs → produced batch with parent links ─────────
  await page.getByTestId("prep-link").click();
  await page.waitForURL("**/stock/prep");
  const inputs = page.locator('[data-testid^="prep-input-"]');
  for (const i of [0, 1]) {
    await inputs.nth(i).click();
  }
  // consume only part of each input so both stay active (25 remain in the deck)
  const qtyFields = page.locator('[data-testid^="prep-qty-"]');
  await qtyFields.nth(0).fill("1");
  await qtyFields.nth(1).fill("1");
  await page.getByTestId("prep-name").fill("Ragù bolognese 15 L");
  await page.getByTestId("prep-quantity").fill("15");
  await page.getByTestId("prep-submit").click();
  await page.waitForURL("**/stock/batch/**", { timeout: 30_000 });
  await expect(page.getByTestId("batch-lot")).toContainText("PREP-");
  expect(await page.getByTestId("parent-batch-link").count()).toBe(2);
  // trace works both directions: parent → shows 'use' move from the prep
  await page.getByTestId("parent-batch-link").first().click();
  await page.waitForURL("**/stock/batch/**");
  await expect(page.getByTestId("move-row").first()).toContainText("Brugt");

  // ── §9.5 leftover deck: 25+ items, timed ───────────────────────────────────
  await page.goto(`/app/${siteId}/leftovers`);
  await page.getByTestId("start-session").click();
  await expect(page.getByTestId("deck-card")).toBeVisible({ timeout: 15_000 });

  // deck size is data-driven (one prep input was fully consumed) — read it
  const progressText = await page.getByTestId("deck-progress").innerText();
  const total = Number(progressText.match(/af (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(25); // DoD: a 25-item session

  const started = Date.now();
  for (let i = 0; i < total; i++) {
    await expect(page.getByTestId("deck-progress")).toContainText(`${i + 1} af ${total}`);
    if (i % 5 === 3) {
      // kept with adjusted quantity (stepper down once)
      await page.getByTestId("deck-keep").click();
      await page.getByTestId("keep-panel").getByRole("button").first().click(); // minus
      await page.getByTestId("keep-confirm").click();
    } else if (i % 5 === 4) {
      // discarded with a one-tap reason chip
      await page.getByTestId("deck-discard").click();
      await page.getByTestId("discard-overproduction").click();
    } else if (i % 5 === 2) {
      await page.getByTestId("deck-skip").click();
    } else {
      await page.getByTestId("deck-used-up").click();
    }
  }
  await page.waitForURL(`**/app/${siteId}/stock`, { timeout: 30_000 });
  const elapsed = Date.now() - started;
  console.log(`leftover session: ${total} items in ${(elapsed / 1000).toFixed(1)}s`);
  expect(elapsed).toBeLessThan(120_000); // §9.5 DoD: 25 items ≤ 2 minutes

  // used-up and discarded batches left the stock; kept + skipped remain
  const remaining = await page.getByTestId("stock-batch").count();
  expect(remaining).toBeLessThan(total);
});
