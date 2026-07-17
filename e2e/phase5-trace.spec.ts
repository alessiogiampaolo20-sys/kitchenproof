import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Phase 5 (§9.6/§9.7) — trace search (<2 s DoD), recall report, B2B outbound:
 *  - lot search returns in/stock/out incl. the B2B customer who received it
 *  - timed search under 2 seconds (warm route)
 *  - recall report PDF generated + stored (recall_events)
 *  - outbound: moves sale_b2b + stock decrement + delivery note
 */

const run = Date.now();
const owner = {
  name: "Trine Trace",
  email: `p5-trace-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("trace search <2s, recall PDF, B2B outbound", async ({ page }) => {
  test.setTimeout(240_000);

  // ── setup: org/site/programme/PIN + 2 confirmed invoices ──────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Sporbar ApS ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Sporbar Køkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Sporbar Køkken/ })
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

  for (const file of ["dansk-cater-faktura.pdf", "grossisten-flerside.pdf"]) {
    await page.goto(`/app/${siteId}/receive`);
    await page.getByTestId("invoice-files").setInputFiles(resolve(`fixtures/invoices/${file}`));
    await page.getByTestId("invoice-submit").click();
    await page.waitForURL("**/receive/review/**", { timeout: 60_000 });
    await page.getByTestId("confirm-invoice").click();
    await page.waitForURL(`**/app/${siteId}/receive`, { timeout: 30_000 });
  }

  // ── §9.7 outbound: partial mozzarella delivery to a new B2B customer ──────
  await page.goto(`/app/${siteId}/stock/outbound`);
  await page.getByTestId("outbound-customer-name").fill("Café Kunden");
  const mozzarella = page
    .locator('[data-testid^="outbound-batch-"]')
    .filter({ hasText: "L2607A" })
    .first();
  await mozzarella.click();
  const batchTestId = await mozzarella.getAttribute("data-testid");
  const batchId = batchTestId!.replace("outbound-batch-", "");
  await page.getByTestId(`outbound-qty-${batchId}`).fill("8");
  await page.getByTestId("outbound-submit").click();
  // delivery note stored in exports, offered as an explicit link
  await expect(page.getByTestId("delivery-note-link")).toBeVisible({ timeout: 30_000 });
  expect(await page.getByTestId("delivery-note-link").getAttribute("href")).toContain(
    "exports",
  );

  // ── §9.6 trace search on the delivered lot — timed after warm-up ──────────
  await page.goto(`/app/${siteId}/trace`); // warm the route
  await expect(page.getByTestId("trace-query")).toBeVisible();

  const t0 = Date.now();
  await page.goto(`/app/${siteId}/trace?q=L2607A`);
  await expect(page.getByTestId("trace-batch").first()).toBeVisible();
  const elapsed = Date.now() - t0;
  console.log(`trace search: ${elapsed} ms`);
  expect(elapsed).toBeLessThan(2000); // §9.6 DoD

  // in: supplier + invoice; out: delivered to the B2B customer
  await expect(page.getByTestId("trace-batch").first()).toContainText("Dansk Cater");
  await expect(page.getByTestId("trace-batch").first()).toContainText("F-88412");
  const deliveredMove = page.getByTestId("trace-move").filter({ hasText: "Café Kunden" });
  await expect(deliveredMove.first()).toContainText("leveret 8");
  // stock reflects the partial delivery (32 − 8 = 24)
  await expect(page.getByTestId("trace-batch").first()).toContainText("24/32");

  // ── recall report over the search scope ───────────────────────────────────
  await page.getByTestId("recall-button").click();
  await page.getByTestId("recall-reason").fill("Leverandøren har meldt Listeria-fund i lot L2607A.");
  await page.getByTestId("recall-generate").click();
  // PDF stored in exports (recall_events row), offered as an explicit link
  await expect(page.getByTestId("recall-open")).toBeVisible({ timeout: 30_000 });
  expect(await page.getByTestId("recall-open").getAttribute("href")).toContain("exports");
});
