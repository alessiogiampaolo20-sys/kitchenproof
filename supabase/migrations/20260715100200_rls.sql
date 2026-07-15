-- BLUEPRINT §17: RLS is the security boundary. Fail-closed: RLS enabled on every
-- table; no policy = no access. platform_admin bypass goes through platform_roles
-- (never the service key in user request paths).

-- ── Helper functions (security definer; read memberships without recursion) ──

create or replace function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.accepted_at is not null
    and (m.expires_at is null or m.expires_at > now());
$$;

create or replace function private.role_in_org(p_org_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.org_id = p_org_id
    and m.user_id = (select auth.uid())
    and m.accepted_at is not null
    and (m.expires_at is null or m.expires_at > now())
  limit 1;
$$;

create or replace function private.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_in_org(p_org_id) in ('org_owner', 'org_admin');
$$;

create or replace function private.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_roles pr
    where pr.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_roles pr
    where pr.user_id = (select auth.uid())
      and pr.role = 'platform_admin'
  );
$$;

-- Site access respecting memberships.site_ids scoping (null = all org sites).
create or replace function private.can_access_site(p_site_id uuid)
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
      and m.user_id = (select auth.uid())
      and m.accepted_at is not null
      and (m.expires_at is null or m.expires_at > now())
      and (m.site_ids is null or p_site_id = any (m.site_ids))
  );
$$;

-- Same check from row columns (org_id, id) without re-querying sites — needed
-- for the sites SELECT policy so INSERT ... RETURNING can see the new row
-- (rows inserted by the current command are invisible to same-command scans).
create or replace function private.can_access_site_row(p_org_id uuid, p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.accepted_at is not null
      and (m.expires_at is null or m.expires_at > now())
      and (m.site_ids is null or p_site_id = any (m.site_ids))
  );
$$;

-- Caller's role for a given site (site_ids-scoped), null if no access.
create or replace function private.site_role(p_site_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.sites s
  join public.memberships m on m.org_id = s.org_id
  where s.id = p_site_id
    and m.user_id = (select auth.uid())
    and m.accepted_at is not null
    and (m.expires_at is null or m.expires_at > now())
    and (m.site_ids is null or p_site_id = any (m.site_ids))
  limit 1;
$$;

-- consultant = "like site_manager but flagged external" (§4.2)
create or replace function private.is_site_manager(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.site_role(p_site_id) in ('org_owner', 'org_admin', 'site_manager', 'consultant');
$$;

create or replace function private.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid())
      and mine.accepted_at is not null
      and (mine.expires_at is null or mine.expires_at > now())
      and theirs.user_id = p_user_id
      and theirs.accepted_at is not null
  );
$$;

-- ── Enable RLS everywhere ────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_pins enable row level security;
alter table public.device_sessions enable row level security;
alter table public.inspector_links enable row level security;
alter table public.platform_roles enable row level security;
alter table public.audit_log enable row level security;

-- ── organizations ────────────────────────────────────────────────────────────
-- insert happens only via create_organization() RPC (security definer).
create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select private.user_org_ids()) or private.is_platform_staff());

create policy organizations_update on public.organizations
  for update to authenticated
  using (private.is_org_admin(id) or private.is_platform_admin())
  with check (private.is_org_admin(id) or private.is_platform_admin());

-- ── sites ────────────────────────────────────────────────────────────────────
create policy sites_select on public.sites
  for select to authenticated
  using (private.can_access_site_row(org_id, id) or private.is_platform_staff());

-- §4.2: only org_owner creates sites (platform_admin for white-glove).
create policy sites_insert on public.sites
  for insert to authenticated
  with check (private.role_in_org(org_id) = 'org_owner' or private.is_platform_admin());

create policy sites_update on public.sites
  for update to authenticated
  using (private.is_org_admin(org_id) or private.is_platform_admin())
  with check (private.is_org_admin(org_id) or private.is_platform_admin());

-- ── profiles ─────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.shares_org_with(id)
    or private.is_platform_staff()
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── memberships ──────────────────────────────────────────────────────────────
-- inserts happen only via create_organization()/create_invite() RPCs.
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or org_id in (select private.user_org_ids())
    or private.is_platform_staff()
  );

-- Admins manage role/site_ids/expiry; the memberships_guard trigger blocks
-- user_id/accepted_at manipulation outside accept_invite().
create policy memberships_update on public.memberships
  for update to authenticated
  using (private.is_org_admin(org_id) or private.is_platform_admin())
  with check (private.is_org_admin(org_id) or private.is_platform_admin());

-- Pending invites may be deleted; accepted memberships are revoked via
-- expires_at so record attribution history is preserved (§17).
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    accepted_at is null
    and (private.is_org_admin(org_id) or private.is_platform_admin())
  );

-- ── membership_pins: NO policies (deny all; RPC-only access) ─────────────────

-- ── device_sessions ──────────────────────────────────────────────────────────
create policy device_sessions_select on public.device_sessions
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());

create policy device_sessions_insert on public.device_sessions
  for insert to authenticated
  with check (
    registered_by = (select auth.uid())
    and private.is_site_manager(site_id)
  );

create policy device_sessions_update on public.device_sessions
  for update to authenticated
  using (private.is_site_manager(site_id))
  with check (private.is_site_manager(site_id));

-- ── inspector_links ──────────────────────────────────────────────────────────
create policy inspector_links_select on public.inspector_links
  for select to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_staff());

create policy inspector_links_insert on public.inspector_links
  for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_site_manager(site_id));

create policy inspector_links_update on public.inspector_links
  for update to authenticated
  using (private.is_site_manager(site_id))
  with check (private.is_site_manager(site_id));

-- ── platform_roles (managed via SQL/service only; readable to self/admin) ────
create policy platform_roles_select on public.platform_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());

-- ── audit_log ────────────────────────────────────────────────────────────────
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and org_id in (select private.user_org_ids())
    and (site_id is null or private.can_access_site(site_id))
  );

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.is_org_admin(org_id) or private.is_platform_staff());
