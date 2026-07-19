import { expect, test } from "@playwright/test";

/**
 * Phase 7 DoD (§13): the compliance assistant always cites in-scope answers
 * and refuses out-of-scope questions with a referral — never improvises.
 * Fixture provider keys on the question slug (deterministic in CI).
 */

const run = Date.now();
const owner = {
  name: "Astrid Assistent",
  email: `p7-assist-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("assistant: cited answer in scope, refusal out of scope", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Assistent ApS ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Assistent Køkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Assistent Køkken/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${siteId}/assistant`);
  await expect(page.getByTestId("assistant-disclaimer")).toBeVisible();

  // ── in scope: answer WITH mandatory citations ─────────────────────────────
  await page.getByTestId("assistant-question").fill("Hvor hurtigt skal maden køles ned?");
  await page.getByTestId("assistant-send").click();
  const first = page.getByTestId("assistant-exchange").first();
  await expect(first.getByTestId("assistant-answer")).toContainText("56 °C til 10 °C", {
    timeout: 30_000,
  });
  await expect(first.getByTestId("assistant-citation").first()).toHaveText(
    "DK-HYGIEJNE §kap. 26.7",
  );
  await expect(first.getByTestId("assistant-refusal")).toHaveCount(0);

  // ── out of scope (VAT): explicit refusal, zero citations ──────────────────
  await page.getByTestId("assistant-question").fill("Hvordan beregner jeg moms af salget?");
  await page.getByTestId("assistant-send").click();
  const second = page.getByTestId("assistant-exchange").nth(1);
  await expect(second.getByTestId("assistant-refusal")).toBeVisible({ timeout: 30_000 });
  await expect(second.getByTestId("assistant-answer")).toContainText("uden for");
  await expect(second.getByTestId("assistant-citation")).toHaveCount(0);
});
