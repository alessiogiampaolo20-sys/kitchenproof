import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { EK_LABELS, type SkemaLocale } from "./officials";

/**
 * Egenkontrolprogram renderer following the official Own-Check programme
 * example structure (DK-EK-EXAMPLE 2024, §3.3.1/§7.6): business description →
 * activities checklist with documentation frequency → per-area procedures.
 * Every pack-derived limit prints its corpus source (§3.3).
 */

export type EkPdfControlPoint = {
  name: string;
  area: string;
  limit: string;
  frequency: string;
  monitoring: string;
  instructions: string;
  corrective: string;
  source: string; // "DK-HYGIEJNE §kap. 26.7, s. 59" or "" for custom
};

export type EkPdfData = {
  locale: SkemaLocale;
  site: {
    name: string;
    address: string;
    cvr: string;
    description: string;
  };
  version: number;
  approvedBy: string;
  approvedAt: string;
  generatedAt: string;
  activities: { name: string; checked: boolean; docFrequency: string }[];
  controlPoints: EkPdfControlPoint[];
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 14 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  box: { border: 1, padding: 10, marginBottom: 8 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: "35%", fontFamily: "Helvetica-Bold" },
  value: { width: "65%" },
  table: { border: 1 },
  headRow: { flexDirection: "row", borderBottom: 1, backgroundColor: "#eee" },
  tRow: { flexDirection: "row", borderBottom: 0.5 },
  colActivity: { width: "50%", padding: 4, borderRight: 0.5 },
  colChecked: { width: "15%", padding: 4, borderRight: 0.5, textAlign: "center" },
  colFreq: { width: "35%", padding: 4 },
  headCell: { fontFamily: "Helvetica-Bold" },
  cpBox: { border: 0.5, padding: 8, marginBottom: 6 },
  cpName: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 3 },
  cpMeta: { flexDirection: "row", flexWrap: "wrap", marginBottom: 3 },
  cpMetaItem: { marginRight: 14 },
  cpMetaLabel: { fontFamily: "Helvetica-Bold" },
  cpSource: { fontSize: 7, color: "#444", marginTop: 3 },
  approval: { border: 1, padding: 10, marginTop: 16 },
});

export function EgenkontrolPdf({ data }: { data: EkPdfData }) {
  const L = EK_LABELS[data.locale];
  return (
    <Document title={`${L.title} – ${data.site.name}`} language={data.locale}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{L.title}</Text>

        <Text style={styles.heading}>{L.businessHeading}</Text>
        <View style={styles.box}>
          <View style={styles.row}>
            <Text style={styles.label}>{data.site.name}</Text>
            <Text style={styles.value}>{data.site.address}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>CVR</Text>
            <Text style={styles.value}>{data.site.cvr}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.value}>{data.site.description}</Text>
          </View>
        </View>

        {/* Activities checklist with documentation frequency (EK-EXAMPLE p. 3) */}
        <Text style={styles.heading}>{L.activitiesHeading}</Text>
        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.colActivity, styles.headCell]}>{L.activityCol}</Text>
            <Text style={[styles.colChecked, styles.headCell]}>{L.checkedCol}</Text>
            <Text style={[styles.colFreq, styles.headCell]}>{L.docFreqCol}</Text>
          </View>
          {data.activities.map((activity, i) => (
            <View key={i} style={styles.tRow}>
              <Text style={styles.colActivity}>{activity.name}</Text>
              <Text style={styles.colChecked}>{activity.checked ? "☒" : "☐"}</Text>
              <Text style={styles.colFreq}>{activity.docFrequency}</Text>
            </View>
          ))}
        </View>

        {/* Per-area procedures (EK-EXAMPLE record-form structure) */}
        <Text style={styles.heading} break>
          {L.proceduresHeading}
        </Text>
        {data.controlPoints.map((cp, i) => (
          <View key={i} style={styles.cpBox} wrap={false}>
            <Text style={styles.cpName}>
              {cp.name}
              {cp.area ? ` — ${cp.area}` : ""}
            </Text>
            <View style={styles.cpMeta}>
              <Text style={styles.cpMetaItem}>
                <Text style={styles.cpMetaLabel}>{L.limitLabel}: </Text>
                {cp.limit}
              </Text>
              <Text style={styles.cpMetaItem}>
                <Text style={styles.cpMetaLabel}>{L.frequencyLabel}: </Text>
                {cp.frequency}
              </Text>
              <Text style={styles.cpMetaItem}>
                <Text style={styles.cpMetaLabel}>{L.monitoringLabel}: </Text>
                {cp.monitoring}
              </Text>
            </View>
            <Text>{cp.instructions}</Text>
            <Text>
              <Text style={styles.cpMetaLabel}>{L.correctiveLabel}: </Text>
              {cp.corrective}
            </Text>
            {cp.source ? (
              <Text style={styles.cpSource}>
                {L.sourceLabel}: {cp.source}
              </Text>
            ) : null}
          </View>
        ))}

        {/* Approval block (§7.4: approver + timestamp on the snapshot) */}
        <View style={styles.approval}>
          <Text style={styles.heading}>{L.approvalHeading}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{L.versionLabel}</Text>
            <Text style={styles.value}>{data.version}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{L.approvedBy}</Text>
            <Text style={styles.value}>{data.approvedBy}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{L.approvedAt}</Text>
            <Text style={styles.value}>{data.approvedAt}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
