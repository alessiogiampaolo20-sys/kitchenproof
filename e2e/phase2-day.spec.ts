import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2 DoD (§20): a full simulated day on a mobile viewport —
 * complete tasks, force a fail → 3-step corrective flow → follow-up
 * verification task → verified; every record PIN-attributed.
 */

const run = Date.now();
const owner = {
  name: "Sofia Kokken",
  email: `p2-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

async function completeTemp(page: Page, digits: string[]) {
  for (const d of digits) {
    await page.getByTestId(`temp-key-${d}`).click();
  }
  await page.getByTestId("temp-confirm").click();
}

/** Wall-clock HH:MM in the site TZ, n minutes from now (times are site-local). */
function cphTimeIn(minutes: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Date.now() + minutes * 60_000));
}

test("full day: pass, fail→corrective→verification, PIN attribution", async ({ page }) => {
  test.setTimeout(240_000);
  // ── Setup: org → site → programme → approval ──────────────────────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Dagens Køkken ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Dagskøkkenet");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteHref = (await page
    .getByRole("link", { name: /Dagskøkkenet/ })
    .getAttribute("href"))!;
  const siteId = siteHref.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // Deterministic schedule at any run time: move both fridge checks to +2 min
  // via the programme editor (also exercises the reschedule path).
  const dueTime = cphTimeIn(2);
  for (const fridge of ["Køleskab 1", "Køleskab 2"]) {
    const cpRow = page.getByTestId("cp-row").filter({ hasText: fridge }).first();
    await cpRow.getByRole("button", { name: "Redigér" }).click();
    const timesInput = page.locator('input[name="times"]');
    await timesInput.fill(dueTime);
    await page.getByRole("dialog").getByRole("button", { name: "Redigér" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  // ── PIN: set own PIN, register device, switch ─────────────────────────────
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

  // ── 1. Passing temperature check (Køleskab 1 → 3.4 °C) ────────────────────
  await page
    .locator('[data-testid^="task-"]', { hasText: "Køleskab 1" })
    .first()
    .click();
  await expect(page.getByTestId("temp-display")).toBeVisible();
  // §3.3 + DK-HYGIEJNE kap. 26.2: the screen says WHICH temperature to take,
  // so nobody measures the air when the limit is about the food (or vice versa)
  await expect(page.getByTestId("measure-what")).toContainText("lufttemperaturen");
  await completeTemp(page, ["3", "dot", "4"]);
  await page.waitForURL(`**/app/${siteId}/today`);
  await expect(page.getByTestId("progress-label")).toContainText("1 af");

  // ── 2. Failing check (Køleskab 2 → 12 °C) → 3-step corrective sheet ───────
  await page
    .locator('[data-testid^="task-"]', { hasText: "Køleskab 2" })
    .first()
    .click();
  await completeTemp(page, ["1", "2"]);
  await expect(page.getByText("Afvigelse — hvad nu?")).toBeVisible();
  await page.getByTestId("food-discarded").click();
  await page.getByTestId("fix-thermostat").click();
  await page.getByTestId("deviation-submit").click();
  await page.waitForURL(`**/app/${siteId}/today`);

  // ── 3. Deviation recorded: major, corrected, PIN-attributed ───────────────
  await page.goto(`/app/${siteId}/deviations`);
  const deviationRow = page.getByTestId("deviation-row").first();
  await expect(deviationRow).toContainText("12 °C");
  await expect(deviationRow).toContainText("Alvorlig"); // 12 vs 5 → major (§8.3)
  await expect(deviationRow.getByTestId("deviation-status")).toHaveText("Korrigeret");
  await expect(deviationRow).toContainText(owner.name); // detected by (PIN actor)

  // ── 4. Follow-up verification task → re-check passes → verified ───────────
  await deviationRow.getByTestId("deviation-followup-link").click();
  await expect(page.getByText("Opfølgende kontrol")).toBeVisible();
  await completeTemp(page, ["4"]);
  await page.waitForURL(`**/app/${siteId}/today`);
  await page.goto(`/app/${siteId}/deviations?filter=all`);
  await expect(
    page.getByTestId("deviation-row").first().getByTestId("deviation-status"),
  ).toHaveText("Verificeret");

  // ── 5. Cleaning checklist with one ✗ + reason → minor deviation ───────────
  await page.goto(`/app/${siteId}/today`);
  await page
    .locator('[data-testid^="task-"]', { hasText: "Rengøring" })
    .first()
    .click();
  const firstItem = page.locator('[data-testid^="chk-"][data-testid$="-fail"]').first();
  await firstItem.click();
  await page.locator('[data-testid$="-reason-dirty"]').first().click();
  await page.getByTestId("checklist-confirm").click();
  await expect(page.getByText("Afvigelse — hvad nu?")).toBeVisible();
  await page.getByTestId("food-na").click();
  await page.getByTestId("fix-cleaned").click();
  await page.getByTestId("deviation-submit").click();
  await page.waitForURL(`**/app/${siteId}/today`);

  // ── 6. Ad-hoc record ──────────────────────────────────────────────────────
  await page.getByTestId("adhoc-open").click();
  await page.getByRole("button", { name: "Notat" }).click();
  await page.getByPlaceholder("Beskrivelse").fill("Modtog ny leverandøraftale");
  await page.getByTestId("adhoc-submit").click();
  await expect(page.getByTestId("adhoc-submit")).toBeHidden();

  // ── 7. Reports: records visible and PIN-attributed ────────────────────────
  await page.goto(`/app/${siteId}/reports`);
  await expect(page.getByTestId("temp-chart")).toBeVisible();
  const records = page.getByTestId("record-row");
  expect(await records.count()).toBeGreaterThanOrEqual(4);
  const attributions = page.getByTestId("record-by");
  for (let i = 0; i < (await attributions.count()); i++) {
    await expect(attributions.nth(i)).toContainText(owner.name);
  }
});
