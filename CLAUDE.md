# CLAUDE.md — KitchenProof

Multi-tenant food-safety compliance SaaS (PWA) for the Danish market (DVFA / Fødevarestyrelsen).
**`BLUEPRINT.md` is the single source of truth.** Read the current phase's section of it before resuming work. Official regulatory corpus: `corpus/DK/` (→ copied to `supabase/seed/corpus/DK/`).

---

## Stack (BLUEPRINT §5) `[DECISION]`

Single **Next.js 15+ (App Router, TypeScript strict, RSC)** app on **Vercel** + **Supabase EU** (`eu-central-1`): Postgres 15+ (RLS on every table), Auth, Storage, Realtime, Edge Functions. PWA with full offline support on operator paths.

| Concern | Choice |
|---|---|
| Mutations | Server Actions (Zod-validated), colocated `_actions.ts` per route |
| Offline | Serwist service worker + Dexie.js (IndexedDB) + custom outbox sync queue |
| Data fetching | TanStack Query v5 (optimistic updates, offline mutation queue) |
| UI | Tailwind CSS + shadcn/ui + lucide-react; "kitchen mode" big-touch variants |
| i18n | next-intl — `da` (default), `en`, `it`; all strings in `src/messages/*.json` |
| AI | Claude API via `src/lib/ai/provider.ts` abstraction; structured outputs via tool-use JSON schemas; prompts versioned in `src/lib/ai/prompts/` |
| Billing | Stripe (per-site quantity subscriptions); Email: Resend; Push: Web Push (VAPID) |
| PDF | `@react-pdf/renderer` server-side; Charts: Recharts |
| Validation | Zod everywhere (API in/out, AI outputs, forms) |
| Testing | Vitest (unit), Playwright (e2e, mobile viewport + offline emulation), pgTAP/SQL for RLS |
| Monitoring | Sentry + Vercel analytics (PII-scrubbed) |

Package manager: **pnpm** `[DEFAULT]`. IDs: UUIDv7. Time: `timestamptz` UTC, display site-local (`Europe/Copenhagen`).

## Commands

```bash
pnpm dev                # Next.js dev server
pnpm build              # production build
pnpm lint               # eslint
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest unit tests
pnpm test:rls           # RLS cross-tenant tests (fail-closed proof)
pnpm test:e2e           # Playwright e2e
supabase start          # local Supabase stack (Docker)
supabase db reset       # re-run all migrations + seed
supabase migration new <name>   # new migration in supabase/migrations/
pnpm db:seed            # seed DK pack + demo fixtures
```

(Scripts are added as phases land; keep this list current.)

## Repo structure & conventions (BLUEPRINT §19)

```
├── CLAUDE.md / BLUEPRINT.md
├── supabase/
│   ├── migrations/        # numbered SQL (schema §6 + RLS + views + seeds)
│   ├── functions/         # edge fns: task-materializer, reminders, retention, digests, stripe-webhook
│   └── seed/              # DK compliance pack JSON, demo org fixture
│       └── corpus/DK/     # official documents (§3.3)
├── src/
│   ├── app/               # App Router; route groups: (operator) (manager) (org) (admin) (public)
│   ├── components/        # ui/ (shadcn), kitchen/ (big-touch), charts/
│   ├── lib/
│   │   ├── ai/            # provider.ts, prompts/, schemas/ (Zod), runners per feature §14
│   │   ├── supabase/      # typed clients (server, browser, middleware), generated types
│   │   ├── offline/       # dexie db, outbox, sync engine, hooks
│   │   ├── compliance/    # pack loader, limit evaluator, frequency→task expansion (rrule)
│   │   ├── pdf/           # programme/report/recall renderers
│   │   └── billing/, i18n/, audit/
│   └── messages/          # da.json, en.json, it.json
├── e2e/                   # Playwright specs per module
└── tests/                 # vitest unit + RLS test harness
```

- TypeScript strict, no `any`.
- All user-visible strings through i18n; CI fails on missing `da`/`en` keys (`it` may lag `[DEFAULT]`).
- Money: `numeric` in DB / integer øre in Stripe.
- Commits: `feat(m2): …` / `fix(m3): …` — small logical units.
- Each module lands with its e2e spec; tests live **inside** each phase, never deferred.
- Indexes added with each migration (e.g. `(site_id, due_at)`, `(site_id, created_at desc)`).

## Phase plan & DoD gates (BLUEPRINT §20)

Phases are **sequential and gated**: run the full test suite, present the DoD as a checklist with evidence, then **STOP for user approval** before the next phase.

| Phase | Scope | DoD gate |
|---|---|---|
| **0 — Foundation** | Scaffold, Supabase wiring, §6.1 migrations, RLS + RLS tests, auth (signup/login/invite), org+site creation, roles, PIN switcher, i18n skeleton, CI | Two orgs cannot see each other's data (test-proven); org→site→invite operator works; PIN switch works |
| **1 — Pack & programme core** | Pack tables + DK pack v1 seed (every item with `sourceRef`), corpus ingestion + RAG embedding, pack loader/validator, control points CRUD, task materializer (rrule, site TZ), equipment CRUD + photo + QR | Demo restaurant seed → correct 7-day schedule; QR deep-links; every limit traces to a corpus sourceRef |
| **2 — M2 daily self-control** | Today screen, temp/checklist/cooling/hot-holding flows, deviation 3-step flow + follow-ups, reminders, ad-hoc records, reports | Full simulated day in Playwright mobile viewport incl. fail→corrective→verification; all records PIN-attributed |
| **3 — Offline engine** | Serwist SW, Dexie stores, outbox with idempotent upserts, photo queue, conflict/audit flags, offline e2e | Airplane-mode day works; queue drains; late-sync flags visible |
| **4 — M1 AI wizard, import, approval** | AI provider layer, wizard chat + chips, equipment photo onboarding, draft generation + guardrails, review editor, approval + PDF snapshot, import pipeline (§7.5), official-format renderers (§7.6) + golden-file tests | Scripted pizzeria interview → complete draft; loosening a limit w/o justification impossible; official-layout PDF da+en; fixture imports map correctly, gaps detected, nothing hallucinated |
| **5 — M3 traceability & inventory** | Invoice pipeline + review UI, suppliers/products/batches, receiving check, quick receive, prep batches, leftover deck, stock, trace search + recall PDF, B2B outbound | 5 fixture invoices (incl. handwritten, credit note, duplicate) process correctly; trace <2 s; 25-item leftover session ≤2 min |
| **6 — M4 inspection mode** | Inspection UI, guest lock + magic links, PDF exports + full bundle, hash-chain footer | Inspector link read-only truth; exports match on-screen; audit rows written |
| **7 — M5 multi-site + M7 regulatory** | Org dashboard + score, templates/push-proposals, digests, pack-update pipeline + diff UI, compliance assistant (RAG + citations), smiley tracking, training log | Pack change fans out review tasks with correct diffs; assistant refuses out-of-scope, always cites |
| **8 — M6 billing & admin** | Stripe plans/webhooks/trials/metering, feature gating, admin panel (impersonation logged, pack studio, AI console), demo-site spawner | Trial→paid green in Stripe test mode; impersonation logged & bannered; AI metering decrements |
| **9 — Hardening & launch** | Load test, retention cron, backup restore drill, Sentry, a11y, da review, security sign-off (§17), production DK pack, compliance dossier generator (§3.4) | Checklist sign-off; dossier PDF renders |

## Non-negotiables — every `[DECISION]` rule

Never violate these. If one seems wrong/impossible/outdated: **stop, explain, propose alternatives with tradeoffs.**

1. **Target market (§2):** retail-stage food businesses (detailhandel) under EU Reg. 852/2004 registered with Fødevarestyrelsen; activity types per the §2 table.
2. **Compliance as data (§3.2):** ALL regulatory content lives in versioned compliance packs (`compliance_packs`/`pack_versions`, JSON in DB). No pack content is ever hard-coded in application code. New country = new pack, no code changes.
3. **Corpus grounding (§3.3):** the DK pack is authored against, and the AI assistant grounded EXCLUSIVELY in, the official corpus documents. (a) Every control point template, limit and guidance text carries a `sourceRef` (docId, section, page); (b) the compliance assistant answers only from corpus + the site's own programme, always citing `docId §section`; (c) pack publish requires a corpus-currency checklist. Never fill regulatory gaps from general knowledge — mark `TODO(pack-review)` and ask.
4. **Canonical skema (§3.3.1):** the risk-analysis data model mirrors the official Fødevarestyrelsen risikoanalyse-skema 1:1 (6 sections, 2 checkboxes, 4 text columns); richer HACCP detail hangs off each row.
5. **Authority-readiness strategy (§3.4):** compliance-by-design dossier, official-format fidelity, documented integrity guarantees, pilot evidence, engagement path, "helps fulfil" disclaimers (legal responsibility stays with the operator).
6. **Roles (§4.2):** exactly the defined role set (`platform_admin`, `platform_support`, `org_owner`, `org_admin`, `site_manager`, `operator`, `consultant`, `inspector_guest`) with the stated capabilities; impersonation always logged + bannered.
7. **Stack (§5):** Next.js 15+ App Router + Supabase EU as described above; RLS is the security boundary; service-role never in user request paths (platform-admin endpoints double-check role + write `admin_audit_log`); every mutation emits an `audit_log` row.
8. **AI guardrails (§7.3):** AI may only *tighten* pack default limits, never loosen. Loosening = manual edit + written justification + `site_manager` role. Every AI output flagged `ai_suggested` until human-viewed; completeness validator on drafts; Zod-parse fail → retry ≤2 → template-only fallback.
9. **Import fidelity (§7.5):** extraction never invents content — empty stays empty; gaps are asked, not hallucinated; every imported cell keeps provenance (import id, page, region); originals stored permanently.
10. **Official-format rendering (§7.6):** PDF exports reproduce the official layouts (`DK-RA-SKEMA`, `DK-RA-SKEMA-EN`, `DK-EK-EXAMPLE`) pixel-faithfully (fonts/branding aside); golden-file tests per release.
11. **Photo evidence (§8.2):** photos are saved as evidence even in manual mode if taken; in photo mode `photo_ai_reading` stores AI value+confidence but the **user-confirmed value** is authoritative.
12. **Record integrity (§17):** compliance records (`task_completions`, `deviations`, `goods_receipts`, `inventory_moves`, `invoices`) are **append-only** — no UPDATE/DELETE grants; corrections append superseding rows (`corrects_id`); server-side timestamps, person-attributed; late entries flagged, **never back-dated**; `audit_log` hash-chained per site (`prev_hash`); no feature, migration, or admin tool may back-date, overwrite, or delete a compliance record.
13. **GDPR deletion vs retention (§17):** org deletion = soft-delete 30 days → purge, **except** records under legal retention, which are anonymized to role level.
14. **Product stance (§22):** never build features that back-date or fabricate records; never sell customer data.

### Operating rules (from kickoff, always apply)

- Regulatory content (limits, temps, frequencies, skema structure, guidance) comes **only** from BLUEPRINT §3 + `corpus/DK/`, each pack item with `sourceRef`.
- Operator UX rules (§15) are acceptance criteria: ≥56px touch targets, base font 18px, 3-tap rule, zero required typing on operator paths, optimistic UI, PIN identity switcher.
- AI features (§14): Zod-validated outputs, versioned prompts, manual fallback path for everything, human confirmation gates; every run logged to `ai_runs`. No AI feature may be a hard dependency for completing a compliance action.
- i18n from the first component; no hard-coded user-facing strings.
- Secrets: ask the user and wait; never fake, hard-code, or commit. All vars documented in `.env.example` (§17): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `VAPID_*`.
- `[DEFAULT]` items may change with good reason — record every change in the decision log below.

## Notable `[DEFAULT]`s (adjustable, log changes)

pnpm · 30-day trial · traceability retention 5 y (6 mo highly-perishable) · self-control docs 12 mo online / 5 y archive · revision trigger ≥3 deviations/30 days · product-match thresholds 0.90 auto / 0.60 suggest · prepped-food internal expiry 3 days · push reminders: due time, +30 min, 20:00 manager summary · plan prices §12.1 · compliance-score weights §11 · AI models per feature §14 · invoice auto-confirm off · visual identity §15.3 · 2FA prompt for org admins.

## Decision log

| Date | Item | Change | Justification |
|---|---|---|---|
| 2026-07-15 | §6.1 memberships.pin_hash | Moved to `membership_pins` side table (RLS deny-all, RPC-only access) | PIN hashes must never be readable via PostgREST; §17 hashing + rate-limit state lives with the hash |
| 2026-07-15 | §6.1 memberships | Added `invited_email`, `invite_token_hash`, `invite_expires_at` | Implements the §20 invite flow; `expires_at` keeps its §6.1 meaning (access expiry for consultants/guests) |
| 2026-07-15 | §5 dependency set | Service SDKs (Stripe, Resend) + phase-specific libs (dexie, serwist, @react-pdf/renderer, recharts) installed in their phases, not upfront | Keeps the tree clean; no behavioural change to §5 choices |
| 2026-07-15 | Next.js middleware | `src/proxy.ts` (Next 16 convention) instead of deprecated `middleware.ts` | Next 16.2 scaffold; same session-refresh + route-gating logic |
| 2026-07-15 | DB grants | Explicit per-table verb grants; TRUNCATE revoked for all API roles; audit_log UPDATE/DELETE revoked even for service_role | Local stack grants no DML by default but included TRUNCATE — a §17 append-only hole |
| 2026-07-16 | §6.3 deviations | Guarded UPDATE (immutable detection facts, write-once lifecycle fields, forward-only status, server-set timestamps) instead of pure append-only | §8.3's 3-step flow fills corrective/verification fields later by design; §17's no-overwrite/no-back-date intent enforced by trigger |
| 2026-07-16 | §6.3 tasks | Added `verifies_deviation_id` | Links §8.3 follow-up verification tasks; completion writes the deviation's verification fields |
| 2026-07-16 | §8.4 nightly cron | `/api/cron/run` route (CRON_SECRET, Vercel Cron) + `src/lib/cron/run.ts` instead of a Supabase Edge Function | Single TS materializer implementation, testable in vitest; edge-fn wrapper can be added later without logic changes |
| 2026-07-16 | §8.4 push reminders | Phase 2 ships in_app + email channels; web push lands with the Serwist SW in Phase 3 | Push requires a service worker, which is Phase 3 scope |
| 2026-07-16 | §16 service worker | Serwist SW bundled via `scripts/build-sw.mjs` (esbuild) + manual `navigator.serviceWorker.register('/sw.js')`, not `@serwist/next`'s webpack injection | `@serwist/next` doesn't support Next 16 Turbopack builds yet; explicit precache + `defaultCache` runtime caching keeps behaviour identical |
| 2026-07-16 | §16 outbox idempotency | Single completion recorder (`record-completion.ts`) keyed by `client_uuid`; online action and offline flush share it; composite entry carries the 3-step corrective flow | One code path for pass/fail/deviation whether online or replayed; `client_created_at` clamped to server-now so a fast device clock can't fake on-time/earlier records |
| 2026-07-16 | §8.4 materializer window | `[now−24h, now+7d)` keeping past occurrences only while their completion window is still open (was `[now, …)`) | Evening approval must surface tonight's still-completable tasks (e.g. 21:00 cleaning, 180-min window); no back-dating — §17 lateness flags apply on completion as usual |
| 2026-07-16 | §7.5 docx/xlsx extraction | `mammoth` (DOCX raw text) + `exceljs` (XLSX cells) feed the AI extraction prompt; photos/PDF go to Claude vision natively | Deterministic server-side text extraction; libs not mandated by BLUEPRINT |
| 2026-07-18 | §10 /inspect data access | Magic-link pages resolve the token via SECURITY DEFINER RPC, then read through a service client **always scoped to the resolved site_id**, with every page access audited | The inspector is unauthenticated by design — the 4h token IS the credential; mirrors the §7 platform-admin exception (independent check + audit), no RLS bypass beyond the token's site |
