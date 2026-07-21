import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 DoD (§20): airplane-mode day — checks completed offline via the
 * inline flows, queue visible, reconnection drains the outbox, server state
 * correct (incl. the composite fail → 3-step corrective flow).
 */

const run = Date.now();
const owner = {
  name: "Nadia Natkøkken",
  email: `p3-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

function cphTimeIn(minutes: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Date.now() + minutes * 60_000));
}

async function typeTemp(page: Page, digits: string[]) {
  for (const d of digits) {
    await page.getByTestId(`temp-key-${d}`).click();
  }
  await page.getByTestId("temp-confirm").click();
}

test("airplane-mode day: offline checks → queue → drain → server truth", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);

  // ── Online setup: org → site → programme → near-time fridge checks ────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Lufthavnskøkkenet ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Flyveren");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteHref = (await page
    .getByRole("link", { name: /Flyveren/ })
    .getAttribute("href"))!;
  const siteId = siteHref.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  const dueTime = cphTimeIn(2);
  for (const fridge of ["Køleskab 1", "Køleskab 2"]) {
    const cpRow = page.getByTestId("cp-row").filter({ hasText: fridge }).first();
    await cpRow.getByRole("button", { name: "Redigér" }).click();
    await page.locator('input[name="times"]').fill(dueTime);
    await page.getByRole("dialog").getByRole("button", { name: "Redigér" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  // PIN + device
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
  await expect(
    page.locator('[data-testid^="task-"]', { hasText: "Køleskab 1" }).first(),
  ).toBeVisible();

  // ── Airplane mode ──────────────────────────────────────────────────────────
  await context.setOffline(true);
  await expect(page.getByTestId("offline-pill")).toBeVisible();

  // Offline check 1: pass → queued (inline dialog, no navigation)
  await page
    .locator('[data-testid^="task-"]', { hasText: "Køleskab 1" })
    .first()
    .click();
  await expect(page.getByTestId("temp-display")).toBeVisible();
  await typeTemp(page, ["3", "dot", "4"]);
  await expect(page.getByTestId("offline-pill")).toContainText("1");
  expect(page.url()).toContain("/today"); // never navigated away

  // Offline check 2: fail → offline 3-step corrective sheet → queued
  await page
    .locator('[data-testid^="task-"]', { hasText: "Køleskab 2" })
    .first()
    .click();
  await typeTemp(page, ["1", "2"]);
  await expect(page.getByText("Afvigelse — hvad nu?")).toBeVisible();
  await page.getByTestId("food-discarded").click();
  await page.getByTestId("fix-thermostat").click();
  await page.getByTestId("deviation-submit").click();
  await expect(page.getByTestId("offline-pill")).toContainText("2");

  // ── Reconnect: the queue drains and the server takes over ────────────────
  await context.setOffline(false);
  await expect(page.getByTestId("offline-pill")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("progress-label")).toContainText("2 af", {
    timeout: 30_000,
  });

  // Server truth after reload: completions, composite deviation, follow-up
  await page.reload();
  await expect(page.getByTestId("progress-label")).toContainText("2 af");

  await page.goto(`/app/${siteId}/deviations`);
  const deviationRow = page.getByTestId("deviation-row").first();
  await expect(deviationRow).toContainText("12 °C");
  await expect(deviationRow.getByTestId("deviation-status")).toHaveText("Korrigeret");
  await expect(deviationRow).toContainText(owner.name);
  await expect(deviationRow.getByTestId("deviation-followup-link")).toBeVisible();

  await page.goto(`/app/${siteId}/reports`);
  const attributions = page.getByTestId("record-by");
  expect(await attributions.count()).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < (await attributions.count()); i++) {
    await expect(attributions.nth(i)).toContainText(owner.name);
  }
});
