import { expect, test } from "@playwright/test";

/**
 * Phase 1 DoD e2e (mobile viewport): template → draft → approve → live
 * schedule; control points expose their corpus sourceRef; equipment cards and
 * QR deep-links resolve. Requires the DK pack to be published (pnpm db:seed).
 */

const run = Date.now();
const owner = {
  name: "Paolo Pizzaiolo",
  email: `p1-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("template → approval → schedule, equipment QR deep-link", async ({ page }) => {
  // Signup → org → restaurant site
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Pizzeria Napoli ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Napoli København");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteCard = page.getByRole("link", { name: /Napoli København/ });
  await expect(siteCard).toBeVisible();
  const siteHref = (await siteCard.getAttribute("href"))!;
  const siteId = siteHref.split("/")[2]!;

  // Programme: start from template
  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });

  // Control points visible with limits and corpus sourceRefs (DoD)
  const cpRows = page.getByTestId("cp-row");
  await expect(cpRows.first()).toBeVisible();
  expect(await cpRows.count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId("cp-source").first()).toContainText(/DK-(HYGIEJNE|EK-EXAMPLE)/);
  await expect(
    page.getByTestId("cp-limit").filter({ hasText: "≤ 5 °C" }).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("cp-limit").filter({ hasText: "56→10 °C / 240 min" }).first(),
  ).toBeVisible();

  // Approve → schedule goes live
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // Equipment from the template: 2 fridges + freezer + hot holding
  await page.goto(`/app/${siteId}/equipment`);
  const cards = page.getByTestId("equipment-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBe(4);

  // Open a unit: QR + deep link shown
  await cards.first().click();
  await expect(page.getByTestId("equipment-qr")).toBeVisible();
  const equipmentUrl = page.url();
  const deepLink = await page
    .locator("p.font-mono")
    .first()
    .innerText();
  expect(deepLink).toContain(`/app/${siteId}/scan?token=`);

  // QR deep-link resolves back to the unit (DoD)
  await page.goto(deepLink);
  await page.waitForURL(equipmentUrl);
  await expect(page.getByTestId("equipment-name")).toBeVisible();

  // Foreign/garbage tokens fail closed
  await page.goto(`/app/${siteId}/scan?token=000000000000000000000000`);
  await expect(page.getByTestId("scan-invalid")).toBeVisible();
});
