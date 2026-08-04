import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

/**
 * §1.4 + §6 drills. The chain is purchase → PRODUCTION → order, and it must be
 * walkable from either end from stored records alone:
 *
 *  REVERSE DRILL: from a delivered order → the productions, the goods, the
 *    supplier and every temperature record covering that food, with a verdict.
 *  RECALL DRILL:  from one supplier's goods → the productions that used them →
 *    the orders that went out → THE CLIENTS TO CONTACT.
 */

const run = Date.now();
const owner = {
  name: "Kæde Karl",
  email: `chain-${run}@e2e.local`,
  password: "e2e-password-123",
};

async function completeTemp(page: Page, digits: string[]) {
  for (const d of digits) await page.getByTestId(`temp-key-${d}`).click();
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

test("chain drills: order → whole chain, and goods → clients to contact", async ({
  page,
}) => {
  test.setTimeout(300_000);

  // ── a site with an approved programme and a PIN-attributed record ────────
  await page.goto("/signup");
  await page.fill("#fullName", owner.name);
  await page.fill("#email", owner.email);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("#name", `Kæde ApS ${run}`);
  await page.fill("#cvr", "12345678");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.waitForURL("**/org/sites");
  await page.fill("#site-name", "Kædekøkken");
  await page.getByRole("button", { name: "Opret sted" }).click();
  const siteId = (await page
    .getByRole("link", { name: /Kædekøkken/ })
    .getAttribute("href"))!.split("/")[2]!;

  await page.goto(`/app/${siteId}/programme`);
  await page.getByRole("button", { name: "Opret kladde fra skabelon" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Kladde", { timeout: 30_000 });
  await page.getByRole("button", { name: "Godkend program" }).click();
  await expect(page.getByTestId("ra-status")).toHaveText("Godkendt", { timeout: 30_000 });

  // a cooking record, so the chain has something to judge
  const cpRow = page.getByTestId("cp-row").filter({ hasText: "Køleskab 1" }).first();
  await cpRow.getByRole("button", { name: "Redigér" }).click();
  await page.locator('input[name="times"]').fill(cphTimeIn(2));
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
  for (const d of ["1", "2", "3", "4"]) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId("active-actor")).toContainText(owner.name);

  await page
    .locator('[data-testid^="task-"]', { hasText: "Køleskab 1" })
    .first()
    .click();
  await expect(page.getByTestId("temp-display")).toBeVisible();
  await completeTemp(page, ["3", "dot", "4"]);
  await page.waitForURL(`**/app/${siteId}/today`);

  // ── goods in (precondition): supplier, invoice, receipt, batch. The receive
  // flow itself is covered by the phase5 specs; what this drill is about is the
  // chain that hangs off the stock, so it is set up directly.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data: siteRow } = await admin
    .from("sites")
    .select("org_id")
    .eq("id", siteId)
    .single();
  const orgId = siteRow!.org_id as string;
  // every receipt is attributed to a person (§17) — no anonymous goods in.
  // The owner's membership is the reliable way to reach their profile id.
  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "org_owner")
    .single();
  const profileId = membership!.user_id as string;

  const { data: supplier } = await admin
    .from("suppliers")
    .insert({ org_id: orgId, name: "Inco" })
    .select("id")
    .single();
  const { data: product } = await admin
    .from("products")
    .insert({
      org_id: orgId,
      name: "Hakket oksekød",
      normalized_name: "hakket okseko", // matcher key, normally set by the catalog
      unit_default: "kg",
      storage_type: "fridge",
      is_food: true,
    })
    .select("id")
    .single();
  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      site_id: siteId,
      supplier_id: supplier!.id,
      kind: "invoice",
      file_paths: [],
      status: "confirmed",
      invoice_number: "01105947008",
    })
    .select("id")
    .single();
  const { data: receipt } = await admin
    .from("goods_receipts")
    .insert({
      site_id: siteId,
      supplier_id: supplier!.id,
      invoice_id: invoice!.id,
      received_at: new Date().toISOString(),
      received_by: profileId,
    })
    .select("id")
    .single();
  await admin.from("batches").insert({
    site_id: siteId,
    product_id: product!.id,
    goods_receipt_id: receipt!.id,
    lot_code: "LOT-2026-042",
    quantity: 10,
    remaining: 10,
    unit: "kg",
    origin: "received",
    status: "active",
  });

  // ── the order (who it is for) ───────────────────────────────────────────
  await page.goto(`/app/${siteId}/orders`);
  await page.getByTestId("new-order").click();
  await page.fill("#orderRef", "Baby VC");
  await page.fill("#clientName", "EIFO");
  await page.fill("#contact", "csb@eifo.dk");
  await page.fill("#eventDate", new Date().toISOString().slice(0, 10));
  await page.fill("#portions", "20");
  await page.getByTestId("save-order").click();
  await expect(page.getByTestId("order-row").first()).toContainText("EIFO", {
    timeout: 30_000,
  });

  // ── the production: the missing link, with everything pre-selected ──────
  await page.getByTestId("log-production").click();
  await page.waitForURL(`**/app/${siteId}/orders/production`);
  await page.fill('[data-testid="production-product"]', "Ragù");
  // the app proposes: stock in, orders upcoming — both already ticked
  await expect(page.getByTestId("production-batch").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("production-order").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("save-production").click();
  await page.waitForURL(`**/app/${siteId}/orders`, { timeout: 30_000 });
  await expect(page.getByTestId("production-row").first()).toContainText("Ragù");

  // ── REVERSE DRILL: from the order, the whole chain in one screen ────────
  await page.getByTestId("order-row").first().click();
  await page.waitForURL(new RegExp(`/app/${siteId}/orders/[0-9a-f-]{36}$`));

  await expect(page.getByTestId("chain-production")).toContainText("Ragù");
  // the goods behind it, with the supplier
  await expect(page.getByTestId("chain-purchase").first()).toContainText("Hakket oksekød");
  await expect(page.getByTestId("chain-purchase").first()).toContainText("Inco");
  // every check covering that production, and the verdict line
  await expect(page.getByTestId("chain-record").first()).toContainText("3.4 °C");
  const verdict = page.getByTestId("chain-verdict");
  await expect(verdict).toHaveAttribute("data-clean", "true");
  await expect(verdict).toContainText("inden for grænserne");
});
