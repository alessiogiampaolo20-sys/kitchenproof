import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderRisikoanalyse, renderEgenkontrol } from "@/lib/pdf/render";
import { RA_LABELS, EK_LABELS } from "@/lib/pdf/officials";
import type { RaPdfData } from "@/lib/pdf/risikoanalyse";
import type { EkPdfData } from "@/lib/pdf/egenkontrol";

/**
 * §7.6 golden-file suite: rendered PDFs must keep the official layout
 * structure (header block, 6 sections, checkbox + 4 text columns, exact
 * official wording). The extracted text structure is pinned per release in
 * tests/golden/*.golden.txt — regenerate deliberately with
 * GOLDEN_UPDATE=1 pnpm test.
 */

async function extractText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

function normalize(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function compareGolden(name: string, actual: string): void {
  const goldenPath = resolve(process.cwd(), "tests/golden", `${name}.golden.txt`);
  if (process.env.GOLDEN_UPDATE === "1" || !existsSync(goldenPath)) {
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, actual);
    return;
  }
  expect(actual).toBe(readFileSync(goldenPath, "utf8"));
}

const RA_FIXTURE: Omit<RaPdfData, "locale"> = {
  site: {
    name: "Golden Restaurant",
    address: "Testgade 1, 1050 København",
    cvr: "12345678",
    owner: "Golden Ejer",
    registeredDate: "2026-01-01",
    description: "Italiensk restaurant med 40 pladser.",
  },
  version: 1,
  generatedAt: "2026-07-16",
  sections: [
    {
      key: "modtagelse",
      rows: [
        {
          name: "modtagelse.chilled",
          applies: true,
          critical: true,
          whatYouDo: "Vi modtager kølevarer to gange om ugen.",
          whatCanGoWrong: "Varerne kan være for varme.",
          controlMeasures: "Modtagekontrol med termometer.",
          ifItGoesWrong: "Afvis varen.",
        },
      ],
    },
    {
      key: "opbevaring",
      rows: [
        {
          name: "opbevaring.chilled",
          applies: true,
          critical: true,
          whatYouDo: "Opbevaring på køl.",
          whatCanGoWrong: "Bakterievækst over 5 °C.",
          controlMeasures: "Daglig temperaturkontrol.",
          ifItGoesWrong: "Vurdér og kassér.",
        },
      ],
    },
    {
      key: "tilberedning",
      rows: [
        {
          name: "tilberedning.cooling",
          applies: true,
          critical: true,
          whatYouDo: "Nedkøling af saucer.",
          whatCanGoWrong: "Langsom nedkøling.",
          controlMeasures: "56→10 °C på højst 4 timer.",
          ifItGoesWrong: "Kassér eller genopvarm.",
        },
      ],
    },
    { key: "salg_servering", rows: [{ name: "salg_servering.unpackaged_chilled", applies: true, critical: false, whatYouDo: "Servering.", whatCanGoWrong: "", controlMeasures: "", ifItGoesWrong: "" }] },
    { key: "transport", rows: [{ name: "transport.hot_takeaway", applies: true, critical: false, whatYouDo: "Udbringning.", whatCanGoWrong: "", controlMeasures: "", ifItGoesWrong: "" }] },
    { key: "andet", rows: [{ name: "andet.custom", applies: true, critical: false, whatYouDo: "Andet.", whatCanGoWrong: "", controlMeasures: "", ifItGoesWrong: "" }] },
  ],
};

const EK_FIXTURE: Omit<EkPdfData, "locale"> = {
  site: {
    name: "Golden Restaurant",
    address: "Testgade 1, 1050 København",
    cvr: "12345678",
    description: "Italiensk restaurant.",
  },
  version: 1,
  approvedBy: "Golden Ejer",
  approvedAt: "2026-07-16",
  generatedAt: "2026-07-16",
  activities: [
    { name: "Køletemperatur — Køleskab 1", checked: true, docFrequency: "Dagligt kl. 08:00" },
    { name: "Nedkøling 56→10 °C", checked: true, docFrequency: "Hver gang" },
  ],
  controlPoints: [
    {
      name: "Køletemperatur",
      area: "Køleskab 1",
      limit: "≤ 5 °C",
      frequency: "Dagligt kl. 08:00",
      monitoring: "manual_temp",
      instructions: "Aflæs og registrér temperaturen.",
      corrective: "Vurdér varerne og tilkald service.",
      source: "DK-HYGIEJNE §kap. 26.1 + bilag 3, s. 56",
    },
  ],
};

describe("official-format golden files (§7.6)", () => {
  for (const locale of ["da", "en"] as const) {
    it(`risikoanalyse ${locale}: official structure and wording`, async () => {
      const buffer = await renderRisikoanalyse({ ...RA_FIXTURE, locale });
      const text = normalize(await extractText(buffer));

      const L = RA_LABELS[locale];
      // exact official wording present (verbatim from the corpus)
      expect(text).toContain(L.title);
      expect(text).toContain(L.headerHeading);
      expect(text).toContain(L.nameAddress);
      expect(text).toContain(L.cvr);
      expect(text).toContain(L.colWhatYouDo);
      for (const key of ["modtagelse", "opbevaring", "tilberedning", "salg_servering", "transport", "andet"]) {
        expect(text).toContain(L.sections[key]!);
      }
      // sections appear in the official order
      const positions = ["modtagelse", "opbevaring", "tilberedning", "salg_servering", "transport", "andet"]
        .map((key) => text.indexOf(L.sections[key]!));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);

      compareGolden(`risikoanalyse-${locale}`, text);
    });

    it(`egenkontrolprogram ${locale}: EK-EXAMPLE structure`, async () => {
      const buffer = await renderEgenkontrol({ ...EK_FIXTURE, locale });
      const text = normalize(await extractText(buffer));

      const L = EK_LABELS[locale];
      expect(text).toContain(L.title);
      expect(text).toContain(L.activitiesHeading);
      expect(text).toContain(L.docFreqCol); // EK p.3 documentation-frequency column
      expect(text).toContain(L.proceduresHeading);
      expect(text).toContain(L.approvalHeading);
      // pack-derived limits keep their corpus source (§3.3)
      expect(text).toContain("DK-HYGIEJNE");

      compareGolden(`egenkontrol-${locale}`, text);
    });
  }
});
