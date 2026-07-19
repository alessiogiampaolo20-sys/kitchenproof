-- Phase 7 (M5 multi-site + M7 regulatory): §6.5 review pipeline tables,
-- smiley tracking, training log, org programme templates + push proposals.

-- ── regulatory_updates (§6.5): one row per published pack transition ─────────
create table public.regulatory_updates (
  id uuid primary key default public.uuid_v7(),
  pack_code text not null references public.compliance_packs (code),
  from_version text not null,
  to_version text not null,
  summary_i18n jsonb not null,
  created_at timestamptz not null default now(),
  unique (pack_code, from_version, to_version)
);

-- ── site_review_tasks (§6.5): "rules changed — review your programme" ────────
create type public.review_trigger as enum
  ('pack_update', 'repeated_deviation', 'activity_change', 'annual');
create type public.review_status as enum ('open', 'resolved', 'dismissed');

create table public.site_review_tasks (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  trigger public.review_trigger not null,
  regulatory_update_id uuid references public.regulatory_updates (id),
  diff_json jsonb,                     -- per-CP diffs computed at fan-out (§13)
  status public.review_status not null default 'open',
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, regulatory_update_id)     -- fan-out is idempotent
);
create index site_review_tasks_site_idx on public.site_review_tasks (site_id, status);
create trigger set_updated_at before update on public.site_review_tasks
  for each row execute function public.set_updated_at();

-- ── smiley_inspections (§13: manual entry v1) ────────────────────────────────
create table public.smiley_inspections (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  inspected_on date not null,
  result int not null check (result between 1 and 4),  -- 1 = best (glad smiley)
  note text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index smiley_inspections_site_idx on public.smiley_inspections (site_id, inspected_on desc);

-- ── training_records (§13: hygiene training log) ─────────────────────────────
create table public.training_records (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  person_name text not null,
  course text not null,
  trained_on date not null,
  certificate_path text,               -- photo in the documents bucket
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index training_records_site_idx on public.training_records (site_id, trained_on desc);

-- ── org programme templates + push proposals (§11) ───────────────────────────
create table public.org_programme_templates (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  source_site_id uuid references public.sites (id),
  content jsonb not null,              -- skema rows + CP configs snapshot
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index org_programme_templates_org_idx on public.org_programme_templates (org_id);
create trigger set_updated_at before update on public.org_programme_templates
  for each row execute function public.set_updated_at();

create type public.proposal_status as enum ('pending', 'applied', 'rejected');

-- central edits arrive as PROPOSALS — local approval keeps each site's
-- programme matching that site (R9: nothing silently changes)
create table public.programme_change_proposals (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  template_id uuid not null references public.org_programme_templates (id),
  diff_json jsonb not null,
  status public.proposal_status not null default 'pending',
  proposed_by uuid not null references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  justification text,                  -- required when rejecting
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programme_change_proposals_site_idx
  on public.programme_change_proposals (site_id, status);
create trigger set_updated_at before update on public.programme_change_proposals
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.regulatory_updates enable row level security;
alter table public.site_review_tasks enable row level security;
alter table public.smiley_inspections enable row level security;
alter table public.training_records enable row level security;
alter table public.org_programme_templates enable row level security;
alter table public.programme_change_proposals enable row level security;

-- regulatory updates are platform-published shared content (like pack_versions)
create policy regulatory_updates_select on public.regulatory_updates
  for select to authenticated using (true);

create policy site_review_tasks_select on public.site_review_tasks
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy site_review_tasks_insert on public.site_review_tasks
  for insert to authenticated
  with check (private.can_access_site(site_id));
create policy site_review_tasks_update on public.site_review_tasks
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

create policy smiley_select on public.smiley_inspections
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy smiley_insert on public.smiley_inspections
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

create policy training_select on public.training_records
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy training_insert on public.training_records
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

create policy templates_select on public.org_programme_templates
  for select to authenticated
  using (org_id in (select private.user_org_ids()) or private.is_platform_staff());
create policy templates_write on public.org_programme_templates
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()) and private.is_org_admin(org_id));
create policy templates_update on public.org_programme_templates
  for update to authenticated
  using (private.is_org_admin(org_id))
  with check (private.is_org_admin(org_id));

create policy proposals_select on public.programme_change_proposals
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy proposals_insert on public.programme_change_proposals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sites s
      where s.id = site_id and private.is_org_admin(s.org_id)
    )
  );
create policy proposals_update on public.programme_change_proposals
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

-- ── grants ───────────────────────────────────────────────────────────────────
grant select on public.regulatory_updates to authenticated;
grant select, insert on public.regulatory_updates to service_role;  -- published by platform
grant select, insert, update on public.site_review_tasks to authenticated, service_role;
grant select, insert on public.smiley_inspections to authenticated, service_role;   -- outcomes are history
grant select, insert on public.training_records to authenticated, service_role;     -- log entries stay
grant select, insert, update on public.org_programme_templates to authenticated, service_role;
grant select, insert, update on public.programme_change_proposals to authenticated, service_role;

revoke delete on public.regulatory_updates, public.site_review_tasks,
  public.smiley_inspections, public.training_records,
  public.org_programme_templates, public.programme_change_proposals
  from anon, authenticated, service_role;
revoke update on public.regulatory_updates, public.smiley_inspections,
  public.training_records from anon, authenticated, service_role;
