import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { RA_LABELS, type SkemaLocale } from "./officials";

/**
 * Official risikoanalyse-skema renderer (§7.6 [DECISION]): same header block,
 * same 6 sections, same checkbox semantics, same 4 text columns as DK-RA-SKEMA
 * (da) / DK-RA-SKEMA-EN (en). Landscape, table-per-section. Fonts/branding
 * aside, the structure mirrors the official form 1:1.
 */

export type RaPdfRow = {
  name: string;
  applies: boolean;
  critical: boolean;
  whatYouDo: string;
  whatCanGoWrong: string;
  controlMeasures: string;
  ifItGoesWrong: string;
};

export type RaPdfData = {
  locale: SkemaLocale;
  site: {
    name: string;
    address: string;
    cvr: string;
    owner: string;
    registeredDate: string;
    description: string;
  };
  version: number;
  generatedAt: string;
  sections: { key: string; rows: RaPdfRow[] }[];
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 11, marginBottom: 12 },
  headerBox: { border: 1, padding: 10, marginBottom: 12 },
  headerHeading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  headerRow: { flexDirection: "row", marginBottom: 4 },
  headerLabel: { width: "45%", fontFamily: "Helvetica-Bold" },
  headerValue: { width: "55%" },
  sectionHeading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  table: { border: 1 },
  headRow: { flexDirection: "row", borderBottom: 1, backgroundColor: "#eee" },
  row: { flexDirection: "row", borderBottom: 0.5 },
  cellName: { width: "16%", padding: 3, borderRight: 0.5 },
  cellTick: { width: "8%", padding: 3, borderRight: 0.5, textAlign: "center" },
  cellText: { width: "19%", padding: 3, borderRight: 0.5 },
  cellTextLast: { width: "19%", padding: 3 },
  headCell: { fontFamily: "Helvetica-Bold" },
  checkbox: { fontSize: 9 },
  note: { fontSize: 6, color: "#333" },
  meta: { marginTop: 10, fontSize: 7, color: "#444" },
});

function Checkbox({ checked }: { checked: boolean }) {
  return <Text style={styles.checkbox}>{checked ? "☒" : "☐"}</Text>;
}

export function RisikoanalysePdf({ data }: { data: RaPdfData }) {
  const L = RA_LABELS[data.locale];
  return (
    <Document
      title={`${L.title} – ${data.site.name}`}
      language={data.locale}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{L.title}</Text>
        <Text style={styles.subtitle}>{L.subtitle}</Text>

        {/* Official header block (DK-RA-SKEMA p. 1) */}
        <View style={styles.headerBox}>
          <Text style={styles.headerHeading}>{L.headerHeading}</Text>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>{L.nameAddress}</Text>
            <Text style={styles.headerValue}>
              {data.site.name}
              {data.site.address ? `, ${data.site.address}` : ""}
            </Text>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>{L.registeredDate}</Text>
            <Text style={styles.headerValue}>{data.site.registeredDate}</Text>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>{L.owner}</Text>
            <Text style={styles.headerValue}>{data.site.owner}</Text>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>{L.cvr}</Text>
            <Text style={styles.headerValue}>{data.site.cvr}</Text>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>{L.describeShort}</Text>
            <Text style={styles.headerValue}>{data.site.description}</Text>
          </View>
        </View>

        {data.sections.map((section) => (
          <View key={section.key} wrap={false}>
            <Text style={styles.sectionHeading}>
              {L.sections[section.key] ?? section.key}
            </Text>
            <View style={styles.table}>
              <View style={styles.headRow}>
                <Text style={[styles.cellName, styles.headCell]}> </Text>
                <Text style={[styles.cellTick, styles.headCell]}>{L.tickBox}</Text>
                <Text style={[styles.cellText, styles.headCell]}>{L.colWhatYouDo}</Text>
                <Text style={[styles.cellText, styles.headCell]}>
                  {L.colWhatCanGoWrong}
                </Text>
                <Text style={[styles.cellText, styles.headCell]}>{L.colControl}</Text>
                <View style={styles.cellTextLast}>
                  <Text style={styles.headCell}>{L.colIfWrong}</Text>
                  <Text style={styles.note}>{L.colIfWrongNote}</Text>
                </View>
              </View>
              {section.rows.map((row, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.cellName}>{row.name}</Text>
                  <View style={styles.cellTick}>
                    <Checkbox checked={row.applies} />
                    <Text style={styles.note}>{L.criticalActivity}</Text>
                    <Checkbox checked={row.critical} />
                  </View>
                  <Text style={styles.cellText}>{row.whatYouDo}</Text>
                  <Text style={styles.cellText}>{row.whatCanGoWrong}</Text>
                  <Text style={styles.cellText}>{row.controlMeasures}</Text>
                  <Text style={styles.cellTextLast}>{row.ifItGoesWrong}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.meta}>
          KitchenProof · v{data.version} · {data.generatedAt}
        </Text>
      </Page>
    </Document>
  );
}
