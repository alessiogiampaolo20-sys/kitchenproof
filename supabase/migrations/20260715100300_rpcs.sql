-- Security-definer RPCs for flows that RLS alone cannot express atomically:
-- org creation (org + owner membership), invites (token hashing), and the PIN
-- layer (§4.2 fast user switching; §17 argon2 + rate limit + manager unlock).
-- Every RPC writes its own audit_log row (§5: every mutation emits audit).

-- ── create_organization ──────────────────────────────────────────────────────
create or replace function public.create_organization(
  p_name text,
  p_country_code text default 'DK',
  p_default_locale text default 'da'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then
    raise exception 'invalid_org_name';
  end if;
  if p_default_locale not in ('da', 'en', 'it') then
    raise exception 'invalid_locale';
  end if;
  if p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country_code';
  end if;

  insert into public.organizations (name, country_code, default_locale, created_by)
  values (btrim(p_name), p_country_code, p_default_locale, v_uid)
  returning id into v_org_id;

  insert into public.memberships (org_id, user_id, role, accepted_at)
  values (v_org_id, v_uid, 'org_owner', now());

  insert into public.audit_log (org_id, actor_id, actor_role, action, entity_table, entity_id, diff)
  values (v_org_id, v_uid, 'org_owner', 'org.created', 'organizations', v_org_id,
          jsonb_build_object('name', btrim(p_name), 'country_code', p_country_code));

  return v_org_id;
end;
$$;

-- ── create_invite: returns the plaintext token exactly once ──────────────────
create or replace function public.create_invite(
  p_org_id uuid,
  p_email text,
  p_role public.org_role,
  p_site_ids uuid[] default null,
  p_expires_at timestamptz default null   -- access expiry (consultants/guests)
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_caller_role public.org_role := private.role_in_org(p_org_id);
  v_token text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_caller_role not in ('org_owner', 'org_admin') and not private.is_platform_admin() then
    raise exception 'not_authorized';
  end if;
  if p_role = 'org_owner' and v_caller_role <> 'org_owner' and not private.is_platform_admin() then
    raise exception 'only_owner_can_invite_owner';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if p_site_ids is not null and exists (
    select 1 from unnest(p_site_ids) sid
    where not exists (select 1 from public.sites s where s.id = sid and s.org_id = p_org_id)
  ) then
    raise exception 'site_not_in_org';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.memberships
    (org_id, role, site_ids, invited_email, invite_token_hash, invite_expires_at,
     invited_by, expires_at)
  values
    (p_org_id, p_role, p_site_ids, lower(p_email),
     encode(extensions.digest(v_token, 'sha256'), 'hex'),
     now() + interval '7 days', v_uid, p_expires_at);

  insert into public.audit_log (org_id, actor_id, actor_role, action, entity_table, diff)
  values (p_org_id, v_uid, v_caller_role::text, 'membership.invited', 'memberships',
          jsonb_build_object('email', lower(p_email), 'role', p_role));

  return v_token;
end;
$$;

-- ── get_invite_preview (anon-callable; token possession = authorization) ─────
create or replace function public.get_invite_preview(p_token text)
returns table (org_id uuid, org_name text, invite_role public.org_role, invited_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, m.role, m.invited_email
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and m.accepted_at is null
    and (m.invite_expires_at is null or m.invite_expires_at > now());
$$;

-- ── accept_invite ────────────────────────────────────────────────────────────
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_membership public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_membership
  from public.memberships m
  where m.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and m.accepted_at is null
    and (m.invite_expires_at is null or m.invite_expires_at > now())
  for update;

  if not found then
    raise exception 'invite_invalid';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.org_id = v_membership.org_id and m.user_id = v_uid
  ) then
    raise exception 'already_member';
  end if;

  perform set_config('app.invite_accept', 'on', true);
  update public.memberships
  set user_id = v_uid,
      accepted_at = now(),
      invite_token_hash = null,
      invite_expires_at = null
  where id = v_membership.id;
  perform set_config('app.invite_accept', 'off', true);

  insert into public.audit_log (org_id, actor_id, actor_role, action, entity_table, entity_id)
  values (v_membership.org_id, v_uid, v_membership.role::text,
          'membership.accepted', 'memberships', v_membership.id);

  return v_membership.org_id;
end;
$$;

-- ── PIN layer (§17: argon2 app-side, 5 tries → manager unlock) ───────────────

-- Self or site_manager+ in the org may set a member's PIN (§4.2).
create or replace function public.set_member_pin(p_membership_id uuid, p_pin_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_m public.memberships%rowtype;
  v_caller_role public.org_role;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_m from public.memberships where id = p_membership_id;
  if not found or v_m.accepted_at is null then
    raise exception 'membership_not_found';
  end if;
  v_caller_role := private.role_in_org(v_m.org_id);
  if v_m.user_id <> v_uid
     and v_caller_role not in ('org_owner', 'org_admin', 'site_manager', 'consultant') then
    raise exception 'not_authorized';
  end if;
  if p_pin_hash is null or p_pin_hash !~ '^\$argon2' then
    raise exception 'invalid_pin_hash';
  end if;

  insert into public.membership_pins (membership_id, pin_hash, failed_attempts, locked_at, updated_by)
  values (p_membership_id, p_pin_hash, 0, null, v_uid)
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_at = null,
        updated_by = excluded.updated_by;

  insert into public.audit_log (org_id, actor_id, actor_role, action, entity_table, entity_id)
  values (v_m.org_id, v_uid, coalesce(v_caller_role::text, 'operator'),
          'membership.pin_set', 'membership_pins', p_membership_id);
end;
$$;

-- Server actions verify argon2 app-side; hash is only handed to authenticated
-- members of the same org (kitchen-device context). A 4-digit PIN is an
-- attribution device, not a cryptographic secret (§4.2).
create or replace function public.get_pin_verification_data(p_membership_id uuid)
returns table (pin_hash text, failed_attempts int, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select mp.pin_hash, mp.failed_attempts, (mp.locked_at is not null) as locked
  from public.membership_pins mp
  join public.memberships m on m.id = mp.membership_id
  where mp.membership_id = p_membership_id
    and m.org_id in (select private.user_org_ids());
$$;

create or replace function public.record_pin_attempt(p_membership_id uuid, p_success boolean)
returns table (locked boolean, remaining_attempts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_failed int;
  v_locked_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select m.org_id into v_org from public.memberships m where m.id = p_membership_id;
  if not found or v_org not in (select private.user_org_ids()) then
    raise exception 'not_authorized';
  end if;

  if p_success then
    update public.membership_pins
    set failed_attempts = 0, locked_at = null
    where membership_id = p_membership_id;
    return query select false, 5;
  else
    update public.membership_pins
    set failed_attempts = membership_pins.failed_attempts + 1,
        locked_at = case
          when membership_pins.failed_attempts + 1 >= 5 then now()
          else membership_pins.locked_at
        end
    where membership_id = p_membership_id
    returning membership_pins.failed_attempts, membership_pins.locked_at
      into v_failed, v_locked_at;
    return query select (v_locked_at is not null), greatest(5 - v_failed, 0);
  end if;
end;
$$;

create or replace function public.unlock_member_pin(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_m public.memberships%rowtype;
  v_caller_role public.org_role;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'membership_not_found';
  end if;
  v_caller_role := private.role_in_org(v_m.org_id);
  if v_caller_role not in ('org_owner', 'org_admin', 'site_manager', 'consultant')
     and not private.is_platform_admin() then
    raise exception 'not_authorized';
  end if;

  update public.membership_pins
  set failed_attempts = 0, locked_at = null, updated_by = v_uid
  where membership_id = p_membership_id;

  insert into public.audit_log (org_id, actor_id, actor_role, action, entity_table, entity_id)
  values (v_m.org_id, v_uid, coalesce(v_caller_role::text, 'platform_admin'),
          'membership.pin_unlocked', 'membership_pins', p_membership_id);
end;
$$;

-- PIN switcher support: which site members have a PIN / are locked — without
-- ever exposing hashes. Caller must have access to the site.
create or replace function public.site_pin_status(p_site_id uuid)
returns table (membership_id uuid, has_pin boolean, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, (mp.membership_id is not null), (mp.locked_at is not null)
  from public.sites s
  join public.memberships m on m.org_id = s.org_id
  left join public.membership_pins mp on mp.membership_id = m.id
  where s.id = p_site_id
    and private.can_access_site(p_site_id)
    and m.accepted_at is not null
    and (m.expires_at is null or m.expires_at > now())
    and (m.site_ids is null or p_site_id = any (m.site_ids));
$$;

-- ── Execute grants: authenticated only (invite preview also anon) ────────────
revoke execute on function public.create_organization(text, text, text) from public, anon;
revoke execute on function public.create_invite(uuid, text, public.org_role, uuid[], timestamptz) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.set_member_pin(uuid, text) from public, anon;
revoke execute on function public.get_pin_verification_data(uuid) from public, anon;
revoke execute on function public.record_pin_attempt(uuid, boolean) from public, anon;
revoke execute on function public.unlock_member_pin(uuid) from public, anon;
revoke execute on function public.get_invite_preview(text) from public;
revoke execute on function public.site_pin_status(uuid) from public, anon;

grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid, text, public.org_role, uuid[], timestamptz) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.set_member_pin(uuid, text) to authenticated;
grant execute on function public.get_pin_verification_data(uuid) to authenticated;
grant execute on function public.record_pin_attempt(uuid, boolean) to authenticated;
grant execute on function public.unlock_member_pin(uuid) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
grant execute on function public.site_pin_status(uuid) to authenticated;
