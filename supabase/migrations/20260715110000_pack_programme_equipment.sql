-- Phase 1: compliance packs (§3.2/§6.2), programme core (§6.2), equipment &
-- tasks (§6.3 subset). Compliance content is DATA in pack_versions.content —
-- never hard-coded in app code [DECISION §3.2].

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.ra_status as enum ('draft', 'in_review', 'approved', 'superseded');
create type public.hazard_category as enum ('micro', 'chemical', 'physical', 'allergen');
create type public.cp_category as enum ('temperature', 'cleaning', 'receiving', 'pest', 'hygiene', 'other');
create type public.cp_target_kind as enum ('equipment', 'area', 'process', 'supplier');
create type public.equipment_kind as enum
  ('fridge', 'freezer', 'hot_holding', 'dishwasher', 'probe', 'oven', 'blast_chiller', 'other');
create type public.task_status as enum ('pending', 'done', 'missed', 'skipped_justified');

-- ── Compliance packs (§6.2) ──────────────────────────────────────────────────
create table public.compliance_packs (
  code text primary key,                 -- 'DK'
  name text not null,
  authority_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.compliance_packs
  for each row execute function public.set_updated_at();

create table public.pack_versions (
  id uuid primary key default public.uuid_v7(),
  pack_code text not null references public.compliance_packs (code),
  version text not null,                 -- '2026.07'
  content jsonb not null,                -- full pack JSON (§3.2 shape)
  changelog text,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (pack_code, version)
);
create index pack_versions_pack_code_idx on public.pack_versions (pack_code, published_at desc);

-- ── Risk analyses & official-skema rows (§6.2, §3.3.1) ───────────────────────
create table public.risk_analyses (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  version int not null default 1,
  status public.ra_status not null default 'draft',
  wizard_transcript jsonb,               -- audit of how the programme was built (§7.2)
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  supersedes_id uuid references public.risk_analyses (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, version)
);
create index risk_analyses_site_idx on public.risk_analyses (site_id, version desc);
create trigger set_updated_at before update on public.risk_analyses
  for each row execute function public.set_updated_at();

-- Approved analyses are frozen: only the approved→superseded transition (with
-- unchanged content fields) may touch the row afterwards (§7.4: old versions
-- kept forever).
create or replace function private.risk_analyses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    if new.status <> 'superseded'
       or new.wizard_transcript is distinct from old.wizard_transcript
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.site_id is distinct from old.site_id
       or new.version is distinct from old.version then
      raise exception 'approved risk analyses are immutable (only supersession allowed)';
    end if;
  elsif old.status = 'superseded' then
    raise exception 'superseded risk analyses are immutable';
  end if;
  return new;
end;
$$;
create trigger risk_analyses_guard before update on public.risk_analyses
  for each row execute function private.risk_analyses_guard();

create table public.process_steps (
  id uuid primary key default public.uuid_v7(),
  risk_analysis_id uuid not null references public.risk_analyses (id) on delete cascade,
  position int not null,
  key text not null,                     -- official §3.3.1 keys (modtagelse…andet) or custom
  name_i18n jsonb not null,
  description_i18n jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index process_steps_ra_idx on public.process_steps (risk_analysis_id, position);
create trigger set_updated_at before update on public.process_steps
  for each row execute function public.set_updated_at();

create table public.ra_activity_rows (
  id uuid primary key default public.uuid_v7(),
  risk_analysis_id uuid not null references public.risk_analyses (id) on delete cascade,
  process_step_id uuid not null references public.process_steps (id) on delete cascade,
  position int not null,
  activity_key text not null,            -- official row key (e.g. modtagelse.chilled) or 'custom'
  applies boolean not null default false,          -- official checkbox 1 (§3.3.1)
  is_critical boolean not null default false,      -- official checkbox 2 (§3.3.1)
  what_you_do_i18n jsonb,
  what_can_go_wrong_i18n jsonb,
  control_measures_i18n jsonb,
  if_it_goes_wrong_i18n jsonb,
  ai_suggested boolean not null default false,
  human_edited boolean not null default false,
  source_import_id uuid,                 -- FK to ra_imports lands in Phase 4
  source_page int,
  source_region jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ra_activity_rows_ra_idx on public.ra_activity_rows (risk_analysis_id, position);
create trigger set_updated_at before update on public.ra_activity_rows
  for each row execute function public.set_updated_at();

create table public.hazards (
  id uuid primary key default public.uuid_v7(),
  process_step_id uuid not null references public.process_steps (id) on delete cascade,
  ra_row_id uuid references public.ra_activity_rows (id) on delete cascade,
  category public.hazard_category not null,
  description_i18n jsonb not null,
  likelihood int check (likelihood between 1 and 3),
  severity int check (severity between 1 and 3),
  is_ccp boolean not null default false,
  is_oprp boolean not null default false,
  control_measure_i18n jsonb,
  justification_i18n jsonb,
  ai_suggested boolean not null default false,
  human_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hazards_step_idx on public.hazards (process_step_id);
create trigger set_updated_at before update on public.hazards
  for each row execute function public.set_updated_at();

-- ── Equipment (§6.3) ─────────────────────────────────────────────────────────
create table public.equipment (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  kind public.equipment_kind not null,
  name text not null check (char_length(name) between 1 and 120),
  brand_model text,
  photo_path text,                       -- reference photo (§7.2/§8.2)
  location_note text,
  target_limit_json jsonb,               -- overrides CP default if set
  qr_code_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  nfc_tag_id text,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index equipment_site_idx on public.equipment (site_id) where active;
create trigger set_updated_at before update on public.equipment
  for each row execute function public.set_updated_at();

-- ── Control points (§6.2) ────────────────────────────────────────────────────
create table public.control_points (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  risk_analysis_id uuid not null references public.risk_analyses (id),
  hazard_id uuid references public.hazards (id),
  template_key text,                     -- pack template key; null = custom
  name_i18n jsonb not null,
  category public.cp_category not null,
  target_kind public.cp_target_kind not null,
  equipment_id uuid references public.equipment (id),
  area_i18n jsonb,
  limit_json jsonb,                      -- {"max":5} | {"min":75} | {"cool_from":56,...}
  -- §7.3 [DECISION]: pack limits may only be loosened with a written
  -- justification by site_manager+; the app computes limit_loosened.
  limit_loosened boolean not null default false,
  limit_justification text,
  frequency_json jsonb not null,         -- {"rrule":"FREQ=DAILY","times":["07:30"]}
  monitoring_method text not null
    check (monitoring_method in ('manual_temp', 'photo_temp', 'photo_only', 'checklist', 'probe')),
  responsible_role text,
  instructions_i18n jsonb,
  corrective_guidance_i18n jsonb,
  source_ref jsonb,                      -- {docId, section, page} carried from the pack (§3.3)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loosening_requires_justification
    check (not limit_loosened or limit_justification is not null)
);
create index control_points_site_idx on public.control_points (site_id) where active;
create index control_points_ra_idx on public.control_points (risk_analysis_id);
create trigger set_updated_at before update on public.control_points
  for each row execute function public.set_updated_at();

-- ── Programme documents (§6.2; PDF snapshots land in Phase 4) ────────────────
create table public.programme_documents (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  risk_analysis_id uuid not null references public.risk_analyses (id),
  kind text not null check (kind in ('egenkontrolprogram', 'annex')),
  pdf_path text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index programme_documents_site_idx on public.programme_documents (site_id);

-- ── Tasks (§6.3) ─────────────────────────────────────────────────────────────
create table public.tasks (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  control_point_id uuid not null references public.control_points (id),
  due_at timestamptz not null,
  due_window_minutes int not null default 120,
  status public.task_status not null default 'pending',
  assigned_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- idempotent materialization: one task per CP per due time
  unique (control_point_id, due_at)
);
create index tasks_site_due_idx on public.tasks (site_id, due_at);          -- §19 index rule
create index tasks_site_status_idx on public.tasks (site_id, status, due_at);
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
