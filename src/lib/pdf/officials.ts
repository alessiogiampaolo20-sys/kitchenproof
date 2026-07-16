/**
 * Official layout strings (§7.6 [DECISION]) — copied VERBATIM from the corpus:
 *  da: DK-RA-SKEMA (Risikoanalyse_skema_Editerbar-PDF_003, pages 1-2, 14)
 *  en: DK-RA-SKEMA-EN (Risk analysis form 002, pages 2-13)
 * Do not "improve" the wording: familiarity with the official form is the
 * approval argument (§3.4). Golden-file tests pin these.
 */

export type SkemaLocale = "da" | "en";

export const RA_LABELS: Record<
  SkemaLocale,
  {
    title: string;
    subtitle: string;
    headerHeading: string;
    nameAddress: string;
    registeredDate: string;
    owner: string;
    cvr: string;
    describeShort: string;
    tickBox: string;
    criticalActivity: string;
    colWhatYouDo: string;
    colWhatCanGoWrong: string;
    colControl: string;
    colIfWrong: string;
    colIfWrongNote: string;
    sections: Record<string, string>; // pack section key → official heading
  }
> = {
  da: {
    title: "Skema til risikoanalyse",
    subtitle: "– hvad gør du, og hvad kan du gøre, hvis det går galt",
    headerHeading: "Beskriv virksomheden kort",
    nameAddress: "Virksomhedens navn og adresse:",
    registeredDate: "Virksomheden er registreret af Fødevarestyrelsen den (dato):",
    owner: "Virksomhedsejer:",
    cvr: "CVR-nummer:",
    describeShort: "Beskriv din virksomhed kort:",
    tickBox: "Sæt kryds hvis ja, og hvis du har en kritisk aktivitet",
    criticalActivity: "Kritisk aktivitet",
    colWhatYouDo: "Uddyb hvad du laver/gør?",
    colWhatCanGoWrong: "Hvad kan der ske/gå galt, og hvad er risikoen ved det?",
    colControl: "Hvad gør du for at styre processen og opnå sikre fødevarer?",
    colIfWrong: "Hvad gør du hvis det går galt?",
    colIfWrongNote: "OBS: Husk egenkontrolprogram (hent skema på fvst.dk)",
    sections: {
      modtagelse: "Modtagelse af varer",
      opbevaring: "Opbevaring/lager",
      tilberedning: "Tilberedning og håndtering",
      salg_servering: "Salg og servering",
      transport: "Transport",
      andet: "Andet – har du aktiviteter der ikke er nævnt, skriv dem her",
    },
  },
  en: {
    title: "Risk analysis form",
    subtitle: "- What do you do - and what can you do - if something goes wrong?",
    headerHeading: "Brief description of the business",
    nameAddress: "Name and address of the business:",
    registeredDate:
      "Date of authorisation/registration of the business by the Danish Veterinary and Food Administration:",
    owner: "Business owner:",
    cvr: "CVR number:",
    describeShort: "Brief description of your business:",
    tickBox: "Tick the box if yes, and if you have a critical activity",
    criticalActivity: "Critical activity",
    colWhatYouDo: "Explain what you do/make?",
    colWhatCanGoWrong: "What could go wrong and what is the associated risk?",
    colControl: "What process controls do you have to ensure food safety?",
    colIfWrong: "What do you do if something goes wrong?",
    colIfWrongNote: "NOTE: Follow own control procedures! (Get form at fvst.dk)",
    sections: {
      modtagelse: "Receipt of goods",
      opbevaring: "Storing/storage",
      tilberedning: "Preparation and handling",
      salg_servering: "Selling and serving",
      transport: "Transport",
      andet: "Other - here you can add other activities not mentioned above",
    },
  },
};

/** Own-check programme section flow (DK-EK-EXAMPLE 2024, pages 2-3). */
export const EK_LABELS: Record<
  SkemaLocale,
  {
    title: string;
    businessHeading: string;
    activitiesHeading: string;
    activityCol: string;
    checkedCol: string;
    docFreqCol: string;
    proceduresHeading: string;
    limitLabel: string;
    frequencyLabel: string;
    monitoringLabel: string;
    correctiveLabel: string;
    sourceLabel: string;
    approvalHeading: string;
    approvedBy: string;
    approvedAt: string;
    versionLabel: string;
  }
> = {
  da: {
    title: "Egenkontrolprogram",
    businessHeading: "Beskriv virksomheden kort",
    activitiesHeading: "Virksomhedens aktiviteter",
    activityCol: "Aktivitet",
    checkedCol: "Kontrolleres",
    docFreqCol: "Hvor ofte skal det skrives ned?",
    proceduresHeading: "Procedurer og kontrolpunkter",
    limitLabel: "Grænse",
    frequencyLabel: "Frekvens",
    monitoringLabel: "Overvågning",
    correctiveLabel: "Hvis det går galt",
    sourceLabel: "Kilde",
    approvalHeading: "Godkendelse",
    approvedBy: "Godkendt af",
    approvedAt: "Dato",
    versionLabel: "Version",
  },
  en: {
    title: "Own-check programme",
    businessHeading: "Brief description of the business",
    activitiesHeading: "Activities of the business",
    activityCol: "Activity",
    checkedCol: "Checked",
    docFreqCol: "How often must this be written down?",
    proceduresHeading: "Procedures and control points",
    limitLabel: "Limit",
    frequencyLabel: "Frequency",
    monitoringLabel: "Monitoring",
    correctiveLabel: "If something goes wrong",
    sourceLabel: "Source",
    approvalHeading: "Approval",
    approvedBy: "Approved by",
    approvedAt: "Date",
    versionLabel: "Version",
  },
};
