# DK corpus — sourceRef research notes (Phase 1, 2026-07-15)

Verified anchors used by `supabase/seed/dk-pack.json`. Page numbers are PDF
document pages ("Side X af Y" where present). `text/` holds pypdf extractions
with `===== PAGE n =====` markers (input for corpus chunk ingestion).

## DK-HYGIEJNE — Hygiejnevejledningen nr. 9700, 24-07-2025 (230 pp)

| Topic | Section | Page(s) | Verified content |
|---|---|---|---|
| Pest control | kap. 18 (18.1–18.6) | 41–45 | building proofing, closure/kassation considerations, chemical control |
| Cleaning & disinfection | kap. 19, 19.1 | 46 | cleaning/disinfection duties |
| Personal hygiene | kap. 21 | 47 | staff hygiene rules |
| Training (egenkontrol) | kap. 23, 23.1 | 54 | staff training incl. own-check training |
| Receiving check | kap. 24, 24.1 | 54–55 | goods must pass modtagekontrol before use; procedures expected; Hygiejneforordningen bilag II kap. IX pkt. 1 |
| Cold storage & transport | kap. 26.1 | 56 | product-specific temps per bilag 3; detail vs engros (hakket kød 2 °C engros / 5 °C detail); label temp governs when stricter |
| Cold-chain break (3h guideline) | kap. 26.3 | 57 | chilled food max ~3 h outside refrigeration incl. prep, else risk assessment |
| Cooling 56→10 °C / 4 h | kap. 26.7 | 59 | "temperaturen falder fra 56 °C til 10 °C inden for højst fire timer"; alternative time/temp combos allowed if documented safe |
| Heating/reheating ≥75 °C | kap. 27.1 | 60–61 | ≥75 °C core = no extra documentation; lower temps require documentation; fish exception 60 °C/1 min; Hygiejnebekendtgørelsen §§ 26 stk. 1 & 3, 28 |
| Hot holding ≥56 °C | kap. 27.3 | 62 | "konstant temperatur på mindst 56 °C. Der er ikke nogen tidsmæssig begrænsning"; Hygiejnebekendtgørelsen § 29 |
| Frozen transport −18 °C | kap. 30.2 | 69 | frozen goods −18 °C throughout; +3 °C brief rise allowed in local distribution |
| Storage temperature table | Bilag 3 | 209–213 | poultry detail 5 °C; minced meat detail 5 °C; prepared meat detail 5 °C (all Hygiejnebekendtgørelsen § 25 stk. 1 jf. bilag 3); fresh fish 0–2 °C / melting ice; frozen foods −18 °C (Dybfrostbekendtgørelsen § 5 stk. 1) |

## DK-EK-EXAMPLE — Example of Own-Check programme, 2024 (25 pp)

| Topic | Page | Verified content |
|---|---|---|
| Business description header | 2 | name/address, registration date, CEO, products |
| Activities checklist + documentation frequency | 3 | Receipt: every receipt, doc weekly · Cold storage/freezing: daily, doc weekly · Heating: every time, doc weekly · Refrigeration (cooling): every time, doc weekly · Keeping hot: every time, doc weekly · Separation: daily, doc on errors · Cleaning: daily (Form 5) · Personal hygiene: daily · Maintenance/pest: regularly, min once a year (Form 6) · Traceability: invoices at any time · Recall: on event · Annual revision: annually (Form 7) |
| Record forms | 17–25 | Form 1 receipt · Form 2 cold storage/freezing · Form 3 heating+cooling · Form 4 keeping hot · Form 5 cleaning · Form 6 maintenance/pest · Form 7 annual revision |

## DK-RA-SKEMA / DK-RA-SKEMA-EN (14 pp each)

Canonical 6 sections / 2 checkboxes / 4 text columns (§3.3.1) — layout reference
for Phase 4 renderers and import target.

## Open items — `TODO(pack-review)`

- Dishwasher temperature: no explicit numeric requirement located in DK-HYGIEJNE; template omitted from pack v1 pending review.
- Water safety (food trucks): specific potable-water monitoring frequencies not yet extracted; guidance stub only.
- Branchekode links per activity type: not part of the provided corpus; listed as TODO in activity templates.
- Corpus version note: guide dated 24-07-2025 already contains the 56 °C rules the blueprint attributes to Nov 2025; re-verify currency at pack publish (§3.3 rule c).
