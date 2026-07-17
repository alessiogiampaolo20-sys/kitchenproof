import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Phase 5 (§9.1/§9.3) — invoice pipeline with the DoD fixture set:
 *  1. clean printed invoice → catalog grows, receiving check inline, batches
 *  2. multi-page invoice → history/product reuse across suppliers' catalogs
 *  3. duplicate upload → warned, not blocked
 *  4. credit note → negative stock adjustment, no receiving form
 *  5. handwritten delivery note → low-confidence rows expanded, unreadable
 *     quantity excluded by the human (never guessed)
 * Requires AI_PROVIDER=fixture and a published DK pack.
 */

const run = Date.now();
const owner = {
  name: "Rasmus Modtager",
  email: `p5-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("invoices: clean, multipage, duplicate, credit note, handwritten", async ({ page }) => {
  test.setTimeout(240_000);

  // ── setup: org → site → programme approved → PIN actor ────────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Trattoria Lager ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Lagerkøkkenet");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Lagerkøkkenet/ })
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

  async function uploadInvoice(fileName: string) {
    await page.goto(`/app/${siteId}/receive`);
    await page
      .getByTestId("invoice-files")
      .setInputFiles(resolve(`fixtures/invoices/${fileName}`));
    await page.getByTestId("invoice-submit").click();
    await page.waitForURL("**/receive/review/**", { timeout: 60_000 });
  }

  // ── 1. clean printed invoice ───────────────────────────────────────────────
  await uploadInvoice("dansk-cater-faktura.pdf");
  // 5 food lines; all are new products on an empty catalog → flagged for a look
  await expect(page.getByTestId("review-summary")).toContainText("5 varelinjer");
  await expect(page.getByTestId("new-product-badge").first()).toBeVisible();
  // non-food auto-hidden under "excluded (3)"
  await expect(page.getByTestId("excluded-toggle")).toContainText("(3)");
  // AI allergen suggestions visible on expanded rows (confirm on product)
  await expect(page.getByTestId("allergen-suggestion").first()).toBeVisible();
  // §9.3 inline receiving check
  await page.getByTestId("receiving-temp").fill("4,0");
  await page.getByTestId("transport-ok").click();
  await page.getByTestId("packaging-ok").click();
  await page.getByTestId("confirm-invoice").click();
  await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });
  await expect(
    page.getByTestId("invoice-row").first().getByText("Bekræftet"),
  ).toBeVisible();

  // ── 2. multi-page invoice (different supplier) ─────────────────────────────
  await uploadInvoice("grossisten-flerside.pdf");
  await expect(page.getByTestId("review-summary")).toContainText("5 varelinjer");
  await page.getByTestId("confirm-invoice").click();
  await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });

  // ── 3. duplicate upload → warned, reviewable, not blocked ─────────────────
  await uploadInvoice("dansk-cater-faktura-kopi.pdf");
  await expect(page.getByTestId("duplicate-warning")).toBeVisible();
  await page.goto(`/app/${siteId}/receive`);
  await expect(page.getByTestId("duplicate-badge").first()).toBeVisible();

  // ── 4. credit note → stock adjustment, no receiving form ──────────────────
  await uploadInvoice("dansk-cater-kreditnota.pdf");
  await expect(page.getByTestId("receiving-form")).toHaveCount(0);
  await page.getByTestId("confirm-invoice").click();
  await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });
  await expect(
    page.getByTestId("invoice-row").first().getByText("Kreditnota"),
  ).toBeVisible();

  // ── 5. handwritten delivery note (photo) ──────────────────────────────────
  await uploadInvoice("torvehal-folgeseddel.png");
  await expect(page.getByTestId("review-summary")).toContainText("3 varelinjer");
  // unreadable quantity was NOT guessed — the human excludes that line
  const muslinger = page.getByTestId("line-3");
  await expect(muslinger).toContainText("Muslinger");
  await page.getByTestId("toggle-line-3").click(); // exclude
  await page.getByTestId("confirm-invoice").click();
  await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });
  await expect(
    page.getByTestId("invoice-row").first().getByText("Følgeseddel"),
  ).toBeVisible();
});
