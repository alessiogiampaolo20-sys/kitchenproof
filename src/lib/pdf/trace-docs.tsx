// §9.6 recall report + §9.7 outbound delivery note. These are KitchenProof
// documents (not official-layout constrained like the §7.6 skema renderers).
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#444", marginBottom: 12 },
  section: { marginTop: 10, marginBottom: 4, fontSize: 11, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#bbb", paddingVertical: 3 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingVertical: 3,
    fontFamily: "Helvetica-Bold",
  },
  meta: { marginBottom: 2 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#666" },
});

function Col({ width, children }: { width: string; children?: React.ReactNode }) {
  return <Text style={{ width, paddingRight: 4 }}>{children ?? ""}</Text>;
}

export type RecallBatchRow = {
  productName: string;
  lotCode: string;
  supplierName: string;
  invoiceNumber: string;
  receivedAt: string;
  quantity: string;
  remaining: string;
  status: string;
};

export type RecallMoveRow = {
  productName: string;
  lotCode: string;
  kind: string;
  quantity: string;
  movedAt: string;
  detail: string; // waste reason / B2B customer
};

export type RecallPdfData = {
  siteName: string;
  siteAddress: string;
  cvr: string;
  generatedAt: string;
  initiatedBy: string;
  reason: string;
  scopeDescription: string;
  batches: RecallBatchRow[];
  moves: RecallMoveRow[];
  labels: {
    title: string;
    scope: string;
    reason: string;
    initiatedBy: string;
    batchesTitle: string;
    movesTitle: string;
    colProduct: string;
    colLot: string;
    colSupplier: string;
    colInvoice: string;
    colReceived: string;
    colQty: string;
    colRemaining: string;
    colStatus: string;
    colKind: string;
    colWhen: string;
    colDetail: string;
    footer: string;
  };
};

export function RecallReportPdf({ data }: { data: RecallPdfData }) {
  const L = data.labels;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{L.title}</Text>
        <Text style={styles.subtitle}>
          {data.siteName} · {data.siteAddress} · CVR {data.cvr} · {data.generatedAt}
        </Text>
        <Text style={styles.meta}>{L.scope}: {data.scopeDescription}</Text>
        <Text style={styles.meta}>{L.reason}: {data.reason}</Text>
        <Text style={styles.meta}>{L.initiatedBy}: {data.initiatedBy}</Text>

        <Text style={styles.section}>{L.batchesTitle} ({data.batches.length})</Text>
        <View style={styles.headerRow}>
          <Col width="20%">{L.colProduct}</Col>
          <Col width="13%">{L.colLot}</Col>
          <Col width="17%">{L.colSupplier}</Col>
          <Col width="12%">{L.colInvoice}</Col>
          <Col width="14%">{L.colReceived}</Col>
          <Col width="8%">{L.colQty}</Col>
          <Col width="8%">{L.colRemaining}</Col>
          <Col width="8%">{L.colStatus}</Col>
        </View>
        {data.batches.map((batch, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Col width="20%">{batch.productName}</Col>
            <Col width="13%">{batch.lotCode}</Col>
            <Col width="17%">{batch.supplierName}</Col>
            <Col width="12%">{batch.invoiceNumber}</Col>
            <Col width="14%">{batch.receivedAt}</Col>
            <Col width="8%">{batch.quantity}</Col>
            <Col width="8%">{batch.remaining}</Col>
            <Col width="8%">{batch.status}</Col>
          </View>
        ))}

        <Text style={styles.section}>{L.movesTitle} ({data.moves.length})</Text>
        <View style={styles.headerRow}>
          <Col width="22%">{L.colProduct}</Col>
          <Col width="15%">{L.colLot}</Col>
          <Col width="15%">{L.colKind}</Col>
          <Col width="10%">{L.colQty}</Col>
          <Col width="18%">{L.colWhen}</Col>
          <Col width="20%">{L.colDetail}</Col>
        </View>
        {data.moves.map((move, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Col width="22%">{move.productName}</Col>
            <Col width="15%">{move.lotCode}</Col>
            <Col width="15%">{move.kind}</Col>
            <Col width="10%">{move.quantity}</Col>
            <Col width="18%">{move.movedAt}</Col>
            <Col width="20%">{move.detail}</Col>
          </View>
        ))}

        <Text style={styles.footer} fixed>{L.footer}</Text>
      </Page>
    </Document>
  );
}

export type DeliveryNotePdfData = {
  siteName: string;
  siteAddress: string;
  cvr: string;
  customerName: string;
  customerAddress: string;
  date: string;
  noteNumber: string;
  lines: { productName: string; lotCode: string; quantity: string; expiry: string }[];
  labels: {
    title: string;
    from: string;
    to: string;
    date: string;
    colProduct: string;
    colLot: string;
    colQty: string;
    colExpiry: string;
    footer: string;
  };
};

export function DeliveryNotePdf({ data }: { data: DeliveryNotePdfData }) {
  const L = data.labels;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{L.title} {data.noteNumber}</Text>
        <Text style={styles.subtitle}>{L.date}: {data.date}</Text>
        <Text style={styles.meta}>
          {L.from}: {data.siteName} · {data.siteAddress} · CVR {data.cvr}
        </Text>
        <Text style={styles.meta}>{L.to}: {data.customerName} · {data.customerAddress}</Text>

        <View style={[styles.headerRow, { marginTop: 12 }]}>
          <Col width="40%">{L.colProduct}</Col>
          <Col width="20%">{L.colLot}</Col>
          <Col width="20%">{L.colQty}</Col>
          <Col width="20%">{L.colExpiry}</Col>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Col width="40%">{line.productName}</Col>
            <Col width="20%">{line.lotCode}</Col>
            <Col width="20%">{line.quantity}</Col>
            <Col width="20%">{line.expiry}</Col>
          </View>
        ))}

        <Text style={styles.footer} fixed>{L.footer}</Text>
      </Page>
    </Document>
  );
}
