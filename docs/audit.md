# KitchenProof — Phase 0 audit

Date: 2026-07-27 · Commit at audit: `799620e` · Production: https://kitchenproof-tau.vercel.app

Scope: the rework brief of 2026-07-27. **No product code was changed.** Every claim below is
backed by a command that was run against this repo, the local stack, or the production
database/deployment; the evidence is quoted inline.

---

## 0. Executive summary

The brief assumes three defects that turn out to be **one production configuration failure plus a
code pattern that hides it**, and it assumes two things that are already built.

| Brief's premise | Verified reality |
|---|---|
| §4.1 "the app is not gated" | **Not confirmed.** Middleware gates every route except an explicit public list; all 44 tables have RLS enabled; 18 of 22 server-action files carry explicit role checks and the 4 without are legitimately public (signup, login, invite-accept, org creation). The real auth gaps are narrower — see §5. |
| §4.2 "inspector link shows no updated data" | **Confirmed as a symptom, wrong cause.** The route is genuinely live (proven by probe + production headers). The data is empty because **the service-role key does not work in the Vercel runtime**, and every query made with it fails silently. Same root cause as the dead cron. See §3. |
| §4.3 "reports do not follow the DVFA standard" | **Partially wrong.** Official-format renderers with golden-file tests exist for `DK-RA-SKEMA` (da/en). What is missing is the own-check report column set (deviation / corrective action / checked-by) — see §4. |
| Thresholds hardcoded as constants | **Already correct.** Limits live in versioned compliance packs with `sourceRef {docId, section, page}`. §3.3's requirement 1 is largely met; requirement 2 (product vs ambient) is entirely missing. |
| Traceability needs building | **Two-thirds exists.** `batch_origin` is already `received / produced / leftover`, matching §3.4's three inventory kinds, with QR labels and a trace search. The missing link is the **customer order** and the production↔order relation — see §4. |

**The single most important finding:** production has been silently degraded since 2026-07-22.
No scheduled task has been created for five days, no reminder has ever been sent, and the
inspector link shows an empty programme. One broken environment variable, one code pattern that
swallows the error. Everything else in this document is smaller than that.

---

## 1. Stack and architecture map

| Concern | Implementation | Evidence |
|---|---|---|
| Framework | Next.js 16.2 App Router, React 19, TypeScript strict, RSC + Server Actions | `package.json`, `next.config.ts` |
| Hosting | Vercel, functions pinned to `dub1` (Dublin) | `vercel.json`, `x-vercel-id: fra1::dub1::…` |
| Database | Supabase Postgres, project `tkpobsgrblqxtgbmddxq`, region **eu-west-1** | decision log, `pg_constraint` query |
| Auth | Supabase Auth via `@supabase/ssr`; session refresh + route gating in `src/proxy.ts` | `src/lib/supabase/middleware.ts` |
| Authorisation | **RLS is the security boundary** (44/44 tables), plus explicit role checks in server actions | `pg_class.relrowsecurity` = true for all |
| Data fetching | Server Components query directly; mutations are colocated `_actions.ts` (59 actions in 23 files) | `find src/app -name _actions.ts` |
| Caching | No `revalidate`/`force-dynamic` anywhere except `scan/page.tsx`; pages are dynamic because they read cookies/searchParams | `grep "export const dynamic"` → 1 hit |
| PDF | `@react-pdf/renderer` server-side, golden-file tested | `src/lib/pdf/` |
| Offline | Serwist SW + Dexie outbox, idempotent replay keyed by `client_uuid` | `src/lib/offline/` |
| AI | Claude via `src/lib/ai/provider.ts` (streaming + Zod), fixture provider in CI | decision log 2026-07-21 |
| Scheduled work | Vercel Cron every 15 min → `/api/cron/run`, Bearer `CRON_SECRET` | `vercel.json` |
| Tests | 135 unit (vitest) · 90 RLS (pgTAP-style SQL harness) · 14 e2e (Playwright, mobile viewport) | last full run: all green |

**Multi-tenancy model:** `organizations → sites → everything`. Every domain table carries
`site_id` or `org_id`; there is no table scoped only by user.

---

## 2. Data model as it exists (44 tables, all RLS-enabled)

Grouped by purpose. Nothing here is un-scoped.

- **Tenancy/identity:** `organizations`, `sites`, `memberships`, `membership_pins` (deny-all,
  RPC-only), `profiles`, `platform_roles`, `device_sessions`, `push_subscriptions`
- **Regulatory content (§3.2 "compliance as data"):** `compliance_packs`, `pack_versions`,
  `corpus_documents`, `corpus_chunks`, `regulatory_updates`, `hazards`, `process_steps`
- **Programme:** `risk_analyses`, `ra_activity_rows`, `control_points`, `equipment`,
  `cleaning_areas`, `programme_documents`, `org_programme_templates`,
  `programme_change_proposals`, `site_review_tasks`
- **Daily records:** `tasks`, `task_completions` (append-only), `deviations` (guarded lifecycle),
  `notifications`
- **Traceability:** `suppliers`, `products`, `invoices`, `invoice_lines`, `goods_receipts`,
  `batches`, `inventory_moves`, `leftover_sessions`, `recall_events`, `b2b_customers`
- **Inspection & evidence:** `inspector_links`, `site_documents`, `smiley_inspections`,
  `training_records`, `audit_log` (hash-chained per site)
- **AI:** `ai_runs`, `ra_imports`

Two structural notes that matter for the brief:

1. `batches.origin` is already `received | produced | leftover` and `batches.parent_batch_ids`
   records provenance — so the **inventory register of §3.4 exists in substance**, including
   leftovers. What does not exist is the customer **order**.
2. `control_points.limit_json` holds the threshold, `source_ref` holds `{docId, section, page}`,
   and `limit_loosened` + `limit_justification` already implement "looser than the reference
   requires a recorded justification" (§3.3 rule 3).

---

## 3. Root cause: the inspector link, the dead cron, and the missing audit rows

### 3.1 What the brief suspected, and what the evidence says

| Hypothesis (brief §2.3) | Verdict | Evidence |
|---|---|---|
| Renders a snapshot written at share time | **Ruled out** | The page queries live on every request (`src/app/(public)/inspect/[token]/page.tsx:120-141`), and a probe proved it: a record created **after** the link was issued appeared on a plain guest reload and in a fresh anonymous context (`records BEFORE = 0` → `after reload = 1` → `fresh context contains "3.4" = true`). |
| Build-time / ISR / CDN cache | **Ruled out** | Production responds `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` and `x-vercel-cache: MISS`. |
| Token resolves to wrong/expired scope | **Contributing, not primary** | `resolve_inspector_link` filters `expires_at > now()`; expiry is a hardcoded 4 h with no revoke and no extension. An expired link renders "invalid", which is easy to misread as "no data". |
| Query filters exclude recent records | **Ruled out** | Records tab defaults to the last 90 days; the production records are 5 days old. |
| RLS silently returning empty for the anonymous session | **This is it — but it is not RLS.** | See below. |

### 3.2 The actual cause

The inspector page reads **all** its data through `createServiceClient()`. So does the cron. In
the Vercel production runtime that client cannot read the database, and every failure is
swallowed.

Proof, in order:

1. Production has data: 1 site (`Lasagne Hub`, `status = active`), 1 approved risk analysis,
   10 control points, 36 tasks, **8 completed records**, last one 2026-07-25 11:59.
2. Two inspector links were created on 2026-07-25 and **both were opened** (`used_at` set at
   12:01:34 and 12:03:58 — the RPC only sets it on a successful resolve).
3. Yet `audit_log` contains **zero `inspection.link_viewed` rows**, while locally the same code
   writes them reliably (8 links → 7 view rows). The audit insert also goes through the service
   client.
4. Calling the production cron with the correct secret returns
   `{"sitesMaterialized":0, …}` — all zeros — in 0.98 s with HTTP 200. `sitesMaterialized`
   is incremented **unconditionally once per site** inside the loop
   (`src/lib/cron/run.ts:92-96`), so a zero means `sites` came back empty or null.
5. The site is `status = 'active'`, and the embed the query uses is structurally valid: the
   foreign keys in production are byte-identical to local
   (`sites_org_id_fkey`, `inspector_links_site_id_fkey`, …).
6. Therefore the sites query did not return data because the client itself is unauthorised.
   The consequences match the observed production state exactly: **no tasks created since
   2026-07-22 09:01** (all 36 tasks share that timestamp) and **zero notifications ever**,
   although the cron has been scheduled every 15 minutes since 07-21.

**Conclusion:** `SUPABASE_SERVICE_ROLE_KEY` in the Vercel Production environment is missing,
truncated, or stale. I cannot read Vercel environment variables from here, so this is the one
finding I cannot close myself — but it is confirmable in under a minute (§8, action 1).

### 3.3 The defect that made a config error invisible — and it is the third time

```ts
// src/lib/supabase/service.ts
return createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,        // ← non-null assertion
  process.env.SUPABASE_SERVICE_ROLE_KEY!,       // ← lies at runtime
  { auth: { persistSession: false } },
);
```

A missing key does not throw. It produces a client that returns `{ data: null, error }` for every
query — and the call sites destructure `{ data }` and ignore `error`. The cron then reports
success while doing nothing, and the inspector sees empty tabs on a page that is working
perfectly.

This is the same failure mode already recorded twice in the decision log:

- Phase 4: `risk_analyses.approved_by` pointed at `auth.users`, the approver embed 400'd, and the
  approval PDF silently failed for two phases behind a non-fatal `catch`.
- Phase 6: the same class, found only because an e2e asserted on the artifact.

**Recommendation (P0):** treat silent failure as the bug, not the symptom. `createServiceClient()`
must throw on a missing key; every service-client call site must check `error` and fail loudly;
the cron must return a non-200 when a step errors, so Vercel surfaces it instead of reporting
success.

### 3.4 Smaller defects found in the same area

| # | Defect | Location |
|---|---|---|
| a | The audit insert looks up the **most recent non-expired link for the site**, not the link belonging to the token being used. With two live links, the wrong one is attributed. | `inspect/[token]/page.tsx:66-73` |
| b | No IP or user-agent is recorded for an inspector view — §4.2 requires both. | same |
| c | Link expiry is a hardcoded 4 h; there is no revoke and no configurable duration (§4.2 requires both). | `inspection/_actions.ts` |
| d | The page has no explicit `dynamic = "force-dynamic"` / `no-store`. It is dynamic today only as a side effect of reading `searchParams`; a future refactor could silently make it static. Cheap insurance, and the brief asks for it explicitly. | `inspect/[token]/page.tsx` |
| e | **The e2e never proved liveness.** `phase6-inspection.spec.ts` records its 3.4 °C reading *before* generating the link, so it only proves the link shows pre-existing data. I wrote the missing probe during this audit; it passes and should become the permanent regression test. | `e2e/phase6-inspection.spec.ts:93-107` |

---

## 4. Gap analysis against §3 (ground-truth data model)

Legend: **✔** exists · **◐** partial · **✘** missing

### §3.1 Business
| Field | State | Note |
|---|---|---|
| name, address, CVR, activity, language, contact | ✔ | `organizations.vat_number` (CVR), `sites` address fields, `cvr_p_number` (P-number) |
| `dvfa_registration_date`, `owner_entity`, separate legal vs production address, `logo` | ✘ | Not modelled |

### §3.2 Risk analysis
| Requirement | State | Note |
|---|---|---|
| Six sections with predefined activity rows, 2 tick boxes + 4 text columns | ✔ | `ra_activity_rows`, mirrors the official skema 1:1 (non-negotiable #4) |
| Versioning with author + timestamp, history visible to the inspector | ✔ | `risk_analyses.version/supersedes_id`, history tab |
| **`is_critical_activity` → linked own-check procedures, warning when unlinked** | ✘ | The tick exists; the link to control points and the resulting compliance warning do not |

### §3.3 Own-check records
| Form | State | Note |
|---|---|---|
| A Receipt of goods | ◐ | Receiving check exists inside the invoice flow; not a standalone weekly form with its own deviation block |
| B Cold storage / freezing | ✔ | Per-equipment temperature checks with limits |
| C Heat treatment | ✔ | Control point category exists |
| D Cooling curve (start/stop time + temp) | ◐ | Recorded, but **no running timer and no warning before the 4-hour window expires** (§3.3 rule 5) |
| E Cleaning plan | ✔ | `cleaning_areas` with free-text frequency |
| F Maintenance plan + "not our responsibility" | ✘ | Missing |
| **Product vs ambient reading on every temperature** | ✘ | `ambient` exists only as a *storage type* for products. No `measurement_kind` on records. **This is the highest-value compliance gap after §3.** |
| Threshold as data with citation | ✔ | `limit_json` + `source_ref {docId, section, page}` |
| Business value stricter allowed / looser blocked or justified | ◐ | `limit_loosened` + `limit_justification` columns and an AI guardrail that can only tighten; needs the manual-edit path enforced and surfaced |
| Breach auto-flags a deviation, corrective action required | ✔ | 3-step deviation flow |
| Receipt control gates use (`modtagekontrol`, §24) | ✘ | Goods are not held "not released for use" until checked |
| Leftovers must reach an explicit decision | ◐ | `batch_origin = leftover` + leftover deck exist; the forced reuse/discard/donate decision and the overdue flag do not |

### §3.4 Traceability
| Entity | State | Note |
|---|---|---|
| Purchase log | ✔ | `invoices` + `invoice_lines` + `goods_receipts`, invoice document stored, AI extraction |
| **Order log (client, event date, venue, delivery mode, portions)** | ✘ | Only `b2b_customers` + outbound deliveries. **The customer order does not exist.** |
| **Production (the connecting entity of §1.4)** | ◐ | `batches.origin='produced'` + `parent_batch_ids` give purchase→production. **production→order does not exist.** |
| Inventory register (ingredient / preparation / leftover) | ✔ | One `batches` register, all three origins, storage location, status |
| Label: short code + QR, printable, scan → full chain | ◐ | QR labels exist for batches and equipment; the scan resolves the batch. The **one-screen full chain** (purchases → supplier → invoice → every covering own-check record) is not that view |
| Shelf life never invented | ✔ | No auto shelf-life anywhere; consistent with §26.6 |
| Storage temperature on the label paired with durability | ✘ | Waiting on `Mærkningsvejledningen` — correctly not implemented |
| Recall log | ✔ | `recall_events` + recall PDF |
| **Recall started from the investigation, pre-filled** | ◐ | Trace search exists; recall is not pre-filled from it, and does not surface what is still physically in stock |
| **Investigation view, both directions, with a verdict line** | ◐ | `searchTrace` covers lookup; the "2 deviations on this chain" verdict and the exportable client contact list do not exist |

### §3.5 Operating calendar
**✘ Entirely missing.** No open/closed day concept anywhere (`grep closed_day|operating_day|is_closed` → no hits). Today's screen and the reports cannot distinguish "closed" from "missing record", which is precisely the distinction the brief calls free value for the customer.

### §4.4 / §4.6 / §4.7
| Requirement | State |
|---|---|
| Bottom tab bar on mobile, sidebar on desktop, one nav config | ✘ — currently a scrollable top bar (rebuilt yesterday) |
| Today screen as honest default | ◐ — exists; has no notion of a closed day |
| Onboarding wizard (business → pattern → equipment → cleaning → risk analysis → schedule) | ◐ — `/app/[site]/setup` checklist landed yesterday; it is a checklist, not a guided wizard, and has no operating-pattern step |
| Offline tolerance | ✔ |
| Danish/English throughout | ✔ (+ Italian) |
| Inspection-readiness view by the four DVFA areas | ✘ |
| Risk-group **estimate** with visible inputs | ✘ |
| Elite status tracking | ◐ — smiley history + Elite streak exist; no inspection history (type, sanctions) and no cost-of-lapse view |

---

## 5. Auth gap analysis

**Route gating.** `src/proxy.ts` matches everything except static assets and delegates to
`updateSession`, which redirects unauthenticated users to `/login` unless the path starts with
`/login`, `/signup`, `/invite`, `/offline`, `/inspect`, `/api/cron`, `/auth`. That is the correct
public set for this product.

**Server actions.** 59 actions across 23 files. 18 files perform explicit checks
(`getOrgContext` + `MANAGER_ROLES`, or `auth.getUser`). The 4 without are `signup`, `login`,
`invite/[token]` and `welcome` — all legitimately public or protected by a `SECURITY DEFINER` RPC
that keys off `auth.uid()`.

**Database.** All 44 public tables have RLS enabled. Cross-tenant isolation is covered by 90
passing RLS tests. Compliance records are append-only by grant revocation, not by convention.

**Gaps that are real:**

| # | Gap | Severity |
|---|---|---|
| 1 | **No `docs/permissions.md` and no single place where the role matrix is expressed.** Role rules are repeated per action (`MANAGER_ROLES.includes(ctx.role)`), so a new action can simply forget. | High — it is how the next hole gets introduced |
| 2 | The brief's role set (`owner/admin/staff`) vs the implemented set (`org_owner/org_admin/site_manager/operator/consultant/inspector_guest/platform_*`). Mapping needs to be agreed, not silently reconciled. | Decision needed |
| 3 | No automated test asserting that an authenticated user of org A gets 401/403/empty on org B's **routes** (RLS is tested at the SQL layer; the HTTP layer is not) | High — this is exactly §4.1's acceptance criterion |
| 4 | Records are append-only, but there is no *soft-delete with reason* for the configuration entities the brief mentions | Medium |
| 5 | Seed/demo data is separated by `SEED_DEMO=0` in production, but nothing marks a row as demo in the schema | Low |

---

## 6. Proposed implementation plan

Ordered. Each step is one reviewable commit or a short series, with tests, and stops for review.

### P0-1 — Restore production, and make silent failure impossible *(no migration)*
1. You re-paste `SUPABASE_SERVICE_ROLE_KEY` in Vercel → Production and redeploy (§8, action 1).
2. `createServiceClient()` throws on missing/blank env.
3. Every service-client call site checks `error`; the cron aggregates failures and returns HTTP 500
   with the failing step, so Vercel Cron reports a failure instead of a green run doing nothing.
4. `/api/cron/run` gains a one-line health summary; add a startup assertion that the key can read
   one row.
5. Regression test: cron against a seeded site asserts `sitesMaterialized >= 1` (today a broken
   key would still pass every existing test).

### P0-2 — Inspector link correctness *(no migration except 6)*
6. Promote the liveness probe into `e2e/phase6-inspection.spec.ts` (record created **after**
   issuing, asserted in a fresh anonymous context) — the brief's §4.2 acceptance criterion.
7. Resolve the audit row **from the token being used**, not the newest link; record IP and
   user-agent; explicit `force-dynamic` + `no-store` on the page.
8. Migration: `inspector_links.revoked_at`, configurable `expires_at` (default 4 h, choosable),
   owner-visible access log. Reversible: drop column, re-issue links.

### P0-3 — Auth hardening
9. `docs/permissions.md` + a single `can(role, action)` module; refactor the 18 files to use it.
10. HTTP-layer cross-tenant tests (org A session → org B routes/actions → 403/empty).

### P1-1 — Temperature truth *(migration)*
11. `task_completions.measurement_kind ('product'|'ambient')`, required for temperature records;
    limits carry which kind they express; a record whose kind is unknown is **not evaluated** —
    the operator is asked. Backfill: existing rows → `null` + flagged "kind unknown", never guessed.
12. Thresholds as a reference table per product category with the `Hygiejnevejledningen` citation
    rendered in the UI; every value I introduce will be listed in the commit message for you to verify.

### P1-2 — The chain: production and orders *(migration, the largest one)*
13. `orders` (client, contact, destination, event date, venue, delivery mode, products, portions)
    and `productions` (date, product, quantity, produced_by) with `production_purchases` and
    `production_orders` join tables; heat-treatment and cooling records attach to a production.
14. Investigation view, both directions, with the verdict line and the exportable client list.
15. Recall pre-filled from the investigation, surfacing stock still physically present.
16. Drills as e2e tests: recall drill, reverse drill, container drill (§6 of the brief).

### P1-3 — Operating calendar *(migration)*
17. `site_operating_days` + pattern config; derive from scheduled orders/productions; single-tap
    confirmation; closed days stored explicitly with who confirmed; frequency-based checks roll to
    the next operating day; reports render "closed", never a gap. Never retro-fill the past.

### P1-4 — Reports
18. Own-check exports gain the deviation / corrective-action / checked-by columns; page furniture
    (business, CVR, period, generation timestamp, page numbers); CSV/XLSX per log.

### P2 — Navigation and speed
19. Bottom tab bar on mobile / sidebar on desktop from one nav config, permission-aware.
20. Pre-filled proposals in the chain (open purchases since last production, upcoming orders),
    always confirmable, never auto-confirmed.

### P3 — Inspection readiness
21. Readiness view by the four DVFA areas; risk-group **estimate** with visible inputs and an
    override for the real classification; inspection history and elite tracking.

---

## 7. Answers to your §7 questions

**1. Conflicts between §3 and the existing schema — which wins?**
Three real conflicts. (a) *Roles*: yours is `owner/admin/staff`, the code has six roles because
the DVFA product needs `consultant` and `inspector_guest`. I recommend keeping the implemented set
and mapping yours onto it (`owner→org_owner`, `admin→org_admin|site_manager`, `staff→operator`).
(b) *Batch vocabulary*: §1.4 says the user must never see the word "batch" — the schema uses
`batches` internally, which is fine, but the Danish/English UI strings need an audit; that is a
copy change, not a schema change. (c) *Purchase log shape*: yours is one row per purchase with a
category multi-select; the code models `invoices` + `invoice_lines` because line items drive stock
and matching. Keep the code's; render it as your simpler view.

**2. Do I agree with `purchase → production → order`?**
Yes, and I would go further: it is already half-built (`batches.origin='produced'` with
`parent_batch_ids`). But I would **not** create a `production` entity separate from the batch
register. A production *is* the event that creates preparation batches; modelling it twice invites
divergence. My proposal: `productions` as a thin event (date, product, quantity, who) that owns the
batches it created, plus the two join tables. That keeps one physical register and adds exactly the
missing edge — production→order. The alternative you might prefer is no `productions` table at all,
linking orders directly to produced batches; that is simpler but loses "one cook, three orders" as a
single recorded act, and makes the cooking-temperature record attach to a container rather than to
the cook's action. I recommend the thin event.

**3. Inspector link per business or per inspection?**
**Per inspection.** It already is per-site with a 4 h expiry, and the audit trail is only meaningful
if one link equals one visit. Add revoke, and show the owner "opened at 14:12 from this device".

**4. Risk analysis editable by staff?**
**No.** `site_manager` and above. It is the legal document the business is judged on; the operator's
job is records, not scope. This matches the current implementation and non-negotiable #6.

**5. Data retention?**
The blueprint already sets defaults: traceability 5 years (6 months for highly perishable),
self-control documents 12 months online + 5 years archived, GDPR deletion 30 days soft → purge
except records under legal retention, which are anonymised to role level. Nothing to decide unless
you disagree.

**6. Single-site or multi-site schema?**
The schema is **already multi-site** (`organizations → sites`), with an org dashboard and programme
templates. No change needed; Lasagne Hub is one org with one site.

**7. OCR approach?**
Already built and working: Claude vision reads the invoice PDF/photo directly (no separate OCR
dependency), returns a Zod-validated structure, and the review UI requires human confirmation. The
fallback when extraction fails is the manual form, which exists. One caveat proven on 2026-07-21:
this path needs streaming and a raised function timeout, both now in place.

**8. Label format?**
**Answered 2026-07-27 — see §9.1.** No printer: masking tape and a pen, as the kitchen already
works. Nobody has to buy hardware to use the software.

---

## 8. What I need from you

1. **Verify `SUPABASE_SERVICE_ROLE_KEY` in Vercel → Settings → Environment Variables →
   Production.** Re-paste it from Supabase → Project Settings → API (`service_role`, the long JWT),
   redeploy, then re-run the cron check. This one action restores scheduled tasks, reminders and the
   inspector's data. Until it is done, production is quietly broken.
2. **Approve or amend the plan in §6**, in particular the order: I have put production restoration
   and silent-failure removal ahead of everything the brief lists as P0, because the auth and
   inspector work is untestable while the service client is dead.
3. **Answer question 8** (label printer or A4).
4. **Supply the two missing reference files** — `AAA_Own_Check_program_forms.xlsx` and
   `AAA_Traceability.xlsx` are not in the repo. I have placed the three PDFs in `docs/reference/`.
   I can build §3.3/§3.4 from your written field lists, but the spreadsheets would settle the
   details I would otherwise have to ask about one by one.
5. **Confirm the role mapping** in answer 1 above.

---

## 9. Decisions taken 2026-07-27

### 9.1 Labels: pen and tape, no hardware

**Decision:** the software must never require a label printer. The physical label stays what every
kitchen already does — masking tape, pen, the ingredient and the opening date. The app may generate
a **short identifier code** that an operator can *optionally* copy onto the tape.

Consequences for §3.4, replacing what the brief assumed:

1. **No label-printing workstream.** The A4 label-sheet renderer drops out of scope. QR codes stay
   where they are already earned: fixed equipment (a sticker on a fridge is printed once and lasts
   years), never on a food container.
2. **The bridge is the short code, and it is optional.** The item's identity in the database is the
   code; the operator's tape may or may not carry it. Therefore the app **cannot depend on the code
   being present** to find an item.
3. **This raises the bar on lookup, and that is the real work.** The container drill (§6 of the
   brief) must pass from what is actually written on the tape: *ingredient name + date*. So the
   inventory search has to answer "mascarpone opened on the 24th" as fast as it answers "R-0412",
   with the current fridge contents listed newest-first so the operator recognises the item rather
   than recalling it. A code-only lookup would have been easier to build and useless in this kitchen.
4. **Revised acceptance criterion** for the container drill: *holding a container labelled by hand,
   the operator (or an inspector on the share link) finds the item by name and date within three
   taps, and sees what it is, when it was made or opened, from which purchases and supplier, its
   use-by, and the temperature records covering it — on one screen.* The short code becomes a
   shortcut for the operators who choose to write it, not the mechanism.

### 9.2 Super-admin: the role exists in the database, the consent model does not

**Requested:** a role for the software owner (you) with access to a customer's data in order to help
them configure their account **when they ask for it**.

**Audit finding — this is further along than expected, and further from your wording than expected:**

| Layer | State |
|---|---|
| `platform_roles` table (`user_id`, `role`, `granted_by`) | ✔ exists |
| `is_platform_admin()` / `is_platform_staff()` used in the RLS policies of **every** migration | ✔ exists |
| `audit_log.impersonated_by` column | ✔ exists |
| Any admin UI (`src/app/(admin)`) | ✘ none |
| Impersonation logic, the mandatory banner, session logging | ✘ none (scheduled as Phase 8 in the blueprint) |
| A row in `platform_roles` granting you the role | ✘ none — nobody holds it today |

So the plumbing is in place and unused. Two things need deciding before I build the UI, and I am
**not** deciding them silently:

**(a) Blanket access, or consent-based access?** As implemented, `platform_admin` reads every org's
data at all times, unconditionally. Your words were "se lo richiedono loro" — if they ask. Those are
different products. I recommend a **consent grant**: the customer opens support access from their
settings, it is time-boxed (e.g. 72 h), it names who receives it, it is revocable in one tap, and it
appears in their own audit trail. You keep a break-glass path for emergencies that is itself logged
and visibly flagged. This is more work than blanket access by roughly a day, and it is the
difference between a product a Danish business trusts with its compliance record and one it does
not. GDPR-wise it is also the defensible position: access to personal and business data on a
documented, minimised, revocable basis.

**(b) Read-only or read-write?** "Help them configure the account" implies writing. I recommend
support access is **read-write on configuration** (equipment, cleaning plan, control points) and
**never write on compliance records** (`task_completions`, `deviations`, `goods_receipts`,
`inventory_moves`, `invoices`). Those are append-only by grant revocation today, and non-negotiable
#12 says no admin tool may back-date, overwrite or delete a compliance record. Support access must
not become the exception that hollows that out; if a customer's record is wrong, the honest fix is a
superseding entry made by them, not a silent correction made by us.

Until you choose, I will not grant the role to any account.

### 9.3 Reference files: two still unreachable

The three PDFs are in `docs/reference/`. **The two spreadsheets are not**: macOS blocks this process
from reading anything under `~/Downloads` (TCC folder protection — `ls ~/Downloads` itself returns
"Operation not permitted"), and the same block applies to `~/Documents`, so the filled-in
`Risk analysis.pdf` you attached could not be opened either. This is a permission on your machine,
not something I can work around.

**What I need:** copy the three files into the repo, where I can read them:

```
cp ~/Downloads/"AAA Own Check program forms.xlsx" ~/Downloads/"AAA Traceability.xlsx" \
   ~/Documents/"Lasagne Hub"/Legal/"Food Authority"/"Risk analysis.pdf" \
   "/Users/alessiogiampaolo/Claude/Projects/kitchenproof/docs/reference/"
```

Until then I am working from the field lists written in the brief, which are detailed enough to
design against but will leave me asking you about specifics (exact column order, which frequencies
appear in practice, how the recall log is laid out) that the files would answer in one read. The
filled-in risk analysis matters most for §4.3: it is the real layout with real content, which the
blank official skema in `corpus/DK/` does not show me.
