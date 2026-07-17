import { z } from "zod";

export const extractInvoiceInputSchema = z.object({
  siteId: z.uuid(),
  invoiceId: z.uuid(),
});

export const receivingCheckSchema = z.object({
  tempReading: z.number().min(-40).max(60).nullable(),
  transportTempOk: z.boolean().nullable(),
  packagingOk: z.boolean().nullable(),
});

export const confirmInvoiceInputSchema = z.object({
  siteId: z.uuid(),
  invoiceId: z.uuid(),
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        include: z.boolean(),
        productId: z.uuid().nullable(),
      }),
    )
    .max(100),
  // §9.3: optional inline receiving check (one action, two obligations)
  receiving: receivingCheckSchema.nullable(),
});

export const quickReceiveInputSchema = z.object({
  siteId: z.uuid(),
  supplierId: z.uuid().nullable(),
  supplierName: z.string().trim().min(1).max(200).nullable(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().positive().max(100000),
        unit: z.enum(["kg", "g", "l", "ml", "pcs", "box"]),
      }),
    )
    .min(1)
    .max(40),
  receiving: receivingCheckSchema.nullable(),
});
