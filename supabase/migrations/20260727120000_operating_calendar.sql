-- §3.5 operating calendar: the business does not cook every day.
--
-- Why this exists: without it the app marks every closed day "overdue", which
-- is the fastest way to get the software abandoned — and to an inspector a gap
-- in the records looks like a missing record, while "closed — no production"
-- is a complete answer. Storing the closed day explicitly turns one into the
-- other.
--
-- Rollback: drop the table, the type and the sites column (no data depends on
-- them; tasks are materialised from control points, not from this calendar).

-- ── the site's normal pattern ────────────────────────────────────────────────
-- null = open every day, which is what every existing site did before this
-- migration. Shape (validated in app code, src/lib/compliance/operating-days.ts):
--   {"mode":"weekdays","weekdays":[1,2,3,4,5]}   ISO weekdays, 1 = Monday
--   {"mode":"scheduled_only"}                    open when work is booked
alter table public.sites
  add column if not exists operating_pattern jsonb;

comment on column public.sites.operating_pattern is
  'Normal operating rhythm; null means open every day. Derived per-day status can always be overridden by a site_operating_days row.';

-- ── explicit per-day status ──────────────────────────────────────────────────
do $$ begin
  create type public.operating_day_status as enum ('open', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists public.site_operating_days (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  day date not null,
  status public.operating_day_status not null,
  -- who said so: a closed day is a statement to the authority, not a blank
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, day)
);

comment on table public.site_operating_days is
  'Confirmed open/closed days. A day declared after the fact is visible as such: confirmed_at is server-set and can be compared with day — never back-dated.';

create index if not exists site_operating_days_site_day_idx
  on public.site_operating_days (site_id, day desc);

create trigger set_updated_at before update on public.site_operating_days
  for each row execute function public.set_updated_at();

alter table public.site_operating_days enable row level security;

create policy site_operating_days_select on public.site_operating_days
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());

create policy site_operating_days_insert on public.site_operating_days
  for insert to authenticated
  with check (private.can_access_site(site_id));

-- A mistake must be correctable (yesterday marked closed by accident), but the
-- correction is audited by the application and confirmed_at moves with it.
create policy site_operating_days_update on public.site_operating_days
  for update to authenticated
  using (private.can_access_site(site_id))
  with check (private.can_access_site(site_id));

grant select, insert, update on public.site_operating_days to authenticated;
grant select, insert, update on public.site_operating_days to service_role;
-- the calendar is evidence shown to inspectors: no hard delete
revoke delete on public.site_operating_days from anon, authenticated, service_role;
