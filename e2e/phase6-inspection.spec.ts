import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 DoD (§10/§20):
 *  - inspector link shows the read-only truth on an UNAUTHENTICATED device
 *  - guest lock: escape attempts bounce, wrong PIN stays locked, manager PIN exits
 *  - exports match on-screen data (PDF text contains the on-screen CP + record)
 *  - audit rows written for start/link/view/export
 */

const run = Date.now();
const owner = {
  name: "Ingrid Inspektor",
  email: `p6-owner-${run}@e2e.local`,
  password: "e2e-password-123",
};

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

async function completeTemp(page: Page, digits: string[]) {
  for (const d of digits) {
    await page.getByTestId(`temp-key-${d}`).click();
  }
  await page.getByTestId("temp-confirm").click();
}

function cphTimeIn(minutes: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Date.now() + minutes * 60_000));
}

test("inspection: guest lock, magic link truth, exports, audit", async ({ page, browser }) => {
  test.setTimeout(300_000);

  // ── setup: org/site/programme approved + PIN + one real record ────────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Kontrolklar ApS ${run}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Kontrolklar Køkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Kontrolklar Køkken/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // move a fridge check to now so the day has a completable task
  const dueTime = cphTimeIn(2);
  const cpRow = page.getByTestId("cp-row").filter({ hasText: "Køleskab 1" }).first();
  await cpRow.getByRole("button", { name: "Redigér" }).click();
  await page.locator('input[name="times"]').fill(dueTime);
  await page.getByRole("dialog").getByRole("button", { name: "Redigér" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

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

  // one PIN-attributed record (3.4 °C on Køleskab 1)
  await page
    .locator('[data-testid^="task-"]', { hasText: "Køleskab 1" })
    .first()
    .click();
  await expect(page.getByTestId("temp-display")).toBeVisible();
  await completeTemp(page, ["3", "dot", "4"]);
  await page.waitForURL(`**/app/${siteId}/today`);

  // ── magic link BEFORE the lock (manager generates it) ─────────────────────
  await page.getByTestId("kontrolbesog-button").click();
  await page.waitForURL(`**/app/${siteId}/inspection`);
  await page.getByTestId("generate-inspector-link").click();
  await expect(page.getByTestId("inspector-link-panel")).toBeVisible({ timeout: 30_000 });
  const inspectorUrl = (await page.getByTestId("inspector-link-url").innerText()).trim();
  expect(inspectorUrl).toContain("/inspect/");

  // on-screen truth (used later to compare exports)
  await expect(page.getByTestId("approval-block")).toContainText(owner.name);
  const cpCount = await page.getByTestId("inspection-cp").count();
  expect(cpCount).toBeGreaterThanOrEqual(10);

  // ── guest lock: start → bounce → wrong PIN → manager PIN exits ────────────
  await page.getByTestId("start-inspection").click();
  await page.getByTestId("confirm-inspection").click();
  await expect(page.getByTestId("inspection-banner")).toBeVisible({ timeout: 15_000 });

  await page.goto(`/app/${siteId}/today`); // escape attempt
  await page.waitForURL(`**/app/${siteId}/inspection`);
  await expect(page.getByTestId("inspection-banner")).toBeVisible();

  await page.getByTestId("exit-inspection").click();
  await page.getByTestId("exit-pin").fill("9999");
  await page.getByTestId("exit-confirm").click();
  await expect(page.getByTestId("exit-error")).toBeVisible();
  await page.getByTestId("exit-pin").fill("1234");
  await page.getByTestId("exit-confirm").click();
  await page.waitForURL(`**/app/${siteId}/today`, { timeout: 30_000 });

  // ── inspector's own device: fresh unauthenticated context ─────────────────
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();

  // sanity: the guest context is NOT logged in
  await guest.goto(`/app/${siteId}/today`);
  await guest.waitForURL("**/login**");

  await guest.goto(inspectorUrl);
  await expect(guest.getByTestId("inspect-header")).toBeVisible({ timeout: 30_000 });
  // read-only truth: same approval + same CP count as on-screen
  await expect(guest.getByTestId("approval-block")).toContainText(owner.name);
  expect(await guest.getByTestId("inspection-cp").count()).toBe(cpCount);
  // records tab shows the PIN-attributed 3.4 °C record with the person
  await guest.getByTestId("inspection-tab-records").click();
  await expect(guest.getByTestId("record-row").first()).toContainText("3.4 °C");
  await expect(guest.getByTestId("record-row").first()).toContainText(owner.name);
  await expect(guest.getByTestId("records-heatmap")).toBeVisible();
  // strictly read-only: no write affordances anywhere
  expect(await guest.getByRole("button", { name: /Godkend|Gem|Upload/ }).count()).toBe(0);

  // invalid token fails closed
  await guest.goto(inspectorUrl.replace(/[^/]+$/, "invalid-token-000"));
  await expect(guest.getByTestId("inspect-invalid")).toBeVisible();

  // ── exports match on-screen (PDF text contains CP + record value) ─────────
  const token = inspectorUrl.split("/inspect/")[1]!;
  const programmePdf = await guest.request.get(
    `/inspect/${token}/export?tab=programme`,
  );
  expect(programmePdf.status()).toBe(200);
  expect(programmePdf.headers()["content-type"]).toContain("pdf");
  const { PDFParse } = await import("pdf-parse");
  const programmeText = (
    await new PDFParse({ data: new Uint8Array(await programmePdf.body()) }).getText()
  ).text;
  expect(programmeText).toContain("Kontrolklar Køkken");
  expect(programmeText).toContain("Køleskab 1"); // on-screen CP appears in the export
  expect(programmeText).toContain("DK-"); // sourceRef column populated

  const recordsPdf = await guest.request.get(`/inspect/${token}/export?tab=records`);
  const recordsText = (
    await new PDFParse({ data: new Uint8Array(await recordsPdf.body()) }).getText()
  ).text;
  expect(recordsText).toContain("3.4"); // the on-screen record value
  expect(recordsText).toContain(owner.name); // person attribution

  const bundle = await guest.request.get(`/inspect/${token}/export?tab=bundle`);
  expect(bundle.status()).toBe(200);
  expect(bundle.headers()["content-type"]).toContain("zip");
  expect((await bundle.body()).length).toBeGreaterThan(5000);

  await guestContext.close();

  // ── audit rows written (DoD) ──────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data: audits } = await admin
    .from("audit_log")
    .select("action")
    .eq("site_id", siteId);
  const actions = new Set((audits ?? []).map((row) => row.action));
  for (const expected of [
    "inspection.started",
    "inspection.ended",
    "inspector_link.created",
    "inspection.link_viewed",
    "inspection.exported",
  ]) {
    expect(actions.has(expected), expected).toBe(true);
  }
});
