-- Phase 4: AI subsystem tables — ai_runs (§6.5, every AI run logged) and
-- ra_imports (§6.2, import pipeline with permanent originals + provenance).

create table public.ai_runs (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  site_id uuid references public.sites (id),
  feature text not null,              -- risk_wizard | wizard_draft | ra_import_extract | invoice_extract | product_enrich | photo_read | assistant | deviation_polish
  model text not null,
  prompt_version text not null,       -- §14: prompts versioned in repo
  input_ref text,                     -- storage path / entity id, never raw content
  output_ref text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  confidence numeric,
  accepted boolean,                   -- quality tracking: human accepted the output
  edited boolean,                     -- …or edited it before accepting
  error text,                         -- zod/parse failures for the quality console
  created_at timestamptz not null default now()
);
create index ai_runs_org_idx on public.ai_runs (org_id, created_at desc);
create index ai_runs_feature_idx on public.ai_runs (feature, created_at desc);

create type public.ra_import_kind as enum ('photo_set', 'pdf', 'docx', 'xlsx', 'paper_scan');
create type public.ra_import_status as enum
  ('uploaded', 'extracting', 'mapped', 'needs_review', 'confirmed', 'failed');

create table public.ra_imports (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  risk_analysis_id uuid references public.risk_analyses (id),
  kind public.ra_import_kind not null,
  file_paths text[] not null,          -- originals, kept forever (§7.5: source evidence)
  status public.ra_import_status not null default 'uploaded',
  extraction_json jsonb,               -- raw AI output + per-cell confidence/provenance
  gap_report_json jsonb,               -- §7.5 gap analysis vs the official skema
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ra_imports_site_idx on public.ra_imports (site_id, created_at desc);
create trigger set_updated_at before update on public.ra_imports
  for each row execute function public.set_updated_at();

-- Originals are permanent: no DELETE anywhere; file_paths append-only by convention.
alter table public.ai_runs enable row level security;
alter table public.ra_imports enable row level security;

create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (private.is_org_admin(org_id) or private.is_platform_staff());
create policy ai_runs_insert on public.ai_runs
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));

create policy ra_imports_select on public.ra_imports
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy ra_imports_insert on public.ra_imports
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy ra_imports_update on public.ra_imports
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

grant select, insert on public.ai_runs to authenticated;              -- append-only
grant select, insert, update on public.ra_imports to authenticated;   -- no delete (originals forever)
grant select, insert on public.ai_runs to service_role;
grant select, insert, update on public.ra_imports to service_role;
revoke update, delete on public.ai_runs from anon, authenticated, service_role;
revoke delete on public.ra_imports from anon, authenticated, service_role;

-- imports bucket: original documents (PDF/DOCX/XLSX/photos), site-scoped paths
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy imports_select on storage.objects
  for select to authenticated
  using (bucket_id = 'imports' and private.can_access_site(private.site_id_from_path(name)));
create policy imports_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imports' and private.can_access_site(private.site_id_from_path(name)));
-- no update/delete policies: originals are immutable evidence (§7.5)
