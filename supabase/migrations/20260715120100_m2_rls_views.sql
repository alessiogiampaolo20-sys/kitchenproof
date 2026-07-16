-- Phase 2 RLS + grants + §6.6 views. Evidence tables are fail-closed AND
-- append-only at the grant level (§17): no UPDATE/DELETE on task_completions
-- for any API role — not even service_role.

-- performed_by must be a real member of the site's org (PIN actor, §4.2 —
-- may differ from auth.uid(): the device session user is often a manager).
create or replace function private.is_site_member_profile(p_profile_id uuid, p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sites s
    join public.memberships m on m.org_id = s.org_id
    where s.id = p_site_id
      and m.user_id = p_profile_id
      and m.accepted_at is not null
      and (m.expires_at is null or m.expires_at > now())
      and (m.site_ids is null or p_site_id = any (m.site_ids))
  );
$$;

alter table public.deviations enable row level security;
alter table public.task_completions enable row level security;
alter table public.cleaning_areas enable row level security;
alter table public.notifications enable row level security;

-- ── deviations: site members create/progress; guard trigger owns integrity ───
create policy deviations_select on public.deviations
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy deviations_insert on public.deviations
  for insert to authenticated
  with check (
    private.can_access_site(site_id)
    and private.is_site_member_profile(detected_by, site_id)
  );
create policy deviations_update on public.deviations
  for update to authenticated
  using (private.can_access_site(site_id))
  with check (private.can_access_site(site_id));

-- ── task_completions: insert + select only (append-only) ────────────────────
create policy task_completions_select on public.task_completions
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy task_completions_insert on public.task_completions
  for insert to authenticated
  with check (
    private.can_access_site(site_id)
    and private.is_site_member_profile(performed_by, site_id)
  );

-- ── cleaning_areas: members read, managers write ─────────────────────────────
create policy cleaning_areas_select on public.cleaning_areas
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy cleaning_areas_write on public.cleaning_areas
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy cleaning_areas_update on public.cleaning_areas
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

-- ── notifications: recipients read/mark-read; site members create ────────────
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (site_id is not null and private.is_site_manager(site_id))
  );
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (site_id is null or private.can_access_site(site_id));
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── grants (append-only enforced here too) ───────────────────────────────────
grant select, insert, update on public.deviations to authenticated;   -- no delete
grant select, insert on public.task_completions to authenticated;     -- APPEND-ONLY
grant select, insert, update on public.cleaning_areas to authenticated;
grant select, insert, update on public.notifications to authenticated;

grant select, insert, update on public.deviations to service_role;    -- no delete (§17)
grant select, insert on public.task_completions to service_role;      -- APPEND-ONLY even for ops
grant select, insert, update, delete on public.cleaning_areas to service_role;
grant select, insert, update, delete on public.notifications to service_role;

revoke update, delete on public.task_completions from anon, authenticated, service_role;
revoke delete on public.deviations from anon, authenticated, service_role;

-- ── §6.6 views (security_invoker: RLS of the querying user applies) ──────────
create view public.v_temperature_history
  with (security_invoker = true) as
select
  tc.id,
  tc.site_id,
  tc.equipment_id,
  e.name as equipment_name,
  tc.control_point_id,
  (tc.value_json ->> 'temp_c')::numeric as temp_c,
  tc.passed,
  tc.performed_by,
  tc.server_received_at
from public.task_completions tc
left join public.equipment e on e.id = tc.equipment_id
where tc.value_json ? 'temp_c';

create view public.v_site_compliance_today
  with (security_invoker = true) as
select
  s.id as site_id,
  count(t.id) filter (where t.status = 'pending' and t.due_at::date = (now() at time zone s.timezone)::date) as due_today,
  count(t.id) filter (where t.status = 'done' and t.due_at::date = (now() at time zone s.timezone)::date) as done_today,
  count(t.id) filter (where t.status = 'missed') as missed_total,
  (select count(*) from public.deviations d where d.site_id = s.id and d.status in ('open', 'corrected')) as open_deviations
from public.sites s
left join public.tasks t on t.site_id = s.id
group by s.id;

grant select on public.v_temperature_history to authenticated;
grant select on public.v_site_compliance_today to authenticated;
