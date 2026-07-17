import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  ensurePackPublished,
  signIn,
  type Client,
} from "./helpers";

/**
 * Phase 5 fail-closed proof (§6.4/§17): cross-tenant isolation on every
 * traceability table, append-only enforcement on goods_receipts /
 * inventory_moves / recall_events, and the invoices lifecycle guard
 * (status forward-only, extraction write-once, lines frozen after confirm).
 */

const run = Date.now();
const OWNER_A = `m3-${run}-a@test.local`;
const OWNER_B = `m3-${run}-b@test.local`;

let ownerA: Client;
let ownerB: Client;
let orgA: string;
let siteA: string;
let profileA: string;
let supplierId: string;
let productId: string;
let invoiceId: string;
let lineId: string;
let receiptId: string;
let batchId: string;
let moveId: string;

beforeAll(async () => {
  const admin = adminClient();
  await ensurePackPublished(admin);
  await createUser(admin, OWNER_A, "M3 Owner A");
  await createUser(admin, OWNER_B, "M3 Owner B");
  ownerA = await signIn(OWNER_A);
  ownerB = await signIn(OWNER_B);
  profileA = (await ownerA.auth.getUser()).data.user!.id;

  const a = await ownerA.rpc("create_organization", { p_name: `M3 A ${run}` });
  orgA = a.data as string;
  await ownerB.rpc("create_organization", { p_name: `M3 B ${run}` });

  const site = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "Trace Site", activity_type: "restaurant" })
    .select("id")
    .single();
  siteA = site.data!.id;

  supplierId = (
    await ownerA
      .from("suppliers")
      .insert({ org_id: orgA, name: "Leverandør A", cvr: "11223344" })
      .select("id")
      .single()
  ).data!.id;
  productId = (
    await ownerA
      .from("products")
      .insert({ org_id: orgA, name: "Testvare", normalized_name: "testvare" })
      .select("id")
      .single()
  ).data!.id;
  invoiceId = (
    await ownerA
      .from("invoices")
      .insert({ site_id: siteA, file_paths: ["x.pdf"], supplier_id: supplierId })
      .select("id")
      .single()
  ).data!.id;
  lineId = (
    await ownerA
      .from("invoice_lines")
      .insert({
        invoice_id: invoiceId,
        line_no: 1,
        raw_text: "TESTVARE 1KG",
        description: "Testvare",
        product_id: productId,
      })
      .select("id")
      .single()
  ).data!.id;
  receiptId = (
    await ownerA
      .from("goods_receipts")
      .insert({ site_id: siteA, supplier_id: supplierId, received_by: profileA })
      .select("id")
      .single()
  ).data!.id;
  batchId = (
    await ownerA
      .from("batches")
      .insert({
        site_id: siteA,
        product_id: productId,
        goods_receipt_id: receiptId,
        lot_code: "LOT-1",
        quantity: 10,
        unit: "kg",
        remaining: 10,
      })
      .select("id")
      .single()
  ).data!.id;
  moveId = (
    await ownerA
      .from("inventory_moves")
      .insert({
        site_id: siteA,
        batch_id: batchId,
        kind: "receive",
        quantity: 10,
        moved_by: profileA,
      })
      .select("id")
      .single()
  ).data!.id;
});

describe("cross-tenant isolation (§6.4)", () => {
  it("org B sees none of org A's traceability data", async () => {
    expect((await ownerB.from("suppliers").select("id").eq("org_id", orgA)).data).toEqual([]);
    expect((await ownerB.from("products").select("id").eq("org_id", orgA)).data).toEqual([]);
    expect((await ownerB.from("invoices").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("invoice_lines").select("id").eq("invoice_id", invoiceId)).data).toEqual([]);
    expect((await ownerB.from("goods_receipts").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("batches").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("inventory_moves").select("id").eq("site_id", siteA)).data).toEqual([]);
    expect((await ownerB.from("v_traceability_lookup").select("batch_id").eq("site_id", siteA)).data).toEqual([]);
  });

  it("org B cannot write into org A", async () => {
    const supplier = await ownerB
      .from("suppliers")
      .insert({ org_id: orgA, name: "Intruso" });
    expect(supplier.error).not.toBeNull();
    const move = await ownerB.from("inventory_moves").insert({
      site_id: siteA,
      batch_id: batchId,
      kind: "waste",
      quantity: 1,
      reason: "other",
      moved_by: profileA,
    });
    expect(move.error).not.toBeNull();
  });
});

describe("append-only records (§17)", () => {
  it("goods_receipts: update and delete denied even for the owner", async () => {
    const upd = await ownerA
      .from("goods_receipts")
      .update({ note: "tampered" })
      .eq("id", receiptId)
      .select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await ownerA.from("goods_receipts").delete().eq("id", receiptId).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
  });

  it("inventory_moves: corrections are new rows, never edits", async () => {
    const upd = await ownerA
      .from("inventory_moves")
      .update({ quantity: 999 })
      .eq("id", moveId)
      .select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await ownerA.from("inventory_moves").delete().eq("id", moveId).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await ownerA
      .from("inventory_moves")
      .select("quantity")
      .eq("id", moveId)
      .single();
    expect(Number(still.data?.quantity)).toBe(10);
  });

  it("recall_events: append-only compliance artifact", async () => {
    const { data: recall } = await ownerA
      .from("recall_events")
      .insert({
        org_id: orgA,
        scope_json: { query: "x" },
        reason: "test",
        initiated_by: profileA,
      })
      .select("id")
      .single();
    const upd = await ownerA
      .from("recall_events")
      .update({ reason: "tampered" })
      .eq("id", recall!.id)
      .select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await ownerA.from("recall_events").delete().eq("id", recall!.id).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
  });

  it("moved_at is server-authoritative — client timestamps are overwritten", async () => {
    const { data: move } = await ownerA
      .from("inventory_moves")
      .insert({
        site_id: siteA,
        batch_id: batchId,
        kind: "use",
        quantity: 1,
        moved_by: profileA,
        moved_at: "2020-01-01T00:00:00Z", // back-dating attempt (§17)
      })
      .select("moved_at")
      .single();
    expect(new Date(move!.moved_at).getFullYear()).toBeGreaterThanOrEqual(2026);
  });
});

describe("invoices lifecycle guard (§17)", () => {
  it("the original file set and site are immutable", async () => {
    const { error } = await ownerA
      .from("invoices")
      .update({ file_paths: ["tampered.pdf"] })
      .eq("id", invoiceId);
    expect(error?.message).toContain("immutable");
  });

  it("status can only move forward; extraction is write-once", async () => {
    await ownerA
      .from("invoices")
      .update({ status: "needs_review", extraction_json: { lines: [] } })
      .eq("id", invoiceId);
    const back = await ownerA
      .from("invoices")
      .update({ status: "uploaded" })
      .eq("id", invoiceId);
    expect(back.error?.message).toContain("forward");
    const rewrite = await ownerA
      .from("invoices")
      .update({ extraction_json: { lines: ["fake"] } })
      .eq("id", invoiceId);
    expect(rewrite.error?.message).toContain("write-once");
  });

  it("lines freeze once the invoice is confirmed", async () => {
    // raw_text is immutable even before confirmation (provenance)
    const raw = await ownerA
      .from("invoice_lines")
      .update({ raw_text: "REWRITTEN" })
      .eq("id", lineId);
    expect(raw.error?.message).toContain("immutable");

    // corrections allowed while under review…
    const before = await ownerA
      .from("invoice_lines")
      .update({ description: "Testvare (rettet)" })
      .eq("id", lineId)
      .select("id");
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(1);

    // …but frozen after confirm
    await ownerA
      .from("invoices")
      .update({ status: "confirmed", confirmed_by: profileA })
      .eq("id", invoiceId);
    const after = await ownerA
      .from("invoice_lines")
      .update({ description: "Efter frys" })
      .eq("id", lineId);
    expect(after.error?.message).toContain("frozen");
  });

  it("confirmed_at is server-set and write-once", async () => {
    const { data: invoice } = await ownerA
      .from("invoices")
      .select("confirmed_at")
      .eq("id", invoiceId)
      .single();
    expect(invoice?.confirmed_at).not.toBeNull();
    const tamper = await ownerA
      .from("invoices")
      .update({ confirmed_at: "2020-01-01T00:00:00Z" })
      .eq("id", invoiceId);
    expect(tamper.error?.message).toContain("write-once");
  });

  it("invoices can never be deleted (originals forever)", async () => {
    const del = await ownerA.from("invoices").delete().eq("id", invoiceId).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
  });
});

describe("invoices storage bucket", () => {
  it("site-scoped paths fail closed across tenants", async () => {
    const blob = new Blob(["fattura"], { type: "application/pdf" });
    const okUpload = await ownerA.storage
      .from("invoices")
      .upload(`${siteA}/invoices/rls/test.pdf`, blob);
    expect(okUpload.error).toBeNull();
    const foreignUpload = await ownerB.storage
      .from("invoices")
      .upload(`${siteA}/invoices/rls/intrusa.pdf`, blob);
    expect(foreignUpload.error).not.toBeNull();
    const foreignRead = await ownerB.storage
      .from("invoices")
      .download(`${siteA}/invoices/rls/test.pdf`);
    expect(foreignRead.error).not.toBeNull();
  });
});
