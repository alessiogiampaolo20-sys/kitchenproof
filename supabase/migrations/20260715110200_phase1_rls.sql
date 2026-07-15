-- Phase 1 RLS + grants. Same fail-closed doctrine as Phase 0: RLS on every
-- table, explicit verb grants, no TRUNCATE (default-privilege revoke from
-- migration 20260715100400 covers new tables).

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function private.can_access_ra(p_ra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.risk_analyses ra
    where ra.id = p_ra_id
      and private.can_access_site(ra.site_id)
  );
$$;

create or replace function private.ra_site_manager(p_ra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.risk_analyses ra
    where ra.id = p_ra_id
      and private.is_site_manager(ra.site_id)
  );
$$;

-- Draft/in_review analyses are editable; approved/superseded are frozen.
create or replace function private.ra_editable(p_ra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.risk_analyses ra
    where ra.id = p_ra_id
      and ra.status in ('draft', 'in_review')
  );
$$;

-- ── Enable RLS ───────────────────────────────────────────────────────────────
alter table public.compliance_packs enable row level security;
alter table public.pack_versions enable row level security;
alter table public.risk_analyses enable row level security;
alter table public.process_steps enable row level security;
alter table public.ra_activity_rows enable row level security;
alter table public.hazards enable row level security;
alter table public.equipment enable row level security;
alter table public.control_points enable row level security;
alter table public.programme_documents enable row level security;
alter table public.tasks enable row level security;
alter table public.corpus_documents enable row level security;
alter table public.corpus_chunks enable row level security;

-- ── Packs & corpus: readable by every authenticated user; writes platform-only ─
create policy compliance_packs_select on public.compliance_packs
  for select to authenticated using (true);
create policy compliance_packs_write on public.compliance_packs
  for insert to authenticated with check (private.is_platform_admin());
create policy compliance_packs_update on public.compliance_packs
  for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

create policy pack_versions_select on public.pack_versions
  for select to authenticated using (true);
create policy pack_versions_insert on public.pack_versions
  for insert to authenticated with check (private.is_platform_admin());
-- published pack versions are immutable: no update/delete policies or grants

create policy corpus_documents_select on public.corpus_documents
  for select to authenticated using (true);
create policy corpus_documents_write on public.corpus_documents
  for insert to authenticated with check (private.is_platform_admin());

create policy corpus_chunks_select on public.corpus_chunks
  for select to authenticated using (true);
create policy corpus_chunks_write on public.corpus_chunks
  for insert to authenticated with check (private.is_platform_admin());

-- ── Programme tables: site-scoped reads, manager writes ─────────────────────
create policy risk_analyses_select on public.risk_analyses
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy risk_analyses_insert on public.risk_analyses
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy risk_analyses_update on public.risk_analyses
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

create policy process_steps_select on public.process_steps
  for select to authenticated using (private.can_access_ra(risk_analysis_id));
create policy process_steps_write on public.process_steps
  for insert to authenticated
  with check (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id));
create policy process_steps_update on public.process_steps
  for update to authenticated
  using (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id))
  with check (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id));
create policy process_steps_delete on public.process_steps
  for delete to authenticated
  using (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id));

create policy ra_activity_rows_select on public.ra_activity_rows
  for select to authenticated using (private.can_access_ra(risk_analysis_id));
create policy ra_activity_rows_insert on public.ra_activity_rows
  for insert to authenticated
  with check (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id));
create policy ra_activity_rows_update on public.ra_activity_rows
  for update to authenticated
  using (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id))
  with check (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id));
create policy ra_activity_rows_delete on public.ra_activity_rows
  for delete to authenticated
  using (private.ra_site_manager(risk_analysis_id) and private.ra_editable(risk_analysis_id));

create policy hazards_select on public.hazards
  for select to authenticated
  using (exists (
    select 1 from public.process_steps ps
    where ps.id = hazards.process_step_id and private.can_access_ra(ps.risk_analysis_id)
  ));
create policy hazards_insert on public.hazards
  for insert to authenticated
  with check (exists (
    select 1 from public.process_steps ps
    where ps.id = hazards.process_step_id
      and private.ra_site_manager(ps.risk_analysis_id)
      and private.ra_editable(ps.risk_analysis_id)
  ));
create policy hazards_update on public.hazards
  for update to authenticated
  using (exists (
    select 1 from public.process_steps ps
    where ps.id = hazards.process_step_id
      and private.ra_site_manager(ps.risk_analysis_id)
      and private.ra_editable(ps.risk_analysis_id)
  ))
  with check (exists (
    select 1 from public.process_steps ps
    where ps.id = hazards.process_step_id
      and private.ra_site_manager(ps.risk_analysis_id)
      and private.ra_editable(ps.risk_analysis_id)
  ));
create policy hazards_delete on public.hazards
  for delete to authenticated
  using (exists (
    select 1 from public.process_steps ps
    where ps.id = hazards.process_step_id
      and private.ra_site_manager(ps.risk_analysis_id)
      and private.ra_editable(ps.risk_analysis_id)
  ));

-- ── Equipment: operators read, managers write ────────────────────────────────
create policy equipment_select on public.equipment
  for select to authenticated
  using (private.can_access_site_row(
           (select s.org_id from public.sites s where s.id = equipment.site_id), site_id)
         or private.is_platform_staff());
create policy equipment_insert on public.equipment
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy equipment_update on public.equipment
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

-- ── Control points: operators read, managers write ───────────────────────────
create policy control_points_select on public.control_points
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy control_points_insert on public.control_points
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy control_points_update on public.control_points
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

-- ── Programme documents ──────────────────────────────────────────────────────
create policy programme_documents_select on public.programme_documents
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy programme_documents_insert on public.programme_documents
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

-- ── Tasks: site members read; managers materialize; status updates site-wide ─
create policy tasks_select on public.tasks
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy tasks_update on public.tasks
  for update to authenticated
  using (private.can_access_site(site_id))
  with check (private.can_access_site(site_id));
-- rescheduling may drop only FUTURE PENDING tasks (§17: history is never erased)
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    (private.is_site_manager(site_id) or private.is_platform_admin())
    and status = 'pending'
    and due_at > now()
  );

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.compliance_packs to authenticated;
grant select, insert on public.pack_versions to authenticated;
grant select, insert on public.corpus_documents to authenticated;
grant select, insert on public.corpus_chunks to authenticated;
grant select, insert, update on public.risk_analyses to authenticated;
grant select, insert, update, delete on public.process_steps to authenticated;
grant select, insert, update, delete on public.ra_activity_rows to authenticated;
grant select, insert, update, delete on public.hazards to authenticated;
grant select, insert, update on public.equipment to authenticated;
grant select, insert, update on public.control_points to authenticated;
grant select, insert on public.programme_documents to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

grant select, insert, update, delete on public.compliance_packs to service_role;
grant select, insert, update, delete on public.pack_versions to service_role;
grant select, insert, update, delete on public.corpus_documents to service_role;
grant select, insert, update, delete on public.corpus_chunks to service_role;
grant select, insert, update, delete on public.risk_analyses to service_role;
grant select, insert, update, delete on public.process_steps to service_role;
grant select, insert, update, delete on public.ra_activity_rows to service_role;
grant select, insert, update, delete on public.hazards to service_role;
grant select, insert, update, delete on public.equipment to service_role;
grant select, insert, update, delete on public.control_points to service_role;
grant select, insert, update, delete on public.programme_documents to service_role;
grant select, insert, update, delete on public.tasks to service_role;
