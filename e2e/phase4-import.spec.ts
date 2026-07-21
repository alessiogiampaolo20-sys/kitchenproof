import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Phase 4 DoD e2e — §7.5 import pipeline with fixture extraction:
 *  - official filled PDF: upload → extraction → gap detected (empty corrective
 *    cell on a critical row) → empty cells stay VISIBLY empty (nothing
 *    hallucinated) → human fills the gap → confirm → draft with provenance
 *  - consultant DOCX: missing expected section detected → gap mini-wizard adds
 *    a human row → confirm
 * Requires AI_PROVIDER=fixture and a published DK pack.
 */

const run = Date.now();
const owner = {
  name: "Iris Import",
  email: `p4-import-${run}@e2e.local`,
  password: "e2e-password-123",
};

test("import: official PDF + consultant DOCX → gaps, review, draft", async ({ page }) => {
  test.setTimeout(180_000);

  // Signup → org → restaurant site
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Trattoria Import ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Trattoria Nørrebro");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteCard = page.getByRole("link", { name: /Trattoria Nørrebro/ });
  await expect(siteCard).toBeVisible();
  const siteId = (await siteCard.getAttribute("href"))!.split("/")[2]!;

  // ── Import 1: filled official PDF ─────────────────────────────────────────
  await page.goto(`/app/${siteId}/programme`);
  await page.getByTestId("start-import").click();
  await page.waitForURL(`**/app/${siteId}/programme/import`);
  await page
    .getByTestId("import-files")
    .setInputFiles(resolve("fixtures/imports/official-skema-filled.pdf"));
  await page.getByTestId("import-submit").click();
  await page.waitForURL("**/programme/import/review/**", { timeout: 60_000 });

  // gap analysis: the critical frozen-goods row has an empty corrective cell
  await expect(page.getByTestId("import-gaps")).toBeVisible();
  await expect(page.getByTestId("gap-empty-critical")).toHaveCount(1);
  await expect(page.getByTestId("gap-empty-critical")).toContainText(
    "modtagelse.frozen",
  );

  // §7.5: empty cells are VISIBLY empty — never filled with plausible text
  const frozenRow = page.getByTestId("import-row-modtagelse.frozen");
  await expect(frozenRow.getByTestId("cell-empty")).toHaveCount(1);
  await expect(frozenRow.locator('textarea[data-testid$="-ifItGoesWrong"]')).toHaveValue("");

  // provenance: page badges from the original document
  await expect(page.getByTestId("provenance-page").first()).toContainText("s. 1");

  // extracted text is verbatim from the fixture (side-by-side check)
  await expect(
    page.getByTestId("import-row-modtagelse.chilled").locator("textarea").first(),
  ).toHaveValue("Kølevarer leveres mandag og torsdag fra Dansk Cater.");

  // the human fills the gap (asked, not hallucinated)
  await frozenRow
    .locator('textarea[data-testid$="-ifItGoesWrong"]')
    .fill("Varen afvises og leverandøren kontaktes.");

  // confirm → draft risk analysis
  await page.getByTestId("import-confirm").click();
  await page.waitForURL(`**/app/${siteId}/programme`, { timeout: 30_000 });
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });

  // mapped rows visible with AI provenance badges; CPs generated from critical
  // rows via the pack template mapping + prerequisites
  await expect(page.getByTestId("ai-badge").first()).toBeVisible();
  const cpRows = page.getByTestId("cp-row");
  expect(await cpRows.count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId("cp-source").first()).toContainText(/DK-/);

  // ── Import 2: consultant DOCX (missing section → mini-wizard) ─────────────
  await page.goto(`/app/${siteId}/programme/import`);
  await page
    .getByTestId("import-files")
    .setInputFiles(resolve("fixtures/imports/consultant-word.docx"));
  await page.getByTestId("import-submit").click();
  await page.waitForURL("**/programme/import/review/**", { timeout: 60_000 });

  // gap: expected section missing for the activity type
  await expect(page.getByTestId("gap-missing-section")).toHaveCount(1);
  // free-form consultant rows mapped; unknown rows kept as custom with label
  await expect(page.getByTestId("import-row-custom")).toBeVisible();

  // mini-wizard: the missing section is ASKED — the human adds the row
  await page.getByTestId("add-row-salg_servering").click();
  const addedRow = page.getByTestId("import-row-custom").last();
  await addedRow
    .locator('textarea[data-testid$="-whatYouDo"]')
    .fill("Servering af dagens ret i kantinen.");

  await page.getByTestId("import-confirm").click();
  await page.waitForURL(`**/app/${siteId}/programme`, { timeout: 30_000 });
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde");

  // both imports listed with confirmed status
  await page.goto(`/app/${siteId}/programme/import`);
  const importRows = page.getByTestId("import-row");
  await expect(importRows).toHaveCount(2);
  await expect(importRows.first().getByText("Bekræftet")).toBeVisible();
});
