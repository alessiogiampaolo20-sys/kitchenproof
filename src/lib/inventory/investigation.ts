// §1.4 the investigation: one screen that reconstructs what happened, from
// either end of the chain, without anyone remembering anything.
//
// This module is deliberately pure. The queries live in investigation-runner;
// what an investigation MEANS — which links matter, what counts as a clean
// chain, who must be contacted — is decided here and unit-tested.

export type ChainSupplier = { id: string; name: string };

export type ChainPurchase = {
  batchId: string;
  lotCode: string;
  productName: string;
  supplier: ChainSupplier | null;
  /** The document behind it: invoice number and stored file. */
  invoiceNumber: string | null;
  invoicePath: string | null;
  receivedAt: string | null;
};

export type ChainRecord = {
  id: string;
  controlPointName: string;
  value: string;
  passed: boolean;
  measurementKind: "product" | "ambient" | null;
  performedAt: string;
  performedBy: string | null;
  isLate: boolean;
};

export type ChainProduction = {
  id: string;
  producedOn: string;
  productName: string;
  quantity: number | null;
  unit: string | null;
  producedBy: string | null;
  purchases: ChainPurchase[];
  records: ChainRecord[];
};

export type ChainOrder = {
  id: string;
  orderRef: string;
  clientName: string;
  contact: string | null;
  eventDate: string;
  destination: string;
  portions: number | null;
};

export type Verdict = {
  /** Records covering the chain that did not pass. */
  failedRecords: number;
  /** Records taken after their window closed. */
  lateRecords: number;
  totalRecords: number;
  /** True when every recorded check on this chain was within limits. */
  clean: boolean;
  /** True when the chain has no monitoring records at all — not the same as clean. */
  unmonitored: boolean;
};

/**
 * The verdict line the investigation screen leads with.
 *
 * "No deviations" and "no records" must never look the same: an order produced
 * on a day nobody measured anything is not proof of correct production, it is
 * an absence of proof, and saying so plainly is the honest behaviour.
 */
export function summariseChain(productions: ChainProduction[]): Verdict {
  const records = productions.flatMap((p) => p.records);
  const failedRecords = records.filter((r) => !r.passed).length;
  const lateRecords = records.filter((r) => r.isLate).length;
  return {
    failedRecords,
    lateRecords,
    totalRecords: records.length,
    clean: records.length > 0 && failedRecords === 0,
    unmonitored: records.length === 0,
  };
}

/** De-duplicated suppliers behind a set of productions, for the upstream view. */
export function suppliersOf(productions: ChainProduction[]): ChainSupplier[] {
  const seen = new Map<string, ChainSupplier>();
  for (const production of productions) {
    for (const purchase of production.purchases) {
      if (purchase.supplier) seen.set(purchase.supplier.id, purchase.supplier);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type ClientContact = {
  orderId: string;
  orderRef: string;
  clientName: string;
  contact: string | null;
  eventDate: string;
  portions: number | null;
};

/**
 * The downstream answer: who ate it, and how to reach them.
 *
 * Sorted by event date so the most recent deliveries — the ones where the food
 * may still be in someone's fridge — are contacted first. Orders with no
 * contact detail are NOT dropped: they are the ones needing a phone call, and
 * hiding them would make the list look complete when it is not.
 */
export function clientContactList(orders: ChainOrder[]): ClientContact[] {
  const seen = new Map<string, ClientContact>();
  for (const order of orders) {
    if (seen.has(order.id)) continue;
    seen.set(order.id, {
      orderId: order.id,
      orderRef: order.orderRef,
      clientName: order.clientName,
      contact: order.contact,
      eventDate: order.eventDate,
      portions: order.portions,
    });
  }
  return [...seen.values()].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

/** CSV for the recall phone/mail round — the list has to leave the app. */
export function contactsToCsv(contacts: ClientContact[]): string {
  const escape = (value: string | number | null) => {
    if (value === null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = "event_date,order_ref,client,contact,portions";
  const rows = contacts.map((c) =>
    [c.eventDate, c.orderRef, c.clientName, c.contact, c.portions]
      .map(escape)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

/**
 * Stock from the affected purchases that is still physically in the kitchen.
 * A recall starts here: that food has to be quarantined before anyone makes a
 * phone call.
 */
export function stillInStock(
  batches: { id: string; lotCode: string; productName: string; remaining: number; status: string }[],
): typeof batches {
  return batches.filter((b) => b.status === "active" && b.remaining > 0);
}
