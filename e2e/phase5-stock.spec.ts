import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Phase 5 (§9.2/§9.6) — stock view, batch provenance, labels, catalog:
 *  - grouped stock with expiring rail + FIFO nudge
 *  - batch → supplier + original invoice in 2 taps (provenance chain)
 *  - printable QR label
 *  - catalog: AI-suggested allergens confirmed by a human; duplicate merge
 */

const run = Date.now();
const owner = {
  name: "Stella Stock",
  email: `p5-stock-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("stock: groups, provenance, label, catalog confirm + merge", async ({ page }) => {
  test.setTimeout(240_000);

  // ── setup: org/site/programme/PIN + two confirmed invoices ────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Lagerhuset ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Lagerhuset Vest");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Lagerhuset Vest/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  await page.goto("/org/members");
  const row = page.getByTestId("member-row").filter({ hasText: owner.name });
  await row.getByRole("button", { name: "Sæt PIN" }).click();
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

  for (const file of ["dansk-cater-faktura.pdf", "grossisten-flerside.pdf"]) {
    await page.goto(`/app/${siteId}/receive`);
    await page.getByTestId("invoice-files").setInputFiles(resolve(`fixtures/invoices/${file}`));
    await page.getByTestId("invoice-submit").click();
    await page.waitForURL("**/receive/review/**", { timeout: 60_000 });
    await page.getByTestId("confirm-invoice").click();
    await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });
  }

  // ── stock view (§9.6): groups + expiring rail + FIFO nudge ────────────────
  await page.goto(`/app/${siteId}/stock`);
  expect(await page.getByTestId("stock-batch").count()).toBe(10);
  await expect(page.getByTestId("expiring-rail")).toBeVisible(); // hakket oksekød expires today
  await expect(page.getByTestId("fifo-nudge").first()).toBeVisible();

  // ── batch provenance: 2 taps to supplier + original invoice (§9.2) ────────
  await page.getByTestId("stock-batch").first().click();
  await page.waitForURL("**/stock/batch/**");
  await expect(page.getByTestId("batch-lot")).toBeVisible();
  await expect(page.getByTestId("provenance-card")).toContainText(/Dansk Cater|Grossisten/);
  await expect(page.getByTestId("invoice-original-link")).toBeVisible();
  await expect(page.getByTestId("print-label")).toBeVisible();
  // append-only ledger shows the receive move
  await expect(page.getByTestId("move-row").first()).toContainText("Modtaget");

  // ── catalog (§9.2): confirm AI allergens, merge a duplicate ───────────────
  await page.goto(`/app/${siteId}/stock/products`);
  const productsBefore = await page.locator('[data-testid^="product-"]').count();
  expect(productsBefore).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId("allergens-unconfirmed").first()).toBeVisible();

  // edit the first product with AI-suggested allergens → save confirms them
  const unconfirmedCard = page
    .locator('[data-testid^="product-"]')
    .filter({ has: page.getByTestId("allergens-unconfirmed") })
    .first();
  await unconfirmedCard.locator('[data-testid^="edit-product-"]').click();
  await page.getByTestId("save-product").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByTestId("allergens-confirmed").first(),
  ).toBeVisible({ timeout: 15_000 });

  // merge: fold one product into another → hidden from the catalog
  await page.locator('[data-testid^="merge-product-"]').first().click();
  await page.getByTestId("merge-target").click();
  await page.getByRole("option").first().click();
  await page.getByTestId("confirm-merge").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(productsBefore - 1, {
    timeout: 15_000,
  });
});
