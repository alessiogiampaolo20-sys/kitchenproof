-- Phase 2 (M2): evidence-grade daily records (§6.3, §8, §17).
--  * task_completions: APPEND-ONLY — no UPDATE/DELETE for anyone; corrections
--    append superseding rows via corrects_id. Server-side timestamps.
--  * deviations: guarded lifecycle — detected facts are immutable, corrective/
--    verification fields are write-once, status only moves forward. No DELETE.
--  * tasks get verifies_deviation_id (follow-up verification tasks, §8.3).
-- Schema notes vs the §6 sketch are in CLAUDE.md's decision log.

create type public.deviation_severity as enum ('minor', 'major', 'critical');
create type public.deviation_status as enum ('open', 'corrected', 'verified', 'closed');
create type public.food_assessment as enum ('kept', 'moved', 'discarded', 'recalled', 'na');
create type public.deviation_source as enum ('task', 'receiving', 'adhoc', 'ai_flag');

-- ── deviations (§6.3) ────────────────────────────────────────────────────────
create table public.deviations (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  control_point_id uuid references public.control_points (id),
  source public.deviation_source not null,
  detected_at timestamptz not null default now(),
  detected_by uuid not null references public.profiles (id),
  description text not null,
  severity public.deviation_severity not null,
  food_assessment public.food_assessment,
  corrective_action_text text,
  corrective_action_by uuid references public.profiles (id),
  corrective_action_at timestamptz,
  verification_text text,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  status public.deviation_status not null default 'open',
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deviations_site_status_idx on public.deviations (site_id, status, detected_at desc);
create trigger set_updated_at before update on public.deviations
  for each row execute function public.set_updated_at();

-- §17 guard: detected facts immutable; lifecycle fields write-once with
-- server-authoritative timestamps; status forward-only; photos append-only.
create or replace function private.deviations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status_rank_old int;
  status_rank_new int;
begin
  if new.site_id is distinct from old.site_id
     or new.control_point_id is distinct from old.control_point_id
     or new.source is distinct from old.source
     or new.detected_at is distinct from old.detected_at
     or new.detected_by is distinct from old.detected_by
     or new.description is distinct from old.description
     or new.created_at is distinct from old.created_at then
    raise exception 'deviation detection facts are immutable (§17)';
  end if;

  status_rank_old := case old.status when 'open' then 0 when 'corrected' then 1 when 'verified' then 2 else 3 end;
  status_rank_new := case new.status when 'open' then 0 when 'corrected' then 1 when 'verified' then 2 else 3 end;
  if status_rank_new < status_rank_old then
    raise exception 'deviation status can only move forward (§17)';
  end if;

  -- write-once lifecycle fields
  if old.food_assessment is not null and new.food_assessment is distinct from old.food_assessment then
    raise exception 'food_assessment is write-once';
  end if;
  if old.corrective_action_text is not null
     and (new.corrective_action_text is distinct from old.corrective_action_text
          or new.corrective_action_by is distinct from old.corrective_action_by
          or new.corrective_action_at is distinct from old.corrective_action_at) then
    raise exception 'corrective action is write-once';
  end if;
  if old.verification_text is not null
     and (new.verification_text is distinct from old.verification_text
          or new.verified_by is distinct from old.verified_by
          or new.verified_at is distinct from old.verified_at) then
    raise exception 'verification is write-once';
  end if;

  -- server-authoritative lifecycle timestamps (never back-dated)
  if new.corrective_action_text is not null and old.corrective_action_text is null then
    new.corrective_action_at := now();
  end if;
  if new.verification_text is not null and old.verification_text is null then
    new.verified_at := now();
  end if;

  -- photos are append-only
  if array_length(old.photo_paths, 1) is not null
     and not (old.photo_paths <@ new.photo_paths) then
    raise exception 'deviation photos are append-only';
  end if;

  return new;
end;
$$;
create trigger deviations_guard before update on public.deviations
  for each row execute function private.deviations_guard();

-- ── task_completions (§6.3) — append-only evidence ───────────────────────────
create table public.task_completions (
  id uuid primary key default public.uuid_v7(),
  task_id uuid references public.tasks (id),      -- null for ad-hoc records (§8.5)
  site_id uuid not null references public.sites (id),
  control_point_id uuid references public.control_points (id),
  equipment_id uuid references public.equipment (id),
  performed_by uuid not null references public.profiles (id),  -- PIN-attributed person (§4.2)
  value_json jsonb not null,     -- {"temp_c":3.4} | {"checklist":[…]} | {"cool_log":[…]} | {"note":…}
  passed boolean,
  is_late boolean not null default false,          -- completed after the due window; never back-dated
  photo_paths text[] not null default '{}',
  photo_ai_reading jsonb,
  note text,
  client_created_at timestamptz,                   -- device clock (offline provenance, §16)
  client_uuid uuid not null default gen_random_uuid(),
  server_received_at timestamptz not null default now(),
  deviation_id uuid references public.deviations (id),
  corrects_id uuid references public.task_completions (id),
  created_at timestamptz not null default now(),
  unique (client_uuid)                             -- offline idempotency (Phase 3)
);
create index task_completions_site_idx on public.task_completions (site_id, created_at desc);
create index task_completions_task_idx on public.task_completions (task_id);
create index task_completions_equipment_idx on public.task_completions (equipment_id, created_at desc);

-- server-authoritative timestamps even if a client tries to supply them
create or replace function private.task_completions_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_received_at := now();
  new.created_at := now();
  return new;
end;
$$;
create trigger task_completions_stamp before insert on public.task_completions
  for each row execute function private.task_completions_stamp();

-- ── tasks: follow-up verification link (§8.3) ────────────────────────────────
alter table public.tasks
  add column verifies_deviation_id uuid references public.deviations (id);
create index tasks_verifies_idx on public.tasks (verifies_deviation_id)
  where verifies_deviation_id is not null;

-- ── cleaning_areas (§6.3) ────────────────────────────────────────────────────
create table public.cleaning_areas (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  name_i18n jsonb not null,
  frequency_json jsonb,
  instructions_i18n jsonb,
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cleaning_areas_site_idx on public.cleaning_areas (site_id) where active;
create trigger set_updated_at before update on public.cleaning_areas
  for each row execute function public.set_updated_at();

-- ── notifications (§6.5) ─────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default public.uuid_v7(),
  user_id uuid references public.profiles (id),
  site_id uuid references public.sites (id),
  kind text not null,             -- task_due | task_overdue | daily_summary | deviation_major
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  channels text[] not null default '{in_app}',   -- in_app | email | push
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_site_idx on public.notifications (site_id, created_at desc);
-- dedupe key for reminder fan-out (one reminder per task per kind)
create unique index notifications_dedupe_idx
  on public.notifications (kind, user_id, ((payload ->> 'task_id')))
  where payload ? 'task_id';
