# KitchenProof — Product & Engineering Blueprint

**AI-assisted food-safety compliance platform for the Danish market (DVFA / Fødevarestyrelsen), built as a multi-tenant SaaS.**

> Working name `KitchenProof` — rename globally if desired.
> This document is the single source of truth for building the product with Claude Code. It is prescriptive: follow it top-to-bottom. Where a decision is marked `[DECISION]`, it is final. Where marked `[DEFAULT]`, it may be changed with a good reason.

---

## Table of contents

1. [Vision & product goals](#1-vision--product-goals)
2. [Target activity types](#2-target-activity-types)
3. [Regulatory foundation (Denmark first, multi-country ready)](#3-regulatory-foundation)
4. [Personas, roles & multi-tenancy](#4-personas-roles--multi-tenancy)
5. [Architecture & tech stack](#5-architecture--tech-stack)
6. [Data model (full schema)](#6-data-model)
7. [Module M1 — Onboarding & AI-assisted risk analysis (HACCP)](#7-module-m1--onboarding--ai-assisted-risk-analysis)
8. [Module M2 — Daily self-control (egenkontrol)](#8-module-m2--daily-self-control)
9. [Module M3 — Traceability, invoices & inventory / leftovers](#9-module-m3--traceability-invoices--inventory)
10. [Module M4 — Inspection mode (audit-ready evidence)](#10-module-m4--inspection-mode)
11. [Module M5 — Multi-site management](#11-module-m5--multi-site-management)
12. [Module M6 — SaaS platform, billing & platform admin](#12-module-m6--saas-platform-billing--platform-admin)
13. [Module M7 — Regulatory support & guidance](#13-module-m7--regulatory-support--guidance)
14. [AI subsystem specification](#14-ai-subsystem-specification)
15. [UX principles & key screens](#15-ux-principles--key-screens)
16. [Offline-first PWA specification](#16-offline-first-pwa-specification)
17. [Security, GDPR & record integrity](#17-security-gdpr--record-integrity)
18. [Non-functional requirements](#18-non-functional-requirements)
19. [Repository structure & conventions](#19-repository-structure--conventions)
20. [Build plan for Claude Code (phases & acceptance criteria)](#20-build-plan-for-claude-code)
21. [Requirements traceability matrix](#21-requirements-traceability-matrix)
22. [Out of scope v1 / roadmap](#22-out-of-scope-v1--roadmap)
23. [Glossary (Danish ↔ English)](#23-glossary)
24. [Regulatory sources](#24-regulatory-sources)

---

## 1. Vision & product goals

**One-line pitch:** the fastest way for a food business in Denmark to be 100% ready for a Fødevarestyrelsen inspection — every day, without paperwork.

**The problem.** Every Danish food business must run a written, HACCP-based self-control programme (*egenkontrolprogram*), record temperature/hygiene checks, keep supplier traceability records, and produce all of it instantly during unannounced Smiley inspections. Today this is done on paper binders or clunky software. It steals 30–60 minutes/day from operators, records get forgotten or back-filled, and a bad Smiley is public and hurts revenue.

**The solution.** A PWA that:

1. **Builds the compliance programme for you** — an AI wizard interviews the owner (10–15 min), drafts the full risk analysis + egenkontrolprogram tailored to the business type, the owner reviews and approves.
2. **Makes daily checks near-zero effort** — photo-first equipment checks, 3-tap temperature logging, automatic reminders, offline-capable on any phone/tablet.
3. **Automates traceability** — photograph a supplier invoice/delivery note, AI extracts supplier + every product line, creates traceable goods-receipts and batches automatically; end-of-service leftover check in under 2 minutes.
4. **Wins inspections** — a single "Inspection mode" screen presents the programme, every record, every deviation with its corrective action, and full one-step-back/one-step-forward traceability, exportable as PDF.

**North-star metrics.**

- Time to complete all daily checks at a typical restaurant: **< 5 minutes/day**.
- Time from "invoice photographed" to "all products registered & traceable": **< 60 seconds** (AI) + **< 60 seconds** human confirm.
- Time to answer an inspector's traceability question ("where did this batch of chicken come from?"): **< 30 seconds**.
- Onboarding to an approved egenkontrolprogram: **< 1 day** (vs. weeks with consultants).

**Business model.** B2B SaaS subscription per site (see §12). Sold directly to restaurants, cafés, takeaways, canteens, bakeries, butchers, catering, food trucks and small producers.

**Product principles (apply to every feature).**

- **Speed over completeness on the operator path**: any daily-use flow must be doable in ≤ 3 taps, gloves on, on a cheap Android phone. Anything requiring typing text is a design failure on the operator path (numbers and photos are fine).
- **AI proposes, humans approve**: AI never silently creates compliance-relevant records; every AI output is confirmable/editable, and the confirmation is what gets recorded (with the user identity).
- **Evidence-grade records**: every record is timestamped server-side, attributed to a person, immutable after creation (corrections are appended, never overwrite), and photo-backed where possible.
- **Compliance as data, not code**: regulatory content (control point templates, limits, frequencies, retention periods, guidance texts) lives in versioned "compliance packs" per country, so Denmark ships first and other countries are added without code changes.
- **Danish-first, multilingual always**: UI ships in Danish (da), English (en) and Italian (it) via i18n; all compliance pack content is localizable.

---

## 2. Target activity types

`[DECISION]` The platform targets **retail-stage food businesses** (detailhandel) under EU Reg. 852/2004 registered with Fødevarestyrelsen. Each activity type maps to an onboarding template (process steps + typical control points) in the Danish compliance pack.

| Code | Activity type (da) | Activity type (en) | Typical CCP/OPRP focus | v1 |
|---|---|---|---|---|
| `restaurant` | Restaurant | Restaurant (full service) | receiving, cold storage, heating ≥75°C, cooling 56→10°C/4h, hot holding ≥56°C, allergens | ✅ |
| `cafe` | Café / kaffebar | Café / coffee bar | cold storage, milk handling, display cabinets, allergens | ✅ |
| `takeaway` | Takeaway / pizzeria / grillbar | Takeaway, pizzeria, kebab/grill | shawarma/kebab rules, hot holding, cooling, delivery temps | ✅ |
| `canteen` | Kantine / storkøkken | Canteen / institutional kitchen | large-batch cooling, hot holding, vulnerable-groups rules, buffet | ✅ |
| `bakery` | Bageri / konditori | Bakery / pastry | cream products cold chain, allergens (gluten!), display | ✅ |
| `butcher` | Slagterbutik | Butcher shop | minced meat rules, cold chain, cross-contamination, own production | ✅ |
| `catering` | Catering / diner transportable | Catering & events | transport temps, time-out-of-refrigeration, off-site service | ✅ |
| `foodtruck` | Food truck / madbod | Food truck / market stall | water supply, limited facilities, mobile cold chain | ✅ |
| `retail_kiosk` | Kiosk / minimarked | Kiosk / convenience retail | date checks, cold display, receiving | ✅ |
| `hotel_breakfast` | Hotelmorgenmad / buffet | Hotel breakfast / buffet | buffet time & temp, egg dishes, leftovers | ✅ |
| `small_producer` | Mindre fødevareproducent | Small producer / dark kitchen / webshop | batch production, labelling, B2B traceability (one step forward!) | ✅ (basic) |
| `wholesale_small` | Lille engrosvirksomhed | Small wholesale | full HACCP plan, B2B outbound traceability | 🔜 v1.1 |

**Template contents per activity type** (data, in compliance pack):

- default **process steps** (varemodtagelse → opbevaring → tilberedning → …),
- default **equipment list suggestions** (e.g. restaurant: 2 fridges, 1 freezer, 1 hot-holding unit),
- default **control point set** with frequencies and limits,
- default **hazard library subset** relevant to the type,
- activity-specific guidance texts (e.g. shawarma-specific rules for `takeaway`),
- the relevant **branchekode** reference (Danish industry guides), listed as "recommended reading" with links.

Users can start from a template and the AI wizard (§7) adapts it; nothing is hard-coded per type.

---

## 3. Regulatory foundation

### 3.1 What the product must satisfy (Denmark)

The Danish compliance pack (`compliance_pack = "DK"`) encodes the following obligations. **These are product requirements**, each mapped to features in §21.

**R1 — HACCP-based self-control (egenkontrol).** Every food business must run self-control based on the **7 HACCP principles** (EU Reg. 852/2004 art. 5; Danish egenkontrol rules): (1) hazard identification via risk analysis across **all process steps**, covering **microbiological, chemical (incl. allergens), physical** hazards; (2) determine critical control points (CCPs); (3) set critical limits; (4) monitoring procedures defining **who / when / how**; (5) corrective actions, documented with what was done, date, responsible person, and verification; (6) ongoing validation/revision of the programme (when law changes, activities change, or repeated deviations occur); (7) documentation and records proportionate to business size.

**R2 — Written programme available on premises.** The written egenkontrolprogram must exist **before starting activities**, must match actual operations, must be simple enough for staff to use, and must be **available in the establishment** and shown at inspection. → The app must render the complete, current, approved programme (and history) on any device, and export to PDF.

**R3 — Written records for CCPs.** Documented monitoring is required for activities identified as critical, typically: cold chain temperatures (receiving & storage, perishables max **+5°C**; specific goods have specific temps), heating (center temperature min **75°C** for relevant dishes), **cooling from 56°C to 10°C within 4 hours** (rule updated Nov 2025; alternative procedures allowed if documented safe), **hot holding at ≥ 56°C** (updated Nov 2025; no time limit if temp maintained). Frequencies and limits must be configurable per site — they are pack **defaults**, editable during risk analysis with justification.

**R4 — Deviations & corrective actions.** When a limit is exceeded, the system must force a corrective-action record: what happened, assessment of affected food (keep / move / discard), who did it, when, and follow-up verification.

**R5 — Traceability (EU Reg. 178/2002 art. 18).** One step back / one step forward: for every inbound delivery record **supplier name & address, product identification, quantity, delivery date** (+ lot/batch and invoice reference where available); for B2B outbound sales record the same toward business customers. Records must be producible **immediately on request** by authorities. Retention `[DEFAULT]`: 5 years general; 6 months for highly perishable goods with use-by < 3 months (EU guidance); configurable per pack.

**R6 — Smiley inspections.** Inspections are unannounced and risk-based; results (1–4 per checked area, worst determines the smiley) are published. Four consecutive top results can qualify for **Elite-smiley**. → The product's "Inspection mode" (§10) must let an operator hand a tablet to the inspector (read-only) with everything organized the way inspectors ask for it: programme, records by area/period, deviations, traceability lookups.

**R7 — Allergen management (EU Reg. 1169/2011).** The 14 EU allergens must be tracked at product level and surfaced in recipes/menu answers. v1 scope: allergen matrix per menu item + allergen flags on inbound products (AI-suggested, human-confirmed); full recipe management is v1.1.

**R8 — Documentation retention & integrity.** Self-control documentation `[DEFAULT]` retained min. 1 year on-line and archived for the pack's retention period (see R5 for traceability records). Records must be tamper-evident (§17).

**R9 — Programme revision triggers.** The system must prompt revision of the risk analysis when: compliance pack updates (law changes), site changes activities/equipment, or a control point shows repeated deviations (≥3 in 30 days `[DEFAULT]`).

> Note: since 1 Jan 2026 Fødevarestyrelsen is merged into **Styrelsen for Fødevarer, Landbrug og Fiskeri**. Keep "Fødevarestyrelsen / DVFA" as the user-facing term (it remains in common use), store agency metadata in the compliance pack.

### 3.2 Multi-country architecture

`[DECISION]` All regulatory content lives in **compliance packs**: versioned JSON bundles stored in the DB (`compliance_packs`, `pack_versions` tables) containing:

```jsonc
{
  "pack": "DK",
  "version": "2026.07",
  "authority": { "name": "Fødevarestyrelsen (DVFA)", "inspectionScheme": "smiley", "publicRegistry": "findsmiley.dk" },
  "locales": ["da", "en"],
  "activityTemplates": [ /* §2 templates */ ],
  "hazardLibrary": [ /* microbiological/chemical/physical hazards with descriptions */ ],
  "controlPointTemplates": [
    {
      "key": "cold_storage_temp",
      "category": "temperature",
      "appliesTo": ["equipment:fridge"],
      "defaultLimit": { "max": 5, "unit": "°C" },
      "defaultFrequency": { "rrule": "FREQ=DAILY", "timesPerDay": 1 },
      "monitoringMethod": "photo_or_manual_temp",
      "correctiveActionGuidance": { "da": "...", "en": "..." },
      "legalBasis": "Hygiejnebekendtgørelsen; EU 852/2004"
    }
    // heating_core_temp (≥75), cooling_56_to_10_4h, hot_holding_min_56,
    // receiving_check, cleaning_plan, pest_control, freezer_temp (≤ -18),
    // dishwasher_temp, water_safety, personal_hygiene_training, ...
  ],
  "traceability": { "retentionYearsDefault": 5, "retentionMonthsPerishable": 6, "requiredFields": [...] },
  "documentRetention": { "selfControlMonths": 12, "archiveYears": 5 },
  "revisionTriggers": { "repeatedDeviationCount": 3, "windowDays": 30 },
  "guidance": [ /* localized help articles keyed by topic, with official source URLs */ ]
}
```

Pack updates are published by platform admins (§12); sites get a **"regulation changed — review your programme"** task with a diff view (§13). No pack content is ever hard-coded in application code. Adding Italy/Germany later = authoring a new pack + translations.

### 3.3 Official regulatory corpus (authoritative grounding)

`[DECISION]` The DK pack is authored against, and the AI assistant is grounded EXCLUSIVELY in, the following **official documents** (files provided; store originals in `supabase/seed/corpus/DK/`, chunk + embed for RAG, track version/date, re-verify at every pack release):

| ID | Document | Version / date | Role in product |
|---|---|---|---|
| `DK-RA-SKEMA` | *Risikoanalyse-skema* (Fødevarestyrelsen editable PDF, "uden hjælp", 003) | current, 14 pp | **Canonical structure of the risk analysis** (§3.3.1); import target format; export layout |
| `DK-RA-SKEMA-EN` | *Risk analysis form* (English, 002) | current | English rendering of the same structure |
| `DK-EK-EXAMPLE` | *EXAMPLE OF Own-Check programme* (English) | 2024, 25 pp | Canonical structure/sections of the egenkontrolprogram and its record forms; export layout reference |
| `DK-HYGIEJNE` | *Hygiejnevejledningen*, vejledning nr. 9700 | 24-07-2025, 230 pp | Source of truth for limits, temperatures, hygiene rules → control point templates & guidance texts |
| `DK-AUTORISATION` | *Autorisationsvejledningen*, nr. 9164 | 27-02-2025, 159 pp | Registration/authorisation logic in onboarding (activity types, when registration is required) |
| `DK-KONTROL-BILAG` | *Kontrolvejledningens bilag — samlet* (incl. Bilag 1 audit practice, Bilag 4 sanctions, Bilag 5 bagatelgrænser, Bilag 11a documentation of retail inspections) | rev. 2022+, 218 pp | How inspectors audit & document → shapes Inspection mode organization and severity model |
| `DK-INSPECT-EN` | *Guidelines on Inspections in the Food Sector* (file ref 2019-62-33-00056) | applicable 22-06-2020, 78 pp | Inspection types/frequencies → inspection-readiness features, English grounding |

Rules: (a) every control point template, limit and guidance text in the pack carries a `sourceRef` (`docId`, section, page); (b) the compliance assistant (§13) may only answer from this corpus + the site's own programme, always citing `docId §section`; (c) at pack publish time a checklist verifies corpus versions are current on foedevarestyrelsen.dk (guides are revised — e.g. hygiene guide July 2025).

### 3.3.1 Canonical risk-analysis structure = the official skema

`[DECISION]` The internal risk-analysis data model mirrors the official Fødevarestyrelsen *risikoanalyse-skema* 1:1, so that anything the app produces or imports is always expressible in the exact format inspectors know.

**Official sections (process areas)** → `process_steps.key`:

1. `modtagelse` — Modtagelse af varer (rows: chilled receiving; frozen receiving; ambient/allergen-attention receiving; other)
2. `opbevaring` — Opbevaring/lager (chilled; frozen; ambient; other)
3. `tilberedning` — Tilberedning og håndtering (hot prep; cold prep; hot holding; cooling of heat-treated food; separation/cross-contamination; allergen handling)
4. `salg_servering` — Salg og servering (packaged chilled/frozen; packaged ambient; unpackaged chilled; unpackaged ambient; allergen-containing sales; other)
5. `transport` — Transport (chilled/frozen; ambient; hot takeaway; other)
6. `andet` — Andet (free rows)

**Official columns** → fields on every activity row (§6.2 `ra_activity_rows`):

| Skema column (da) | Field |
|---|---|
| ☐ *Sæt kryds hvis ja* | `applies` |
| ☐ *Kritisk aktivitet* | `is_critical` (drives egenkontrolprogram inclusion — checked rows MUST have monitoring control points; validator enforces) |
| *Uddyb hvad du laver/gør?* | `what_you_do` |
| *Hvad kan der ske/gå galt, og hvad er risikoen ved det?* | `what_can_go_wrong` |
| *Hvad gør du for at styre processen og opnå sikre fødevarer?* | `control_measures` |
| *Hvad gør du hvis det går galt?* (OBS: husk egenkontrolprogram) | `if_it_goes_wrong` |

Header block (site metadata, already in `sites`): business name & address, short description, Fødevarestyrelsen registration date, owner, CVR — rendered on export exactly as in the official form.

The richer hazard detail (§6.2 `hazards`: category micro/chemical/physical/allergen, likelihood×severity, CCP justification) hangs **off** each row — the wizard fills both levels; exports can render the simple official skema *and* a detailed HACCP annex.

The egenkontrolprogram export follows the official **Own-Check programme example (2024)** structure: business description → activity checklist (checked areas + documentation frequency: daily / regularly / only in the event of errors) → per-area procedures (receipt of goods, transportation, storage, food contact materials, heating, refrigeration/cooling, keeping hot, non-refrigerated sales, separation, goods delivery, cleaning & disinfection, personal hygiene, maintenance & pest control, review, traceability, recall) → record forms.

### 3.4 Authority engagement & approval readiness

Goal: get the product **recognised by Fødevarestyrelsen**. Facts to design around: there is **no formal certification scheme for egenkontrol software in Denmark today** — the closest formal instruments are authority-assessed *branchekoder* and requested guidance (*bestilt/rekvireret vejledning*). Strategy `[DECISION]`:

1. **Compliance-by-design dossier (auto-generated artifact):** a living document mapping every feature → legal obligation → corpus `sourceRef` (§21 is its skeleton; a generator renders it from pack data + this blueprint). Exportable PDF for meetings with the authority.
2. **Official-format fidelity:** everything an inspector touches (risk analysis, programme, record forms, §10 exports) renders in layouts mirroring the official templates (`DK-RA-SKEMA`, `DK-EK-EXAMPLE`) — familiarity is the strongest approval argument.
3. **Integrity guarantees documented:** append-only records, hash chain, late-entry flags, no back-dating (§17) — written up in the dossier explicitly, since fabricated records are the authority's main concern with digital systems.
4. **Pilot evidence:** run 3–5 pilot sites (incl. Lasagne Hub) through real inspections; collect inspector feedback in-app; include outcomes in the dossier.
5. **Engagement path:** present dossier + demo to Fødevarestyrelsen (Glostrup HQ), explore alignment with the branchekode assessment model and listing among referenced digital tools; adapt to their feedback via pack versioning without code changes.
6. **Disclaimers until then:** the app presents itself as a tool that *helps fulfil* egenkontrol obligations; legal responsibility stays with the food business operator (stated in ToS and in-app).

---

## 4. Personas, roles & multi-tenancy

### 4.1 Tenancy model

```
Platform
└── Organization (tenant, = customer company, has subscription)
    ├── Site (physical location / CVR p-number)  ← compliance lives here
    │   ├── Equipment, programmes, records, inventory…
    └── Members (users with a role per org, optionally scoped per site)
```

- **Organization** = the paying customer (may own 1 or 50 sites).
- **Site** = one physical establishment with its own registration, its own egenkontrolprogram, records and Smiley history. All compliance data is site-scoped.
- A user can belong to multiple orgs (e.g. a consultant).

### 4.2 Roles `[DECISION]`

| Role | Scope | Capabilities |
|---|---|---|
| `platform_admin` | platform | **Full access to every org/site** (sales, support, onboarding-as-a-service). Can impersonate org users (logged, banner shown, §17). Manages compliance packs, plans, feature flags. This is the "user with access to everything" requested for selling/supporting the product. |
| `platform_support` | platform | Read-only across orgs + impersonation with consent flag. |
| `org_owner` | org | Billing, create/delete sites, invite members, everything below. |
| `org_admin` | org | Manage all sites' programmes, users, reports; no billing. |
| `site_manager` | site(s) | Approve risk analysis, edit programme, resolve deviations, manage equipment/suppliers, view reports, manage staff PINs. |
| `operator` | site(s) | Execute daily checks, log temperatures/photos, receive goods, leftover checks, raise deviations. Cannot edit the programme. |
| `consultant` | org or site(s) | Like `site_manager` but flagged external; can be granted time-boxed access. |
| `inspector_guest` | site, time-boxed | Read-only Inspection mode via magic link / on-device guest session. No PII of staff beyond names on records. |

**Fast user switching on shared devices**: a site tablet stays logged into a *device session*; operators identify per-action with a personal **4-digit PIN or avatar tap** (site-configurable). Every record stores the actual person. Full login not required per action — this is critical for kitchen speed.

### 4.3 Personas (design targets)

- **Marco, owner of 2 pizzerias (buyer)**: wants zero fines, Elite smiley, and not to think about paperwork. Uses the multi-site dashboard weekly.
- **Sofia, kitchen lead (daily user)**: 8-minute morning routine, gloves, wet hands, Danish is her 2nd language. Needs big buttons, photos, numbers, zero text.
- **Jonas, DVFA inspector (indirect user)**: asks for the programme, last 3 months of cooling records, and "where is this salmon from?". Needs answers in seconds, organized his way.
- **Alessio, platform owner**: onboards customers, sometimes builds their programme for them (white-glove), monitors churn/compliance health across tenants.

---

## 5. Architecture & tech stack

`[DECISION]` Single **Next.js 15+ (App Router, TypeScript, React Server Components)** application, deployed on **Vercel**, with **Supabase** (EU region, e.g. `eu-central-1`) providing Postgres, Auth, Storage, Realtime and Edge Functions. PWA with full offline support for the operator paths.

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15+, TypeScript strict | App Router; Server Actions for mutations; RSC for dashboards |
| DB | Supabase Postgres 15+ | **RLS on every table** (§17); migrations via Supabase CLI, checked into repo |
| Auth | Supabase Auth | Email+password, magic link, Google; JWT carries `org_id` claims via hook; device sessions + PIN layer app-side |
| Storage | Supabase Storage | Buckets: `photos` (check evidence), `invoices`, `documents`, `exports`; private + signed URLs |
| Offline/PWA | Serwist (service worker) + IndexedDB (Dexie.js) + custom sync queue | §16 |
| Data fetching | TanStack Query v5 | Cache + optimistic updates + offline mutation queue integration |
| UI | Tailwind CSS + shadcn/ui + lucide-react | Design tokens in §15; large-touch "kitchen mode" variants |
| i18n | next-intl | Locales `da` (default), `en`, `it`; all strings in `/messages/*.json`; compliance pack content localized in-data |
| AI | **Claude API** (Anthropic) | `claude-sonnet-*` for wizard/chat, vision for invoice OCR & thermometer/photo reading; abstraction layer `src/lib/ai/provider.ts` so models are swappable; structured outputs via tool-use JSON schemas |
| Billing | Stripe (subscriptions, per-site quantity) | Webhooks → `subscriptions` table; trial 30 days `[DEFAULT]` |
| Email | Resend | Invites, digests, deviation alerts |
| Push | Web Push (VAPID) via service worker | Task reminders, deviation alerts |
| PDF export | `@react-pdf/renderer` server-side | Programme, records, traceability reports |
| Charts | Recharts | Dashboards |
| Validation | Zod everywhere (API in/out, AI outputs, forms) | AI JSON is always Zod-parsed; reject+retry on schema fail |
| Testing | Vitest (unit), Playwright (e2e), pgTAP or SQL tests for RLS | §20 gates |
| Monitoring | Sentry + Vercel analytics | PII-scrubbed |

**High-level diagram**

```
[PWA client (RSC + client components)]
   │  Server Actions / Route Handlers (Zod-validated)
   ▼
[Next.js on Vercel] ──── [Claude API]   (invoice extraction, wizard, assistant, photo reading)
   │                         ▲
   │ supabase-js (RLS-scoped)│ signed image URLs
   ▼                         │
[Supabase: Postgres + Auth + Storage + Realtime + Edge Functions (cron: reminders, retention, digests)]
```

**Key architectural rules**

1. **RLS is the security boundary.** The client talks to Supabase directly for reads where convenient; all writes that need business logic go through Server Actions using the user's token (never service-role in request path except platform-admin endpoints, which double-check `platform_admin` role and write to `admin_audit_log`).
2. **Every mutation emits an `audit_log` row** (who, what, before/after hash, device, offline-created-at vs server-received-at).
3. **IDs**: UUIDv7 everywhere (sortable). **Time**: store `timestamptz` UTC; display site-local (`Europe/Copenhagen` default).
4. **Offline-created records** carry `client_created_at` + `client_uuid`; server assigns authoritative `server_received_at`; both shown in audit contexts (§17).
5. **Feature flags** per org (`org_features`) for gradual rollout and plan gating.

---

## 6. Data model

Postgres schema (simplified: PKs are `id uuid`, all tables have `created_at`, `updated_at`; FKs implied by name; **every tenant table has `org_id` and, where applicable, `site_id`, both enforced by RLS**). Implement as Supabase migrations in `supabase/migrations/`.

### 6.1 Identity & tenancy

```sql
organizations (id, name, country_code, vat_number, billing_email, plan, status,
               default_locale, created_by)
sites         (id, org_id, name, address, city, postal_code, country_code,
               cvr_p_number,            -- Danish production-unit number
               activity_type,           -- §2 code
               compliance_pack, pack_version_pinned,
               timezone default 'Europe/Copenhagen',
               smiley_url,              -- findsmiley.dk page for this site
               status)                  -- active | paused | archived
profiles      (id = auth.users.id, full_name, avatar_url, locale, phone)
memberships   (id, org_id, user_id, role,          -- org_owner|org_admin|consultant|site_manager|operator
               site_ids uuid[] null,                -- null = all sites in org
               pin_hash text null,                  -- 4-digit PIN for shared-device switching
               invited_by, accepted_at, expires_at) -- expires_at for consultants/guests
device_sessions (id, site_id, device_name, registered_by, last_seen_at, revoked_at)
inspector_links (id, site_id, token_hash, created_by, expires_at, used_at)  -- §10
```

### 6.2 Compliance packs & programme

```sql
compliance_packs (code pk, name, authority_json)
pack_versions    (id, pack_code, version, content jsonb, changelog, published_at, published_by)

risk_analyses    (id, site_id, version int, status,        -- draft | in_review | approved | superseded
                  wizard_transcript jsonb,                 -- AI interview Q&A (audit of how it was built)
                  approved_by, approved_at, supersedes_id)
process_steps    (id, risk_analysis_id, position, key,     -- official section keys §3.3.1 (modtagelse…andet) + custom
                  name_i18n jsonb, description_i18n jsonb)
ra_activity_rows (id, risk_analysis_id, process_step_id, position,
                  activity_key,                            -- official row key (e.g. modtagelse.chilled) or 'custom'
                  applies bool, is_critical bool,          -- the two official checkboxes
                  what_you_do_i18n, what_can_go_wrong_i18n,
                  control_measures_i18n, if_it_goes_wrong_i18n,   -- the 4 official text columns §3.3.1
                  ai_suggested bool, human_edited bool,
                  source_import_id null, source_page int null, source_region jsonb null)  -- provenance when imported
ra_imports       (id, site_id, risk_analysis_id null,
                  kind,                                    -- photo_set | pdf | docx | xlsx | paper_scan
                  file_paths text[],                       -- original uploaded files (kept forever as source evidence)
                  status,                                  -- uploaded | extracting | mapped | needs_review | confirmed | failed
                  extraction_json,                         -- raw AI output + confidences per cell
                  gap_report_json,                         -- missing sections/columns vs official skema (§7.5)
                  confirmed_by, confirmed_at)
hazards          (id, process_step_id, ra_row_id null,     -- detailed HACCP layer behind an activity row
                  category,                                -- micro | chemical | physical | allergen
                  description_i18n, likelihood int, severity int,   -- 1..3 each
                  is_ccp bool, is_oprp bool,
                  control_measure_i18n, justification_i18n,
                  ai_suggested bool, human_edited bool)
control_points   (id, site_id, risk_analysis_id, hazard_id null,
                  template_key,                            -- from pack, null if custom
                  name_i18n, category,                     -- temperature | cleaning | receiving | pest | hygiene | other
                  target_kind,                             -- equipment | area | process | supplier
                  equipment_id null, area_i18n null,
                  limit_json,          -- {"max":5} | {"min":75} | {"cool_from":56,"cool_to":10,"within_minutes":240} …
                  frequency_json,      -- {"rrule":"FREQ=DAILY","times":["07:30","15:00"],"servicePeriods":[…]}
                  monitoring_method,   -- manual_temp | photo_temp | photo_only | checklist | probe
                  responsible_role, instructions_i18n, corrective_guidance_i18n,
                  active bool)
programme_documents (id, site_id, risk_analysis_id, kind,  -- egenkontrolprogram | annex
                  pdf_path, generated_at)                  -- rendered snapshot for R2
```

### 6.3 Equipment & daily records

```sql
equipment        (id, site_id, kind,          -- fridge | freezer | hot_holding | dishwasher | probe | oven | blast_chiller | other
                  name, brand_model, photo_path,           -- reference photo of the unit
                  location_note, target_limit_json,        -- overrides CP default if set
                  qr_code_token, nfc_tag_id null,          -- scan-to-check shortcut
                  active bool, retired_at)
tasks            (id, site_id, control_point_id, due_at, due_window_minutes,
                  status,                                  -- pending | done | missed | skipped_justified
                  assigned_role)
task_completions (id, task_id, site_id, control_point_id, equipment_id null,
                  performed_by,                            -- profile id (via PIN identify)
                  value_json,        -- {"temp_c":3.4} | {"checklist":{"clean":true,…}} | {"cool_log":[…]}
                  passed bool,                             -- computed vs limit
                  photo_paths text[],                      -- evidence photos
                  photo_ai_reading jsonb null,             -- AI-read value + confidence, if photo_temp
                  note text null,
                  client_created_at, client_uuid, server_received_at,
                  deviation_id null)
deviations       (id, site_id, control_point_id null, source,   -- task | receiving | adhoc | ai_flag
                  detected_at, detected_by, description,
                  severity,                                -- minor | major | critical
                  food_assessment,                         -- kept | moved | discarded | recalled | na
                  corrective_action_text, corrective_action_by, corrective_action_at,
                  verification_text, verified_by, verified_at,
                  status,                                  -- open | corrected | verified | closed
                  photo_paths text[])
cleaning_areas   (id, site_id, name_i18n, frequency_json, instructions_i18n)  -- rendered as simple checklists
```

### 6.4 Traceability & inventory

```sql
suppliers        (id, org_id, site_id null,               -- org-level, optionally site-scoped
                  name, cvr, address, city, postal_code, country,
                  email, phone, approved bool, ai_created bool)
products         (id, org_id, name, normalized_name,      -- canonical catalog entry
                  category,                               -- meat | fish | dairy | produce | dry | frozen | beverage | packaging | nonfood …
                  storage_type,                           -- fridge | freezer | dry | ambient
                  default_shelf_life_days int null,
                  allergens text[],                       -- of the 14 EU allergens, AI-suggested + confirmed
                  unit_default,                           -- kg | pcs | l | box
                  gtin text null, is_food bool)
invoices         (id, site_id, supplier_id null, kind,    -- invoice | delivery_note | credit_note | receipt
                  file_path, page_count,
                  status,                                 -- uploaded | extracting | needs_review | confirmed | failed
                  extraction_json jsonb,                  -- raw AI output + confidences
                  invoice_number, invoice_date, total_amount, currency,
                  confirmed_by, confirmed_at)
invoice_lines    (id, invoice_id, raw_text, product_id null,   -- matched or newly created product
                  description, quantity numeric, unit, unit_price, lot_code text null,
                  match_confidence numeric, needs_review bool)
goods_receipts   (id, site_id, supplier_id, invoice_id null,
                  received_at, received_by,
                  transport_temp_ok bool null, packaging_ok bool null, temp_reading numeric null,
                  photo_paths text[], note)               -- receiving check (modtagekontrol) — is also a CP record
batches          (id, site_id, product_id, goods_receipt_id null,
                  lot_code, quantity numeric, unit, remaining numeric,
                  expiry_date date null, expiry_kind,     -- use_by | best_before | internal
                  origin,                                 -- received | produced | leftover
                  parent_batch_ids uuid[] null,           -- for produced/leftover: what it came from
                  label_printed bool, status)             -- active | finished | discarded | recalled
inventory_moves  (id, site_id, batch_id, kind,            -- receive | use | waste | leftover_in | transfer_out | sale_b2b | correction
                  quantity numeric, reason,               -- for waste: expired | dropped | overproduction | deviation | other
                  moved_by, moved_at, note,
                  b2b_customer_id null)                   -- one step FORWARD
b2b_customers    (id, org_id, name, cvr, address, email)  -- for producers/wholesale & catering invoices out
leftover_sessions(id, site_id, service_label,             -- "lunch" | "dinner" | date-based
                  started_at, started_by, completed_at,
                  items_count, discarded_count)           -- summary; detail = inventory_moves linked by session
recall_events    (id, org_id, scope_json,                 -- supplier/product/lot filters
                  reason, initiated_by, initiated_at, report_pdf_path)
```

### 6.5 Platform, billing, audit

```sql
subscriptions    (id, org_id, stripe_customer_id, stripe_subscription_id,
                  plan, site_quantity, status, trial_ends_at, current_period_end)
org_features     (org_id, feature_key, enabled bool, config jsonb)
notifications    (id, user_id null, site_id null, kind, payload jsonb, read_at,
                  channels text[])                        -- push | email | in_app
audit_log        (id, org_id, site_id, actor_id, actor_role, impersonated_by null,
                  action, entity_table, entity_id,
                  before_hash, after_hash, diff jsonb,
                  client_created_at null, ip, user_agent, created_at)
admin_audit_log  (id, platform_user_id, action, target_org_id, details jsonb, created_at)
ai_runs          (id, org_id, site_id, feature,           -- invoice_extract | risk_wizard | assistant | photo_read
                  model, input_ref, output_ref, tokens_in, tokens_out, latency_ms,
                  confidence numeric null, accepted bool null, edited bool null)  -- quality tracking
regulatory_updates (id, pack_code, from_version, to_version, summary_i18n, created_at)
site_review_tasks  (id, site_id, trigger,                 -- pack_update | repeated_deviation | activity_change | annual
                  regulatory_update_id null, status, due_at, resolved_at, resolved_by)
```

### 6.6 Derived views (create as SQL views / materialized where noted)

- `v_site_compliance_today` — per site: tasks due/done/missed today, open deviations, programme status. Powers dashboards; materialize hourly for the multi-site dashboard.
- `v_traceability_lookup` — flattened join: batch → goods_receipt → invoice → supplier (+ outbound moves) for instant one-step-back/forward queries.
- `v_temperature_history` — per equipment time series for charts and inspector export.
- `v_expiring_batches` — batches with `expiry_date <= today + 3` and `remaining > 0` → "use first" list.

---

## 7. Module M1 — Onboarding & AI-assisted risk analysis

**Goal:** from signup to an approved, site-specific egenkontrolprogram in under a day, with the AI doing 90% of the writing (satisfies R1, R2, and the "AI-supported risk analysis" core requirement).

### 7.1 Flow

```
Signup → Create org → Add site (address, CVR lookup, activity type §2)
      → Choose path: [AI Wizard (default)] or [Import existing programme] or [Start from template]
      → AI Wizard interview (10–15 min, chat + quick-reply chips)
      → Draft generated: process steps + hazards + CCPs + control points + schedule
      → Review & edit screens (structured, not chat)
      → Site manager taps "Approve programme" (records approver + timestamp, generates PDF snapshot)
      → Daily task schedule goes live; equipment QR labels offered for print
```

### 7.2 The wizard (AI interview)

- Conversational UI with **quick-reply chips** (minimise typing), in da/en/it. Backed by Claude with a system prompt built from: activity template (§2), hazard library, control point templates, and site facts already known.
- Question buckets (adaptive, ~15–25 questions): activities & menu style (raw fish? minced meat? sous-vide? buffet? delivery?), volumes & service periods, equipment inventory (guided: "how many fridges?" → creates `equipment` rows, prompts a photo of each), receiving (which days, suppliers), cooling practices, hot holding, reheating, allergen handling, cleaning setup, pest control contract, staff & training.
- **Photo onboarding of equipment:** during the wizard the user photographs each fridge/freezer/hot-holding unit; the app creates the equipment record with the photo as the reference image (used later in checks, §8) and assigns a printable QR label.
- Every answer is stored in `risk_analyses.wizard_transcript` (auditable origin of the programme).

### 7.3 Draft generation (structured output)

One Claude call per section with **tool-use JSON schema** (Zod-mirrored): input = transcript + pack content; output = `process_steps[]` (official section keys §3.3.1), `ra_activity_rows[]` (the official skema cells, incl. the two checkboxes), `hazards[]` (detail layer: likelihood×severity scoring and CCP determination + justification), `control_points[]` (with limits/frequencies from pack defaults, adjusted to answers), all i18n fields in da+en (+it if org locale it).

**Guardrails `[DECISION]`:**

- AI may only *tighten* pack default limits, never loosen (e.g. may propose 4°C target for a sushi fridge; may not propose 8°C for a fridge). Loosening requires manual edit + written justification field + site_manager role.
- Every AI-generated hazard/CP is flagged `ai_suggested=true`; the review UI shows a badge until a human has viewed that section.
- Generation must cover **all** process steps produced; a completeness validator checks each step has ≥1 hazard of each applicable category considered (or an explicit "not relevant because…" note).
- Zod-parse failures → automatic retry with error feedback (max 2), then graceful fallback to template-only draft.

### 7.4 Review & approval UX

- Sectioned editor (Process steps → Hazard table → CCP list → Monitoring schedule) with plain-language explanations; each item editable inline; "explain why" button opens AI rationale with pack citations (§13).
- **Approval is blocking:** programme (and thus daily tasks) activates only after explicit approval by `site_manager`+. Approval snapshots the full programme to `programme_documents` as versioned PDF (Danish + org locale) — this is the document shown to inspectors (R2).
- Re-runs: wizard can be re-entered any time → creates new `risk_analyses.version`, requires re-approval, old version marked `superseded` (kept forever).

### 7.5 Import existing risk analysis / programme (photo or file) — first-class flow

Most established businesses **already have** a risk analysis (often the paper Fødevarestyrelsen skema, a consultant's Word file, or a binder). Import must be as polished as the wizard — it is the main onboarding path for existing businesses.

**Inputs accepted:** multi-photo capture of paper pages (guided camera UI: page counter, auto-crop/deskew, blur detection with "retake"), PDF (native or scanned), DOCX, XLSX. Multiple files per import. Originals stored permanently in `ra_imports.file_paths` (they are themselves compliance evidence).

**Pipeline:**

```
Upload → ra_imports(status=extracting)
 → Claude vision extraction, page by page, with the OFFICIAL SKEMA as target schema:
   for each detected activity row: {sectionKey, activityKey|custom, applies, isCritical,
   whatYouDo, whatCanGoWrong, controlMeasures, ifItGoesWrong, confidence, page, region}
   (handles: the official editable/paper skema incl. handwriting; free-form Word/consultant
   formats — mapped semantically onto skema sections; mixed da/en/it documents)
 → Deterministic mapper → ra_activity_rows on a new draft risk_analysis (status=mapped)
 → GAP ANALYSIS vs official requirements (status=needs_review):
     • sections with no rows but likely relevant for the activity type (template cross-check)
     • rows marked critical but with empty control/corrective columns  ← blocks approval
     • critical rows with no linked monitoring control point            ← blocks approval
     • unreadable cells (confidence < 0.6) flagged per cell
 → Review UI: side-by-side — original page crop (source_page/region) vs extracted text per cell;
   tap to correct; gap checklist on top ("2 sections missing, 3 empty cells")
 → "Complete the gaps" mini-wizard: ONLY asks about gaps (reuses §7.2 machinery)
 → Hazard-detail enrichment (AI proposes §6.2 hazards behind each critical row — review as §7.4)
 → Control-point generation from critical rows (pack templates matched by activityKey)
 → Normal approval flow (§7.4) → versioned, PDF snapshot in OFFICIAL layout
```

**Rules:** extraction never invents content — empty stays empty (gaps are asked, not hallucinated); every imported cell keeps provenance (`source_import_id`, page, region) so the review UI and inspectors can always see "where this came from"; the legacy document remains attached to the risk analysis as its origin. `platform_admin` uses the same flow for white-glove onboarding.

### 7.6 Official-format rendering (exports)

`[DECISION]` PDF renderers must reproduce the official layouts pixel-faithfully (fonts/branding aside):

- **Risk analysis →** the Fødevarestyrelsen *risikoanalyse-skema* layout (da; en via `DK-RA-SKEMA-EN`): same header block, same 6 sections, same 5 columns, same checkbox semantics. Custom rows render in the "Andet" pattern.
- **Egenkontrolprogram →** the *Own-Check programme example 2024* structure (§3.3.1), including the activities-checklist page with documentation frequency, per-area procedure pages, and blank/filled record forms.
- **Record exports (§10) →** tabular forms matching the example's record sheets (receipt of goods; cold storage & freezing; heating + cooling start/stop logs; keeping hot; cleaning plan; errors columns).

A golden-file test suite compares rendered PDFs against reference layouts per release.

---

## 8. Module M2 — Daily self-control (egenkontrol)

**Goal:** all daily/weekly checks done in < 5 min/day, evidence-grade, offline-capable (satisfies R3, R4; core requirement "self-control with photos of equipment and very simple tables").

### 8.1 Today screen (operator home)

- One vertical list: **overdue → due now → later today**, grouped by area (Køl/Frys, Varme, Rengøring, Modtagelse). Each row: icon, name, equipment thumbnail, one big tap target.
- Header: site name, date, connection status (subtle), progress ring ("6/8 done").
- Done state per task is visible at a glance; missed tasks from yesterday surface at top with "log late (marked as late)" — late entries are stored with real timestamps, **never back-dated** (§17).

### 8.2 Check execution flows (the 3-tap rule)

**Temperature check (fridge/freezer):**
1. Tap task (or **scan QR/NFC on the unit** — jumps straight here) →
2. Enter temp on a giant numeric pad *or* tap "📷 photo of display/thermometer" → AI reads the value from the photo, pre-fills it (user confirms) →
3. Tap ✓. Pass/fail computed instantly vs limit.
- Photo path `[DECISION]`: the photo is saved as evidence even in manual mode if taken; in photo mode, `photo_ai_reading` stores AI value+confidence, and the **user-confirmed value** is authoritative.
- Reference photo of the equipment (from onboarding) is shown so the operator can't confuse units.

**Checklist check (cleaning, receiving area, hygiene):** simplified table = list of rows with ✓/✗/N.A. toggles, optional photo per row, one Save. No free text required; each ✗ requires either a photo or a one-tap reason chip.

**Cooling log (56→10°C/4h):** start log at 56°C (tap), app timers + reminder notifications at +2h and +3h30m, enter/photo temp at each point, auto-pass/fail at end; abnormal curve → deviation flow. Supports blast chillers ("done in one step" shortcut).

**Hot holding:** spot checks per service period with same numeric-pad/photo flow (limit ≥ 56°C from pack).

**Receiving check (modtagekontrol):** triggered from M3 goods receipt (§9.3) — temp of refrigerated delivery, packaging intact, visual check; one screen, chips + optional photo.

### 8.3 Failure → deviation flow (R4)

On any failed check the app *immediately* opens a 3-step corrective sheet:
1. **What about the food?** chips: `moved` / `discarded` / `assessed OK (why chip)` / `n.a.` (+ photo).
2. **What fixed it?** chips per CP from pack guidance (e.g. "called technician", "adjusted thermostat", "moved goods to fridge 2") + optional note/dictation.
3. **Verify later** → auto-creates a follow-up task (e.g. re-check temp in 2h) whose completion writes `verification` fields.
Severity auto-suggested by rules (e.g. fridge 6.5°C = minor; 12°C overnight = major). `site_manager` notified push+email for major/critical. Deviations list with open/closed filter; nothing can be deleted.

### 8.4 Scheduling & reminders

- Tasks materialized nightly (site-timezone) from `control_points.frequency_json` by a Supabase Edge Function cron; also on-demand when programme changes.
- Push notification defaults `[DEFAULT]`: at due time, +30 min if not done, and a 20:00 daily summary to `site_manager` if anything is missed. All configurable per site.
- Missed tasks are recorded as `missed` (visible in reports — honesty is a feature: inspectors accept occasional missed checks, they don't accept fabricated ones).

### 8.5 Ad-hoc records

Big "+" button: log an unscheduled temperature, an ad-hoc deviation (broken glass, pest sighting — photo first), or a note. Everything lands in the same evidence stores.

---

## 9. Module M3 — Traceability, invoices & inventory

**Goal:** complete one-step-back / one-step-forward traceability (R5) and living inventory with **near-zero manual data entry**: the supplier invoice photo is the input; leftovers are a 2-minute end-of-service tap-through. This module is the product's main differentiator — build it exceptionally well.

### 9.1 Invoice/delivery-note ingestion (AI)

**Flow:**

```
[📷 Photograph invoice / upload PDF / forward email*]        (*email-in: v1.1)
 → upload to Storage, invoices.status = 'extracting'
 → Claude vision extraction (multi-page supported) → structured JSON
 → matching pipeline (suppliers, products)
 → Review screen (only low-confidence items highlighted)
 → user taps "Confirm" → goods_receipt + batches created, inventory updated,
   receiving-check mini-form offered (temp/packaging — 5 seconds)
```

**Extraction output schema (Zod + Claude tool-use):**

```ts
{
  documentKind: "invoice" | "delivery_note" | "credit_note" | "receipt",
  supplier: { name, cvr?, address?, city?, postal?, country?, email? },
  invoiceNumber?, invoiceDate?, currency?, totalAmount?,
  lines: [{
    rawText,               // exact line as printed
    description,           // cleaned product name
    quantity?, unit?,      // normalized: kg | g | l | pcs | box(=N pcs if stated)
    unitPrice?, lotCode?, gtin?,
    isFood: boolean,       // excludes napkins, detergents, rental fees…
    confidence: 0..1
  }],
  overallConfidence: 0..1
}
```

**Matching pipeline (deterministic, code not AI):**

1. **Supplier match:** by CVR if extracted, else fuzzy name+postal (pg_trgm). No match → create supplier flagged `ai_created` (review-optional).
2. **Product match:** per line, against org catalog via `normalized_name` (lowercased, unit-stripped, Danish/English synonyms table) + pg_trgm similarity + purchase history for this supplier (same supplier + similar raw line = strong signal). Thresholds `[DEFAULT]`: ≥0.90 auto-match; 0.60–0.90 suggested (one-tap accept); <0.60 create-new proposal.
3. **New product enrichment (AI, same call or follow-up):** category, storage_type, default shelf-life days (conservative pack-based defaults per category), **allergen suggestions** (flagged "AI-suggested — confirm"), unit. Human sees these pre-filled on the review screen.
4. **Batch creation:** per food line → `batches` row: lot = extracted `lotCode` else `AUTO-{invoiceNumber}-{line}`; expiry = printed date if extracted (delivery notes often carry it) else `received_at + default_shelf_life`; `expiry_kind='internal'` when defaulted.

**Review screen UX:** table of lines; high-confidence rows collapsed green; only problems expanded (yellow: confirm match; red: needs input). Line photo-crop shown on tap (the exact invoice region, from vision bounding hints when available). Non-food lines auto-hidden under "excluded (3)". One "Confirm all" button.

**Edge cases (must handle):** multi-page PDFs; handwritten delivery notes (lower confidence → full review); credit notes (create negative moves / batch adjustments); duplicate upload detection (same supplier+invoiceNumber → warn & diff); mixed-language invoices; kg-price vs unit-price ambiguity (show computed total sanity check vs printed total — mismatch >2% flags review); photos that are too blurry (client-side blur detection → "retake photo" before upload).

**Performance target:** extraction round-trip ≤ 15 s for a 1-page invoice; review ≤ 60 s for 20 lines.

### 9.2 Product catalog & batches

- Org-level catalog grows organically from invoices (no upfront data entry). Managers can merge duplicates (merge tool keeps history), edit allergens/shelf-life, mark favourites.
- Batch list per site: filterable by product/supplier/expiry/status; every batch shows provenance chain (tap → supplier + invoice photo in 2 taps — the inspector wow-moment).
- **Labels:** print internal labels (QR + product + lot + expiry) for decanted/prepped items via any AirPrint/Zebra-compatible printer (browser print CSS; ESC/POS via WebUSB is v1.1). Scanning a label opens the batch.

### 9.3 Receiving (modtagekontrol)

Confirming an invoice offers the receiving check inline (temp of chilled goods via numeric pad/photo, packaging OK chips, photo). It writes both the `goods_receipts` fields **and** a `task_completions` row against the `receiving_check` control point — one action, two obligations (R3+R5). Deliveries without invoice (market purchase): "Quick receive" form — supplier picker + product lines with big steppers; still 100% traceable.

### 9.4 Production & transformation (v1: lightweight)

"Prep batch" action: pick input batches (scan or list) → name output (e.g. "Ragù 15 L") → quantity + internal expiry (pack default per category, e.g. cooked-cooled 3 days `[DEFAULT]`, editable) → creates `origin='produced'` batch with `parent_batch_ids` (full ingredient-level trace both directions). Full recipe/BOM management with per-dish allergen auto-calc: v1.1 (schema already supports it).

### 9.5 End-of-service leftover check (rimanenze) — signature flow

At close (or per service period), the app shows a **swipe-through deck** of open batches & prepped items likely touched today (heuristic: moved/produced in last 48h, or storage_type=fridge), each card: photo/emoji, name, remaining quantity stepper.

Per card, one thumb gesture / tap:
- **"Brugt op"** (used up) → remaining = 0, move `use`;
- **"Gemt"** (kept) → optional new quantity via stepper; if prepped food, offers "print new label / extend internal expiry per rules" (never beyond pack limits);
- **"Kasseret"** (discarded) → waste move with one-tap reason chip (`expired | overproduction | deviation | dropped | other`) — feeds waste analytics (madspild, which DVFA also cares about and owners love for cost control);
- **Skip** (untouched).

Session summary saved to `leftover_sessions`; target completion time **≤ 2 minutes for 25 items**. Missed sessions surface next morning ("yesterday's leftover check not completed").

### 9.6 Stock view & recall

- **Stock now:** per product, sum of active batch `remaining`, grouped by storage type, "expiring soon" rail on top (from `v_expiring_batches`) with FIFO nudge ("use batch #A first").
- **Recall / trace search (must be < 30 s):** search by supplier, product, lot, or date range → results show: what came in (invoice links), what's still in stock, what was used/served when, what was discarded, and (for B2B) which customers received it → one-tap **Recall report PDF** (`recall_events`). This satisfies "producible immediately on request".

### 9.7 One step forward (B2B)

For catering/producers/wholesale: "Outbound delivery" form — customer picker (`b2b_customers`), batches + quantities (scan labels), date → `inventory_moves.kind='sale_b2b'` + delivery-note PDF. Retail sale to consumers requires no records (out of scope by law).

---

## 10. Module M4 — Inspection mode

**Goal:** during an unannounced Smiley inspection, the operator taps one button and hands over a tablet; every question has a ≤30-second answer (R2, R5, R6 — "prove utilizzabili durante un controllo").

### 10.1 Entry

- Persistent **"Kontrolbesøg"** button on site home (shield icon). Tap → confirms → opens Inspection mode; simultaneously (a) notifies org admins ("inspection started at {site}"), (b) starts an `inspector_links` session, (c) locks the device session into **read-only guest mode** (exit requires manager PIN).
- Alternative: generate a **magic link / QR** the inspector opens on their own device (time-boxed 4h, read-only).

### 10.2 Inspector-facing layout (Danish-first, mirrors how inspections run)

Tabs, all read-only, all exportable to PDF:

1. **Egenkontrolprogram** — current approved version (with approval signature block, version history), the risk analysis behind it **rendered in the official skema layout (§7.6)** — plus, if imported, the original legacy document — and pack/legal references. Record organization follows what inspectors document per Kontrolvejledningens Bilag 11a.
2. **Registreringer** (records) — by category (køl, frys, opvarmning, nedkøling, varmholdelse, rengøring, modtagelse), calendar heat-map (done/missed/deviation per day), drill into any record: value, photo evidence, who, when (incl. late-entry flags). Date-range picker with presets ("last 3 months").
3. **Afvigelser** (deviations) — list with corrective actions and verification status; repeat-deviation analysis per control point (transparency builds trust and matches R9 logic).
4. **Sporbarhed** (traceability) — the recall/trace search of §9.6 in read-only form: type a product/lot/supplier, get the full chain with invoice images.
5. **Dokumenter** — pest-control contracts, training certificates, water tests, previous smiley reports (uploaded in `documents`).

### 10.3 Exports

Any tab → "Export PDF" (site letterhead, generated timestamp, page numbers, record hashes footnote §17). Also a one-click **"Full inspection bundle"** ZIP (programme + last-12-months records + open/closed deviations + traceability index) for email to the authority. Exports logged in `audit_log`.

---

## 11. Module M5 — Multi-site management

**Goal:** an owner or chain manager runs 2–50 sites without visiting each dashboard ("Multi-sede" requirement).

- **Portfolio dashboard** (`/org/dashboard`): table+cards of all sites with **Compliance Score** (0–100, computed: task completion rate 40%, open major deviations 25%, deviation resolution time 15%, programme freshness 10%, traceability hygiene—unconfirmed invoices, missing leftover sessions 10% `[DEFAULT]` weights in config), today's task progress, open deviations, current Smiley, subscription status. Sort/filter; red-flag rail on top.
- **Drill-down** into any site with full manager view (respecting role scoping).
- **Programme templating:** create an org-level programme template from one site → apply to new/existing sites (site-specific equipment re-mapped via a short wizard). Central edits can be **pushed** to sites as "proposed changes" requiring local approval (keeps the legal principle that each site's programme matches *that* site).
- **Cross-site catalogs:** suppliers and products are org-level already; price comparison per product across sites/suppliers (bonus owners love).
- **Weekly digest email** per org: scores, misses, top deviations, expiring-soon value, waste €.
- **Benchmarks:** anonymous percentile vs. similar activity types on completion rate & waste (platform-level aggregate, opt-out available).

---

## 12. Module M6 — SaaS platform, billing & platform admin

### 12.1 Plans `[DEFAULT]` (config-driven, Stripe Products)

| Plan | Price (per site/month, DKK ex VAT) | Includes |
|---|---|---|
| Basic | 349 | 1 site, self-control + inspection mode, 3 users, 100 AI invoice pages/mo |
| Pro | 549 | + traceability/inventory/leftovers, unlimited users, 500 AI pages/mo, multi-site dashboard |
| Chain | 449 (5+ sites) | Pro for chains + org templates + benchmarks + priority support |
| White-glove onboarding | one-off 2 500 | platform team builds the programme with the customer |

30-day trial, card required at day 20 nudge. Usage metering on AI pages (`ai_runs`). Enforcement via `org_features` + middleware.

### 12.2 Platform admin panel (`/admin`, `platform_admin` only)

- Org/site directory with search, health (score, activity, AI acceptance rates), subscription state, churn signals (no logins 7d, tasks stopped).
- **Impersonation**: "Enter as org" → banner "Support session — visible to customer", all actions logged to `admin_audit_log` and flagged in tenant `audit_log` (`impersonated_by`). This satisfies "utenti che hanno accesso a tutto" **safely**.
- Compliance pack studio: edit pack JSON with schema validation + preview + version diff → publish (triggers §13 review-task fan-out).
- AI quality console: extraction acceptance/edit rates, wizard regenerations, flagged outputs → feeds prompt iteration.
- Announcements (in-app banner per locale/plan).

### 12.3 Onboarding funnel

Public marketing site out of scope; app handles: invite links, org creation, guided first-site setup (§7), sample "demo site" with fake data for sales demos (`platform_admin` can spawn per prospect).

---

## 13. Module M7 — Regulatory support & guidance

**Goal:** the customer never has to read a bekendtgørelse ("Supporto e accompagnamento normativo").

- **Regulation change pipeline:** platform publishes `pack_versions` with changelog → affected sites get a `site_review_tasks` ("Rules changed: hot holding now ≥56°C — review 2 control points") with **one-tap "apply suggested change"** (diff view: current CP vs new default) or "keep mine (justify)". Nothing silently changes an approved programme (R9).
- **In-app guidance:** every control point / wizard step has a "?" → localized plain-language explanation + official source links (from pack `guidance`).
- **Compliance assistant (AI chat):** answers food-safety/regulatory questions grounded ONLY in pack guidance content + site's own programme (RAG over pack `guidance` + official texts stored as documents). Must cite its sources inline; if outside its grounding → "contact a consultant / the authority" fallback, no improvisation. Clearly labelled "guidance, not legal advice".
- **Smiley tracking:** store inspection outcomes per site (manual entry v1; scraping findsmiley.dk v1.1) → timeline, Elite-smiley progress indicator ("2 of 4 consecutive top results").
- **Training log:** simple record of staff hygiene training (who, what, when, certificate photo) — inspectors ask for it; lives in Documents tab.

---

## 14. AI subsystem specification

Central module `src/lib/ai/` — every feature goes through it (provider-agnostic interface, Claude first).

| Feature | Model `[DEFAULT]` | Pattern | Human gate |
|---|---|---|---|
| Risk-analysis wizard drafting | Claude Sonnet (latest) | tool-use JSON per section, temperature 0.2 | full review + approval (blocking) |
| Risk-analysis / programme import (photo, PDF, DOCX, XLSX incl. handwriting) | Claude Sonnet, vision | pages → official-skema schema §7.5, temp 0, per-cell confidence + provenance | side-by-side review vs original; gaps asked, never invented; approval blocking |
| Invoice extraction | Claude Sonnet, vision | pages → schema §9.1, temp 0 | confirm screen; auto-confirm only if `overallConfidence ≥ 0.97` **and** org opted-in `[DEFAULT: off]` |
| Product enrichment (category/shelf-life/allergens) | Claude Haiku | JSON | shown pre-filled, editable; allergens always badge "confirm" |
| Thermometer/display photo reading | Claude Haiku, vision | `{value, unit, confidence}` | operator confirms pre-filled value |
| Compliance assistant | Claude Sonnet | RAG with citations | it's advisory chat; sources mandatory |
| Deviation text polish (dictation → clean note) | Claude Haiku | rewrite | user sees result before save |

**Rules:**

1. All outputs Zod-validated; on failure retry ≤2 with validator errors appended; then degrade gracefully (manual path always exists — **no AI feature may be a hard dependency for completing a compliance action**, e.g. invoices can be entered manually line-by-line).
2. Log every run to `ai_runs` with acceptance/edit outcome → weekly quality report in admin console.
3. Prompts versioned in repo (`src/lib/ai/prompts/*.ts`), never inline strings; include pack version + locale.
4. Cost controls: page-count metering per org/plan; images downscaled to ≤1568px longest side before vision calls; batch multi-page where possible.
5. Privacy: send only what's needed (invoice images, transcripts); no cross-tenant context; EU processing note in DPA (§17).

---

## 15. UX principles & key screens

### 15.1 Principles

- **Kitchen mode by default on operator paths:** min touch target 56px, base font 18px, high contrast (WCAG AA on stainless-steel-glare), works in portrait one-handed; numbers via custom big keypad, never OS keyboard for temps.
- **3-tap rule** for any daily action; **0-typing rule** for operators (chips, steppers, photos, dictation).
- **Instant feedback:** optimistic UI everywhere; success = big green check + haptic (where supported); failure states never lose data.
- **Danish default**, language switch per user; all dates/temps in local formats.
- **PIN identity switcher** persistent in header on shared devices (avatar grid, 1 tap + 4 digits, 2 s).
- Empty states teach ("No fridges yet — photograph your first one").
- Web dashboard (manager/owner paths) may be information-dense; kitchen paths must not.

### 15.2 Screen inventory (routes)

```
/ (site picker if >1)                       /app/[site]/today            ← operator home (M2)
/app/[site]/check/[taskId]                  /app/[site]/scan             ← QR/NFC resolver
/app/[site]/deviations  [/new, /[id]]       /app/[site]/receive          ← invoice capture (M3)
/app/[site]/receive/review/[invoiceId]      /app/[site]/stock            ← batches & expiring
/app/[site]/leftovers                       /app/[site]/trace            ← search & recall
/app/[site]/inspection                      ← M4 (guest-lockable)
/app/[site]/programme  [/wizard, /review]   ← M1
/app/[site]/equipment  [/[id]]              /app/[site]/documents
/app/[site]/reports    (temps, misses, waste, training)
/org/dashboard          /org/sites          /org/members
/org/templates          /org/billing        /org/settings
/admin/*                                     ← M6 platform panel
/inspect/[token]                             ← inspector magic link (read-only)
```

### 15.3 Visual identity `[DEFAULT]`

Clean, trust-forward: white/neutral surfaces, deep green primary (#0F766E), semantic red/amber strictly reserved for compliance states, generous whitespace, rounded-xl cards, lucide icons. Photo thumbnails everywhere records have evidence (evidence should *look* like evidence).

---

## 16. Offline-first PWA specification

Kitchens have dead zones; delivery arrives in the basement. Offline is a first-class requirement for **operator flows** (M2 checks, M3 invoice capture & leftovers). Manager dashboards may require connectivity.

- **App shell** precached (Serwist); versioned deploys with in-app "update ready" toast.
- **Read cache:** today's tasks, control points, equipment (incl. reference photos), open batches, product catalog subset, current programme → IndexedDB (Dexie), synced on each online session (delta by `updated_at`).
- **Write queue:** all operator mutations go to a local outbox (Dexie table) → background sync (service worker `sync` event + foreground retry) → server actions idempotent by `client_uuid` (upsert). Photos stored as blobs in the outbox, uploaded first, then the record.
- **Conflict policy:** records are append-only (completions, moves, deviations) → conflicts are practically impossible; the rare same-entity edit (e.g. batch remaining) resolves **server-wins + both values kept in audit diff**.
- **Clock integrity:** `client_created_at` recorded but flagged if it drifts >10 min from `server_received_at` (shown as "recorded offline, synced at …" — inspectors accept this; fabricated times they don't).
- **UI:** subtle offline pill; queued count badge; nothing blocks the operator.
- Install prompts: A2HS flow with per-platform instructions; QR on the manager dashboard to install on kitchen devices.

---

## 17. Security, GDPR & record integrity

- **RLS everywhere:** policies per table: `org_id in (select org_id from memberships where user_id = auth.uid())` + role checks for writes + site scoping via `site_ids`. `platform_admin` bypass via separate policies checking a `platform_roles` table — never via service key in user paths. **RLS tests are mandatory** (each table: cross-tenant read/write must fail) — part of CI.
- **Record integrity (evidence-grade):** compliance records (task_completions, deviations, goods_receipts, inventory_moves, invoices) are **append-only** — no UPDATE/DELETE grants; corrections create linked superseding rows (`corrects_id`). `audit_log` rows carry `sha256(after)` chained with previous hash per site (`prev_hash`) → tamper-evident chain; exports print chain verification note. DB backups: Supabase PITR + weekly logical dump to separate EU bucket.
- **Photos:** EXIF stripped except datetime; content hash stored; served via short-lived signed URLs.
- **GDPR:** EU-only processing (Supabase EU, Vercel fra1, Anthropic API with EU data processing terms noted in DPA); DPA template for customers; data classified (staff PII minimal: name, email, PIN hash); retention job (Edge cron) enforcing pack retention then archiving to cold storage; org data export (JSON+files) and deletion workflow (soft-delete 30 days → purge, except records under legal retention which are anonymized to role level `[DECISION]`); cookie-less analytics.
- **Auth hardening:** PIN = 4 digits hashed (argon2) + rate-limited (5 tries → manager unlock); inspector links single-use-token hashed, 4h TTL; session revocation on device list; 2FA optional for org_owner/admin `[DEFAULT: prompt]`.
- **Secrets/env:** `.env.local` gitignored; document all vars in `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `VAPID_*`).

---

## 18. Non-functional requirements

- **Performance:** operator screens TTI < 2 s on mid-range Android over 4G; check save (online) < 500 ms perceived (optimistic); invoice extraction ≤ 15 s/page p90; trace search < 2 s.
- **Availability:** target 99.9%; app must remain usable for checks during any backend outage (offline mode is the DR story for operators).
- **Scalability envelope v1:** 1 000 orgs, 5 000 sites, 50 concurrent device sessions/site burst, 200k task_completions/day → trivial for Postgres if indexed (`(site_id, due_at)`, `(site_id, created_at desc)` etc. — add indexes with each migration).
- **Accessibility:** WCAG 2.1 AA on operator paths; screen-reader labels on all icon buttons.
- **Browser matrix:** last 2 Safari iOS + Chrome Android + desktop evergreen; PWA install both platforms.
- **Localization completeness gate:** CI fails if `da`/`en` keys missing (it may lag `[DEFAULT]`).

---

## 19. Repository structure & conventions

```
/ (repo root)
├── CLAUDE.md                  ← summarize this blueprint + commands + conventions
├── BLUEPRINT.md               ← this file
├── supabase/
│   ├── migrations/            ← numbered SQL migrations (schema §6 + RLS + views + seeds)
│   ├── functions/             ← edge functions: task-materializer, reminders, retention, digests, stripe-webhook
│   └── seed/                  ← DK compliance pack JSON, demo org fixture
│       └── corpus/DK/         ← official documents (§3.3) — copy from /corpus/DK next to this blueprint
├── src/
│   ├── app/                   ← Next.js App Router (routes §15.2; route groups: (operator) (manager) (org) (admin) (public))
│   ├── components/            ← ui/ (shadcn), kitchen/ (big-touch variants), charts/
│   ├── lib/
│   │   ├── ai/                ← provider.ts, prompts/, schemas/ (Zod), runners per feature §14
│   │   ├── supabase/          ← typed clients (server, browser, middleware), generated types
│   │   ├── offline/           ← dexie db, outbox, sync engine, hooks
│   │   ├── compliance/        ← pack loader, limit evaluator, frequency→task expansion (rrule)
│   │   ├── pdf/               ← programme/report/recall renderers
│   │   └── billing/, i18n/, audit/
│   └── messages/              ← da.json, en.json, it.json
├── e2e/                       ← Playwright specs per module
└── tests/                     ← vitest unit + RLS test harness
```

**Conventions:** TypeScript strict, no `any`; server actions in `_actions.ts` colocated per route; all money `numeric` in DB / integer øre in Stripe; all user-visible strings through i18n; commit style `feat(m3): …`; each module lands with its e2e spec.

---

## 20. Build plan for Claude Code

Execute phases in order; each has a **definition of done (DoD)**. Do not start a phase before the previous DoD passes. Write tests inside each phase, not at the end.

**Phase 0 — Foundation (repo, auth, tenancy).**
Scaffold Next.js+TS+Tailwind+shadcn, Supabase project wiring, migrations for §6.1 tables, RLS + RLS tests, auth flows (signup/login/invite), org+site creation, membership roles, PIN identity switcher, i18n skeleton (da/en/it), CI (lint, typecheck, vitest, Playwright smoke, RLS tests).
*DoD: two orgs cannot see each other's data (test-proven); user can create org→site→invite operator; PIN switch works.*

**Phase 1 — Compliance pack & programme core.**
Pack tables + DK pack v1 seed (full JSON: §2 templates, §3 control point templates incl. updated 2025 temps, hazard library, guidance — every item with `sourceRef` into the official corpus §3.3), corpus ingestion (originals + chunked/embedded for RAG), pack loader/validator, control points CRUD, task materializer (rrule → tasks, site TZ), equipment CRUD with photo + QR generation.
*DoD: seeding a demo restaurant produces a correct 7-day task schedule; QR deep-links to equipment; every pack limit traces to a corpus sourceRef.*

**Phase 2 — M2 daily self-control.**
Today screen, temperature/checklist/cooling/hot-holding flows, deviation 3-step flow + follow-up tasks, reminders (push+email), ad-hoc records, reports (temp history, misses).
*DoD: full day simulated on mobile viewport in Playwright: complete tasks, force a fail → corrective flow → verification task; all records attributed via PIN.*

**Phase 3 — Offline engine.**
Serwist SW, Dexie stores, outbox sync with idempotent upserts, photo queue, conflict/audit flags, offline e2e (Playwright offline emulation: complete checks offline → sync → server state correct).
*DoD: airplane-mode day works; queue drains; late-sync flags visible.*

**Phase 4 — M1 AI wizard, import & programme approval.**
AI provider layer + prompts + Zod schemas, wizard chat UI with chips, equipment photo onboarding, draft generation with guardrails, review editor, approval + PDF snapshot. **Import pipeline (§7.5):** guided multi-photo capture, PDF/DOCX/XLSX extraction to official-skema schema, gap analysis, side-by-side review with provenance crops, gap-completion mini-wizard. **Official-format renderers (§7.6)** with golden-file tests against `DK-RA-SKEMA` and `DK-EK-EXAMPLE` layouts.
*DoD: demo pizzeria interview (scripted fixture answers) yields complete draft covering all steps/categories; loosening a limit without justification is impossible; approved PDF renders in da+en in the official layout; fixture imports — a filled paper skema (photos, incl. handwriting), a consultant DOCX, the official editable PDF — all map correctly, gaps detected, nothing hallucinated (empty cells stay empty in extraction output).*

**Phase 5 — M3 traceability & inventory.**
Invoice upload+extraction+matching pipeline+review UI, suppliers/products/batches, receiving check integration, quick receive, prep batches, leftover deck, stock view, trace search + recall PDF, B2B outbound.
*DoD: fixture invoices (5 real-world-style PDFs incl. 1 handwritten note, 1 credit note, 1 duplicate) process correctly; trace query answers in <2 s; leftover session of 25 items ≤ 2 min scripted.*

**Phase 6 — M4 inspection mode + exports.**
Inspection UI, guest lock + magic links, PDF exports + full bundle, hash-chain footer.
*DoD: inspector link shows read-only truth; exports match on-screen data; audit rows written.*

**Phase 7 — M5 multi-site + M7 regulatory support.**
Org dashboard + score, templates/push-proposals, digests, pack-update pipeline + review tasks + diff UI, compliance assistant (RAG w/ citations), smiley tracking, training log.
*DoD: publishing a pack change fans out review tasks with correct diffs; assistant refuses out-of-scope questions and always cites.*

**Phase 8 — M6 billing & platform admin.**
Stripe plans/webhooks/trials/metering, feature gating, admin panel (directory, impersonation with logging, pack studio, AI console), demo-site spawner.
*DoD: trial→paid lifecycle green in Stripe test mode; impersonation fully logged & bannered; AI metering decrements.*

**Phase 9 — Hardening & launch.**
Load test task-day path, retention cron, backups restore drill, Sentry, a11y pass, da localization review, security checklist (§17) sign-off, seed production DK pack, pilot playbook, **compliance dossier generator (§3.4)** producing the feature→obligation→sourceRef PDF for the Fødevarestyrelsen engagement.

---

## 21. Requirements traceability matrix

| Requisito richiesto | Where satisfied |
|---|---|
| Tipologia di attività target | §2 activity templates; wizard adapts per type (§7) |
| Copertura obblighi HACCP | §3.1 R1–R4, R7–R9; M1 wizard (§7); M2 records (§8); pack encoding (§3.2) |
| Tracciabilità & prove per il controllo | §3.1 R5–R6; M3 (§9); M4 inspection mode (§10); integrity (§17) |
| Multi-sede | tenancy (§4); M5 (§11); org catalogs (§9.2) |
| Facilità d'uso reale / risparmio tempo | principles (§1, §15); 3-tap flows (§8.2); offline (§16); north-star metrics (§1) |
| Supporto e accompagnamento normativo | M7 (§13); pack update pipeline; assistant with citations |
| Utenti con accesso a tutto (vendita/supporto) | `platform_admin` + impersonation + admin panel (§4.2, §12.2), safely audited (§17) |
| AI per analisi rischi | M1 (§7) + guardrails (§14) |
| Import risk analysis esistente (foto/file) → formato standard ufficiale | §7.5 import pipeline; §3.3.1 canonical skema model; §7.6 official-layout export |
| Compliance totale / approvazione della food authority | §3.3 official corpus with sourceRefs; §3.4 approval-readiness dossier & engagement plan; §7.6 official formats; §17 record integrity |
| Foto strumenti per i check / tabelle semplificate | §8.2 photo-first checks, reference photos, checklist tables |
| Fattura fornitore → prodotti automatici | §9.1–9.4 ingestion pipeline |
| Check rimanenze fine servizio | §9.5 leftover deck |

---

## 22. Out of scope v1 / roadmap

- **v1.1:** email-in invoices; findsmiley.dk auto-sync; recipe/BOM + allergen matrix auto-calc; label printer (ESC/POS); wholesale pack; Italian compliance pack (ASL/HACCP it); CSV/API export for accountants.
- **v2:** IoT temperature probes (LoRa/BLE bridges) with auto-logging + probe-vs-manual reconciliation; supplier EDI/Peppol ingestion; POS integrations (sales-side depletion estimates); predictive prep suggestions from leftover history; marketplace of consultants; native app wrappers if PWA push limits bite on iOS.
- **Never (product stance):** features that back-date or fabricate records; selling customer data.

---

## 23. Glossary

| Dansk | English | Meaning |
|---|---|---|
| Fødevarestyrelsen (DVFA) | Danish Veterinary and Food Administration | Authority (since 2026 within Styrelsen for Fødevarer, Landbrug og Fiskeri) |
| Egenkontrol / egenkontrolprogram | Self-control / own-check programme | Mandatory HACCP-based programme + records |
| Risikoanalyse | Risk analysis | Hazard review across all process steps |
| Kritisk kontrolpunkt (CCP) | Critical control point | Step requiring monitored control |
| Modtagekontrol | Receiving check | Inbound goods control |
| Nedkøling / varmholdelse | Cooling / hot holding | 56→10°C in 4h; ≥56°C holding (2025 rules) |
| Sporbarhed | Traceability | EU 178/2002 art. 18 one-step-back/forward |
| Smiley-ordningen / Elite-smiley | Smiley scheme | Published inspection results; elite after 4 consecutive top results |
| Branchekode | Industry guide | Sector self-control guides |
| Afvigelse / korrigerende handling | Deviation / corrective action | Limit breach + documented fix |
| Madspild | Food waste | Tracked via leftover/waste moves |

---

## 24. Regulatory sources

- Fødevarestyrelsen — egenkontrol overview & HACCP principles: https://foedevarestyrelsen.dk/kost-og-foedevarer/start-og-drift-af-foedevarevirksomhed/egenkontrol-og-risikoanalyse/haccp-principperne
- Fødevarestyrelsen — written self-control (skriftlig egenkontrol): https://foedevarestyrelsen.dk/kost-og-foedevarer/start-og-drift-af-foedevarevirksomhed/egenkontrol-og-risikoanalyse/skriftlig-egenkontrol
- Fødevarestyrelsen — egenkontrol guidance (Vejledning om egenkontrol, PDF): https://foedevarestyrelsen.dk/Media/638191315410899261/Vejledning%20om%20egenkontrol%20i%20f%C3%B8devarevirksomheder.pdf
- Fødevarestyrelsen — example own-check programme (EN, PDF): https://foedevarestyrelsen.dk/Media/638532672357073065/Egenkontrol%20engelsk%202024.PDF
- Smiley scheme (about): https://www.findsmiley.dk/english/Pages/About.aspx and https://en.foedevarestyrelsen.dk/food/inspection/inspection-of-food-establishments
- Updated cooling/hot-holding temperatures (Nov 2025): https://www.danskerhverv.dk/presse-og-nyheder/nyheder/2025/november/nye-regler-for-nedkoling-og-varmholdelse-her-er-de-nye-minimumstemperaturer-for-fodevarer/ ; hygiene guide ch. 27: https://foedevarestyrelsen.dk/lovstof/vejledninger/hygiejnevejledningen/27-varmebehandling-og-varmholdelse-af-foedevarer
- EU Reg. 178/2002 art. 18 (traceability) + Commission guidance on retention: https://food.ec.europa.eu/system/files/2016-10/gfl_req_guidance_rev_8_en.pdf
- Digital tools portal "Sikre fødevarer": https://sikrefoedevarer.foedevarestyrelsen.dk/

**Local corpus (provided as files — see §3.3, to be stored in `supabase/seed/corpus/DK/`):** Risikoanalyse-skema (editable PDF 003, da) · Risk analysis form (en, 002) · EXAMPLE OF Own-Check programme (en, 2024) · Hygiejnevejledningen nr. 9700 (24-07-2025) · Autorisationsvejledningen nr. 9164 (27-02-2025) · Kontrolvejledningens bilag — samlet · Guidelines on Inspections in the Food Sector (2019-62-33-00056, 22-06-2020).

> **Verify before launch:** pack content in `supabase/seed/` must be reviewed against the current Egenkontrolvejledningen and Hygiejnevejledningen at build time — regulations moved in Nov 2025 and the agency merged in Jan 2026; treat this document's numbers as seed values requiring a final legal review.

---

*End of blueprint. Feed this file to Claude Code together with a `CLAUDE.md` summarizing §19–§20, and build phase by phase.*


