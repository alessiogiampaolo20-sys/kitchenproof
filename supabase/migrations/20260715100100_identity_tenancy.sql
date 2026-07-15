-- BLUEPRINT §6.1 identity & tenancy tables, plus:
--   platform_roles (§17 — platform_admin bypass via table, never service key in user paths)
--   audit_log (§6.5/§17 — every mutation emits an audit row; hash-chained per site)
-- Schema notes vs the simplified §6.1 sketch (documented in CLAUDE.md decision log):
--   * memberships.pin_hash lives in membership_pins (RLS deny-all side table) so PIN
--     hashes are never readable through PostgREST (§17 auth hardening).
--   * memberships gains invited_email / invite_token_hash / invite_expires_at to
--     implement the invite flow; expires_at keeps its §6.1 meaning (access expiry
--     for consultants/guests).

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.org_role as enum
  ('org_owner', 'org_admin', 'consultant', 'site_manager', 'operator');
create type public.platform_role as enum
  ('platform_admin', 'platform_support');
create type public.site_status as enum
  ('active', 'paused', 'archived');

-- §2 activity type codes [DECISION]
create type public.activity_type as enum
  ('restaurant', 'cafe', 'takeaway', 'canteen', 'bakery', 'butcher', 'catering',
   'foodtruck', 'retail_kiosk', 'hotel_breakfast', 'small_producer', 'wholesale_small');

-- ── organizations ────────────────────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default public.uuid_v7(),
  name text not null check (char_length(name) between 1 and 200),
  country_code text not null default 'DK' check (country_code ~ '^[A-Z]{2}$'),
  vat_number text,
  billing_email text,
  plan text not null default 'trial',
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled', 'deleted')),
  default_locale text not null default 'da' check (default_locale in ('da', 'en', 'it')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

-- ── sites ────────────────────────────────────────────────────────────────────
create table public.sites (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  name text not null check (char_length(name) between 1 and 200),
  address text,
  city text,
  postal_code text,
  country_code text not null default 'DK' check (country_code ~ '^[A-Z]{2}$'),
  cvr_p_number text,
  activity_type public.activity_type not null,
  compliance_pack text not null default 'DK',
  pack_version_pinned text,
  timezone text not null default 'Europe/Copenhagen',
  smiley_url text,
  status public.site_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sites_org_id_idx on public.sites (org_id);
create trigger set_updated_at before update on public.sites
  for each row execute function public.set_updated_at();

-- ── profiles (1:1 auth.users) ────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  locale text not null default 'da' check (locale in ('da', 'en', 'it')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'locale' in ('da', 'en', 'it')
        then new.raw_user_meta_data ->> 'locale'
      else 'da'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── memberships ──────────────────────────────────────────────────────────────
create table public.memberships (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  -- references profiles (1:1 with auth.users, created by trigger) so member
  -- names can be embedded via PostgREST; null until an invite is accepted
  user_id uuid references public.profiles (id),
  role public.org_role not null,
  site_ids uuid[],                           -- null = all sites in org (§6.1)
  invited_email text,
  invite_token_hash text,
  invite_expires_at timestamptz,
  invited_by uuid references auth.users (id),
  accepted_at timestamptz,
  expires_at timestamptz,                    -- access expiry (consultants/guests, §6.1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id),
  check (user_id is not null or invited_email is not null)
);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_org_id_idx on public.memberships (org_id);
create unique index memberships_invite_token_idx
  on public.memberships (invite_token_hash) where invite_token_hash is not null;
create trigger set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- Guard: invite acceptance is the only path that may bind a user to a membership,
-- and org_owner rows can only be altered by an org_owner (see RPC migration for
-- the GUC set by accept_invite).
create or replace function private.memberships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'memberships.org_id is immutable';
  end if;
  if new.user_id is distinct from old.user_id then
    if old.user_id is not null
       or coalesce(current_setting('app.invite_accept', true), '') <> 'on' then
      raise exception 'memberships.user_id may only be set by accept_invite()';
    end if;
  end if;
  if new.accepted_at is distinct from old.accepted_at
     and coalesce(current_setting('app.invite_accept', true), '') <> 'on' then
    raise exception 'memberships.accepted_at may only be set by accept_invite()';
  end if;
  return new;
end;
$$;
create trigger memberships_guard before update on public.memberships
  for each row execute function private.memberships_guard();

-- ── membership_pins (deny-all; only security-definer RPCs touch it, §17) ─────
create table public.membership_pins (
  membership_id uuid primary key references public.memberships (id) on delete cascade,
  pin_hash text not null,               -- argon2id, hashed app-side
  failed_attempts int not null default 0,
  locked_at timestamptz,                -- set after 5 failures; cleared by manager unlock
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.membership_pins
  for each row execute function public.set_updated_at();

-- ── device_sessions ──────────────────────────────────────────────────────────
create table public.device_sessions (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  device_name text not null check (char_length(device_name) between 1 and 100),
  registered_by uuid not null references auth.users (id),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_sessions_site_id_idx on public.device_sessions (site_id);
create trigger set_updated_at before update on public.device_sessions
  for each row execute function public.set_updated_at();

-- ── inspector_links (flows land in Phase 6; table is §6.1) ───────────────────
create table public.inspector_links (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  token_hash text not null unique,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inspector_links_site_id_idx on public.inspector_links (site_id);
create trigger set_updated_at before update on public.inspector_links
  for each row execute function public.set_updated_at();

-- ── platform_roles (§17) ─────────────────────────────────────────────────────
create table public.platform_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ── audit_log (§6.5, §17: hash-chained, append-only) ─────────────────────────
create table public.audit_log (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  site_id uuid references public.sites (id),
  actor_id uuid not null,
  actor_role text not null,
  impersonated_by uuid,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_hash text,
  after_hash text,
  prev_hash text,
  diff jsonb,
  client_created_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log (org_id, created_at desc);
create index audit_log_site_created_idx on public.audit_log (site_id, created_at desc);

-- Hash chain per site (org chain for org-level entries). Server-authoritative
-- timestamps; the trigger recomputes hashes so clients cannot forge them.
create or replace function private.audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chain_key uuid := coalesce(new.site_id, new.org_id);
  prev text;
begin
  perform pg_advisory_xact_lock(hashtextextended(chain_key::text, 0));
  select al.after_hash into prev
  from public.audit_log al
  where coalesce(al.site_id, al.org_id) = chain_key
  order by al.created_at desc, al.id desc
  limit 1;

  new.created_at := now();
  new.prev_hash := prev;
  new.after_hash := encode(extensions.digest(
    coalesce(prev, '')
      || new.action
      || new.entity_table
      || coalesce(new.entity_id::text, '')
      || coalesce(new.diff::text, '')
      || new.actor_id::text
      || new.created_at::text,
    'sha256'), 'hex');
  return new;
end;
$$;
create trigger audit_log_chain before insert on public.audit_log
  for each row execute function private.audit_log_chain();

-- Append-only: nobody (not even the service key) may update or delete (§17).
revoke update, delete on table public.audit_log from anon, authenticated, service_role;

-- PIN hashes are never readable/writable through the API surface (§17).
revoke all on table public.membership_pins from anon, authenticated;
