import { expect, test } from "@playwright/test";

/**
 * §3.5 operating calendar:
 *  - a caterer with nothing booked is ASKED once, in one tap
 *  - answering "closed" leaves nothing due — no false overdue
 *  - the closed day reaches the inspector as "closed", not as a gap
 *  - reopening restores the day's work
 */

const run = Date.now();
const owner = {
  name: "Kalender Karen",
  email: `cal-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("closed day: asked once, nothing due, inspector sees closed", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);

  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Catering ApS ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Eventkøkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Eventkøkken/ })
    .getAttribute("href"))!.split("/")[2]!;

  // an approved programme, so there is scheduled work to suppress
  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // register the device so the Today screen shows the working view
  await page.goto(`/app/${siteId}/today`);
  await page.getByRole("button", { name: "Registrér enhed" }).click();

  // ── a caterer books work per event: nothing scheduled ⇒ ask, don't guess ──
  await page.goto(`/app/${siteId}/setup`);
  await page.getByTestId("pattern-scheduled_only").click();
  await page.getByTestId("save-pattern").click();
  await expect(page.getByText("Rytmen er gemt")).toBeVisible();

  await page.goto(`/app/${siteId}/today`);
  await expect(page.getByTestId("ask-working-today")).toBeVisible();

  // ── "no, closed" ⇒ nothing due, and the day is stored as an answer ───────
  await page.getByTestId("day-closed").click();
  await expect(page.getByTestId("closed-day-banner")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ask-working-today")).toBeHidden();
  // no task rows at all — the whole point: no false overdue
  expect(await page.locator('[data-testid^="task-"]').count()).toBe(0);

  // ── the inspector reads "closed", not a gap ─────────────────────────────
  await page.goto(`/app/${siteId}/inspection`);
  await page.getByTestId("generate-inspector-link").click();
  await expect(page.getByTestId("inspector-link-panel")).toBeVisible({ timeout: 30_000 });
  const inspectorUrl = (await page.getByTestId("inspector-link-url").innerText()).trim();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await guest.goto(`${inspectorUrl}?tab=records`);
  await expect(guest.getByTestId("inspect-header")).toBeVisible({ timeout: 30_000 });
  const cell = guest.getByTestId(`heat-${today}`);
  await expect(cell).toHaveAttribute("data-closed", "true");
  await expect(cell).toHaveAttribute("title", new RegExp("Lukket"));
  await guestContext.close();

  // ── reopening restores the day's work ───────────────────────────────────
  await page.goto(`/app/${siteId}/today`);
  await page.getByTestId("reopen-day").click();
  await expect(page.getByText("Dagen er åbnet igen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("closed-day-banner")).toBeHidden();
});
