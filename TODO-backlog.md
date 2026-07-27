# TODO backlog

Things found during the Phase 0 audit (2026-07-27) and deliberately **not** fixed, so they do not
get lost. Nothing here is in scope until it is promoted into a workstream.

## Found during the audit, out of scope for the rework

| # | Item | Where | Why deferred |
|---|---|---|---|
| 1 | The inspector-view audit row is attributed to the newest live link, not the token in use | `src/app/(public)/inspect/[token]/page.tsx:66` | Scheduled as P0-2 step 7 |
| 2 | `resolve_inspector_link` sets `used_at` on every resolve, so "first opened" cannot be distinguished from "last opened" | `supabase/migrations/20260718100000_m4_inspection.sql:78` | Needs a decision: keep `used_at` as last-seen and add `first_used_at`, or log views only in `audit_log` |
| 3 | `sites.status` is a text column with a CHECK on `organizations` but an enum on `sites` — two different mechanisms for the same idea | `20260715100100_identity_tenancy.sql:32,57` | Cosmetic; a migration to unify them is not worth the risk right now |
| 4 | No row-level marker for demo/seed data | schema-wide | Currently handled by `SEED_DEMO=0` at seed time; only matters once we spawn demo sites from the admin panel (Phase 8) |
| 5 | `docs/reference/` holds copies of three corpus PDFs; the corpus also lives in `corpus/DK/` and `supabase/seed/corpus/DK/` — three copies of the same files | repo layout | Consolidate when the labelling guidance arrives and the reference set is final |
| 6 | Danish/English UI copy still says "batch"/"parti" in places, which §1.4 of the brief forbids | `src/messages/*.json` | Copy audit, cheap, but should be done in one pass with the traceability workstream |
| 7 | Cooling records have no running timer or pre-expiry warning for the 4-hour window | `src/app/(operator)/app/[site]/check/` | Part of P1-1 (temperature truth) |
| 8 | The service worker precache list is built at build time by `scripts/build-sw.mjs`; new routes are not added automatically | `scripts/build-sw.mjs` | Works today; revisit if offline coverage gaps appear |

## Known product gaps already tracked in the plan (not backlog)

See `docs/audit.md` §4 for the full gap analysis and §6 for the ordered plan. The largest are:
customer orders and the production↔order relation, the operating calendar, product-vs-ambient
temperature readings, and the inspection-readiness view.
