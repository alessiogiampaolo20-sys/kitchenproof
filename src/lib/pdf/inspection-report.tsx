// §10.3 export renderer: site letterhead, generation timestamp, page numbers,
// §17 record-hash footnote. One generic tabular layout serves every tab.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 56, fontSize: 8.5, fontFamily: "Helvetica" },
  letterhead: { marginBottom: 4, fontSize: 13, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8.5, color: "#444", marginBottom: 10 },
  sectionTitle: { marginTop: 10, marginBottom: 3, fontSize: 11, fontFamily: "Helvetica-Bold" },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingVertical: 2.5,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingVertical: 2.5,
  },
  text: { marginBottom: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#666",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export type ReportSection =
  | { kind: "text"; title: string; lines: string[] }
  | { kind: "table"; title: string; columns: { label: string; width: string }[]; rows: string[][] };

export type InspectionReportData = {
  title: string;
  siteName: string;
  siteAddress: string;
  cvr: string;
  generatedAt: string;
  sections: ReportSection[];
  /** §17 footnote: latest audit hash + entry count proves chain integrity */
  integrity: { latestHash: string | null; entries: number };
  labels: { generated: string; integrity: string; page: string };
};

export function InspectionReportPdf({ data }: { data: InspectionReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.letterhead}>{data.siteName}</Text>
        <Text style={styles.meta}>
          {data.siteAddress}
          {data.cvr ? ` · CVR ${data.cvr}` : ""} · {data.labels.generated}:{" "}
          {data.generatedAt}
        </Text>
        <Text style={[styles.letterhead, { fontSize: 15 }]}>{data.title}</Text>

        {data.sections.map((section, sectionIndex) => (
          <View key={sectionIndex}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.kind === "text"
              ? section.lines.map((line, i) => (
                  <Text key={i} style={styles.text}>
                    {line}
                  </Text>
                ))
              : [
                  <View key="head" style={styles.headerRow}>
                    {section.columns.map((column, i) => (
                      <Text key={i} style={{ width: column.width, paddingRight: 4 }}>
                        {column.label}
                      </Text>
                    ))}
                  </View>,
                  ...section.rows.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.row} wrap={false}>
                      {row.map((cell, cellIndex) => (
                        <Text
                          key={cellIndex}
                          style={{
                            width: section.columns[cellIndex]?.width ?? "10%",
                            paddingRight: 4,
                          }}
                        >
                          {cell}
                        </Text>
                      ))}
                    </View>
                  )),
                ]}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={{ maxWidth: "75%" }}>
            {data.labels.integrity}
            {data.integrity.latestHash
              ? ` — ${data.integrity.latestHash.slice(0, 16)}… (${data.integrity.entries})`
              : ""}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${data.labels.page} ${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
