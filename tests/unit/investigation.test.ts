import { describe, expect, it } from "vitest";
import {
  clientContactList,
  contactsToCsv,
  stillInStock,
  suppliersOf,
  summariseChain,
  type ChainOrder,
  type ChainProduction,
  type ChainRecord,
} from "@/lib/inventory/investigation";

function record(over: Partial<ChainRecord> = {}): ChainRecord {
  return {
    id: crypto.randomUUID(),
    controlPointName: "Opvarmning",
    value: "80 °C",
    passed: true,
    measurementKind: "product",
    performedAt: "2026-04-08T12:00:00Z",
    performedBy: "Alessio",
    isLate: false,
    ...over,
  };
}

function production(over: Partial<ChainProduction> = {}): ChainProduction {
  return {
    id: crypto.randomUUID(),
    producedOn: "2026-04-08",
    productName: "Ragù",
    quantity: 20,
    unit: "portioner",
    producedBy: "Alessio",
    purchases: [],
    records: [],
    ...over,
  };
}

describe("summariseChain — the verdict line", () => {
  it("calls a chain clean only when checks exist AND all passed", () => {
    const verdict = summariseChain([production({ records: [record(), record()] })]);
    expect(verdict).toMatchObject({
      totalRecords: 2,
      failedRecords: 0,
      clean: true,
      unmonitored: false,
    });
  });

  it("counts failures across every production in the chain", () => {
    const verdict = summariseChain([
      production({ records: [record(), record({ passed: false })] }),
      production({ records: [record({ passed: false })] }),
    ]);
    expect(verdict.failedRecords).toBe(2);
    expect(verdict.clean).toBe(false);
  });

  it("never calls an unmonitored chain clean — absence of proof is not proof", () => {
    const verdict = summariseChain([production({ records: [] })]);
    expect(verdict.unmonitored).toBe(true);
    expect(verdict.clean).toBe(false);
    expect(verdict.failedRecords).toBe(0);
  });

  it("surfaces late records separately from failures", () => {
    const verdict = summariseChain([
      production({ records: [record({ isLate: true }), record()] }),
    ]);
    expect(verdict.lateRecords).toBe(1);
    expect(verdict.clean).toBe(true); // within limits, just recorded late
  });
});

describe("suppliersOf", () => {
  it("de-duplicates and sorts the suppliers behind the chain", () => {
    const inco = { id: "s1", name: "Inco" };
    const brugsen = { id: "s2", name: "SuperBrugsen" };
    const chain = [
      production({
        purchases: [
          { batchId: "b1", lotCode: "L1", productName: "Hakket kød", supplier: inco, invoiceNumber: "01105947008", invoicePath: null, receivedAt: null },
          { batchId: "b2", lotCode: "L2", productName: "Fløde", supplier: inco, invoiceNumber: "01105947008", invoicePath: null, receivedAt: null },
        ],
      }),
      production({
        purchases: [
          { batchId: "b3", lotCode: "L3", productName: "Mascarpone", supplier: brugsen, invoiceNumber: null, invoicePath: null, receivedAt: null },
        ],
      }),
    ];
    expect(suppliersOf(chain)).toEqual([inco, brugsen]);
  });
});

describe("clientContactList — the downstream answer", () => {
  const orders: ChainOrder[] = [
    { id: "o1", orderRef: "Baby VC", clientName: "EIFO", contact: "csb@eifo.dk", eventDate: "2026-04-08", destination: "catering", portions: 20 },
    { id: "o2", orderRef: "Wedding", clientName: "Lissie", contact: null, eventDate: "2026-04-13", destination: "private", portions: 20 },
    { id: "o1", orderRef: "Baby VC", clientName: "EIFO", contact: "csb@eifo.dk", eventDate: "2026-04-08", destination: "catering", portions: 20 },
  ];

  it("lists each client once, most recent event first", () => {
    const contacts = clientContactList(orders);
    expect(contacts.map((c) => c.orderRef)).toEqual(["Wedding", "Baby VC"]);
  });

  it("keeps clients with no contact details — those need a phone call, not hiding", () => {
    const contacts = clientContactList(orders);
    expect(contacts.find((c) => c.orderRef === "Wedding")?.contact).toBeNull();
    expect(contacts).toHaveLength(2);
  });

  it("exports a CSV that survives commas and quotes in names", () => {
    const csv = contactsToCsv(
      clientContactList([
        { id: "o3", orderRef: "Event, big", clientName: 'The "Hub"', contact: "a@b.dk", eventDate: "2026-05-01", destination: "event", portions: 80 },
      ]),
    );
    expect(csv.split("\n")[0]).toBe("event_date,order_ref,client,contact,portions");
    expect(csv).toContain('"Event, big"');
    expect(csv).toContain('"The ""Hub"""');
  });
});

describe("stillInStock — quarantine before phoning", () => {
  it("keeps only active batches with something left", () => {
    const batches = [
      { id: "b1", lotCode: "L1", productName: "Kød", remaining: 3, status: "active" },
      { id: "b2", lotCode: "L2", productName: "Kød", remaining: 0, status: "active" },
      { id: "b3", lotCode: "L3", productName: "Kød", remaining: 5, status: "discarded" },
    ];
    expect(stillInStock(batches).map((b) => b.id)).toEqual(["b1"]);
  });
});
