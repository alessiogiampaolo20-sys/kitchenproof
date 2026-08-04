-- §1.4 the missing link: purchase → PRODUCTION → order.
--
-- Traceability exists to answer two questions when something goes wrong:
--   backwards, from an order: which purchases fed it, when was it produced,
--     and were the standards met that day?
--   forwards, from a bad ingredient: which productions used it, which orders
--     went out, and WHICH CLIENTS MUST BE CONTACTED?
--
-- The reference spreadsheet links orders straight to purchases and leaves the
-- production day implicit — connected only by sharing a date. That is what
-- makes an investigation a cross-reading exercise. Here the production is a
-- real relation, and it is also what the cooking and cooling records attach
-- to, which is what turns "we have records" into "we can prove THIS order was
-- produced correctly".
--
-- The production is deliberately a THIN EVENT, not a second inventory: it owns
-- the batches it created (batches.production_id) rather than describing them
-- again, so one physical register cannot drift from another.
--
-- Rollback: drop the two join tables, the two columns, then orders and
-- productions. Nothing existing depends on them.

-- ── customer orders (the real Order Log) ────────────────────────────────────
do $$ begin
  create type public.order_destination as enum
    ('catering', 'private', 'event', 'community_delivery', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_delivery_mode as enum ('cold', 'warm', 'mixed', 'none');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  order_ref text not null,                       -- "Baby VC", "Wedding", …
  client_name text not null,
  contact text,                                  -- email or phone, as recorded
  b2b_customer_id uuid references public.b2b_customers (id),
  destination public.order_destination not null default 'catering',
  event_date date not null,
  venue_address text,
  delivery_mode public.order_delivery_mode not null default 'cold',
  portions integer check (portions is null or portions >= 0),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, order_ref, event_date)
);
create index if not exists orders_site_date_idx on public.orders (site_id, event_date desc);
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ── productions (the connecting event) ──────────────────────────────────────
create table if not exists public.productions (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  produced_on date not null,
  product_name text not null,                    -- "Ragù", "Tiramisu"
  product_id uuid references public.products (id),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  produced_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists productions_site_date_idx
  on public.productions (site_id, produced_on desc);
create trigger set_updated_at before update on public.productions
  for each row execute function public.set_updated_at();

-- ── what went in, and who it was for ────────────────────────────────────────
-- Ingredients are linked as BATCHES, not as invoices: a batch already knows its
-- goods receipt, its invoice and its supplier, so one edge buys the whole
-- upstream chain and the operator picks physical things, not paperwork.
create table if not exists public.production_batches (
  production_id uuid not null references public.productions (id) on delete cascade,
  batch_id uuid not null references public.batches (id),
  primary key (production_id, batch_id)
);

create table if not exists public.production_orders (
  production_id uuid not null references public.productions (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  primary key (production_id, order_id)
);
create index if not exists production_orders_order_idx
  on public.production_orders (order_id);

-- ── the production owns what it made, and what was recorded about it ────────
alter table public.batches
  add column if not exists production_id uuid references public.productions (id);
create index if not exists batches_production_idx on public.batches (production_id);

-- Heat treatment and cooling are recorded ABOUT a production (the real forms
-- do exactly this: "Lasagna, 80 °C, 14:00/80 °C → 16:00/8 °C"), not about a
-- floating point in time.
alter table public.task_completions
  add column if not exists production_id uuid references public.productions (id);
create index if not exists task_completions_production_idx
  on public.task_completions (production_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.orders enable row level security;
alter table public.productions enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_orders enable row level security;

create policy orders_select on public.orders
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy orders_insert on public.orders
  for insert to authenticated with check (private.can_access_site(site_id));
create policy orders_update on public.orders
  for update to authenticated
  using (private.can_access_site(site_id)) with check (private.can_access_site(site_id));

create policy productions_select on public.productions
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy productions_insert on public.productions
  for insert to authenticated with check (private.can_access_site(site_id));
create policy productions_update on public.productions
  for update to authenticated
  using (private.can_access_site(site_id)) with check (private.can_access_site(site_id));

-- Join rows follow their production's site. Linking must stay correctable
-- (§4.5: wrong data that is easy to fix beats right data that is painful to
-- enter), so delete is allowed HERE — on the links, never on the records.
create policy production_batches_all on public.production_batches
  for all to authenticated
  using (exists (select 1 from public.productions p
                  where p.id = production_id and private.can_access_site(p.site_id)))
  with check (exists (select 1 from public.productions p
                       where p.id = production_id and private.can_access_site(p.site_id)));

create policy production_orders_all on public.production_orders
  for all to authenticated
  using (exists (select 1 from public.productions p
                  where p.id = production_id and private.can_access_site(p.site_id)))
  with check (exists (select 1 from public.productions p
                       where p.id = production_id and private.can_access_site(p.site_id)));

grant select, insert, update on public.orders to authenticated;
grant select, insert, update on public.productions to authenticated;
grant select, insert, update, delete on public.production_batches to authenticated;
grant select, insert, update, delete on public.production_orders to authenticated;
grant select, insert, update on public.orders to service_role;
grant select, insert, update on public.productions to service_role;
grant select, insert, update, delete on public.production_batches to service_role;
grant select, insert, update, delete on public.production_orders to service_role;

-- orders and productions are the spine of a recall: never hard-deleted
revoke delete on public.orders from anon, authenticated, service_role;
revoke delete on public.productions from anon, authenticated, service_role;
