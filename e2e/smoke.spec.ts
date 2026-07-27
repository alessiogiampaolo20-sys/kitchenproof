import { expect, test } from "@playwright/test";

/**
 * Phase 0 DoD smoke (§20): signup → create org → create site → invite operator
 * → operator accepts → manager sets PIN → device registration → PIN switch
 * (wrong PIN rejected, right PIN attributes the actor).
 * UI runs in Danish (default locale).
 */

const run = Date.now();
const owner = {
  name: "Marco Ejer",
  email: `owner-${run}@e2e.local`,
  password: "e2e-password-123",
};
const operator = {
  name: "Sofia Kok",
  email: `operator-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("full tenancy + PIN switch flow", async ({ page, browser }) => {
  // 1 — Owner signs up and creates the organization.
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");

  await page.fill("#name", `Lasagne Hub ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");

  // 2 — Owner creates a site.
  await page.fill("#site-name", "Testkøkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteCard = page.getByRole("link", { name: /Testkøkken/ });
  await expect(siteCard).toBeVisible();
  const siteHref = await siteCard.getAttribute("href");
  expect(siteHref).toMatch(/^\/app\/.+\/today$/);

  // 2b — A brand-new site shows the getting-started checklist with nothing done;
  // the "bring your existing business in" steps are offered from the start.
  const siteId = siteHref!.split("/")[2];
  await page.goto(`/app/${siteId}/setup`);
  await expect(page.getByTestId("setup-progress")).toHaveText("0 af 6 trin klar");
  for (const step of ["programme", "equipment", "pins", "catalog", "stock", "documents"]) {
    await expect(page.getByTestId(`setup-step-${step}`)).toHaveAttribute(
      "data-done",
      "false",
    );
  }
  await expect(
    page.getByTestId("setup-step-stock").getByRole("link", {
      name: "Registrér åbningslager",
    }),
  ).toBeVisible();

  // 3 — Owner invites an operator and copies the invite link.
  await page.goto("/org/members");
  await page.waitForURL("**/org/members");
  await page.fill("#invite-email", operator.email);
  await page.getByRole("button", { name: "Opret invitation" }).click();
  const inviteUrl = await page.getByTestId("invite-url").inputValue();
  expect(inviteUrl).toContain("/invite/");

  // 4 — Operator opens the link in a fresh browser, signs up, accepts.
  const opContext = await browser.newContext();
  const opPage = await opContext.newPage();
  await opPage.goto(inviteUrl);
  await opPage.getByRole("link", { name: "Opret konto" }).click();
  await opPage.waitForURL("**/signup**");
  await opPage.fill("#fullName", operator.name);
  await opPage.fill("#email", operator.email);
  await opPage.fill("#password", operator.password);
  await opPage.getByRole("button", { name: "Opret konto" }).click();
  await opPage.getByRole("button", { name: "Acceptér invitation" }).click();
  await opPage.waitForURL(/\/$/);
  await expect(opPage.getByText("Testkøkken")).toBeVisible();
  await opContext.close();

  // 5 — Owner sets the operator's PIN (site_manager+ may manage staff PINs, §4.2).
  await page.reload();
  const opRow = page
    .getByTestId("member-row")
    .filter({ hasText: operator.name });
  await expect(opRow).toBeVisible();
  await opRow.getByRole("button", { name: "Sæt PIN" }).click();
  await page.fill('input[name="pin"]', "1234");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("PIN gemt")).toBeVisible();

  // 6 — Owner opens the site as the shared kitchen device and registers it.
  await page.goto(siteHref!);
  await page.getByRole("button", { name: "Registrér enhed" }).click();
  const switchButton = page.getByRole("button", { name: "Skift bruger" });
  await expect(switchButton).toBeVisible();

  // 7 — PIN switch: pick the operator, wrong PIN rejected, right PIN wins.
  await switchButton.click();
  await page
    .locator("button", { hasText: operator.name })
    .first()
    .click();
  for (const d of ["9", "9", "9", "9"]) {
    await page.getByTestId(`pin-key-${d}`).click();
  }
  await expect(page.getByText(/Forkert PIN/)).toBeVisible();
  for (const d of ["1", "2", "3", "4"]) {
    await page.getByTestId(`pin-key-${d}`).click();
  }
  await expect(page.getByTestId("active-actor")).toContainText(operator.name);
});
