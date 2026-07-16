-- Phase 5 (M3): traceability, invoices & inventory (§6.4, §9, §17).
--  * invoices: guarded lifecycle (status forward-only, extraction/confirm
--    write-once, original file immutable) — §17 append-only intent; no DELETE.
--  * goods_receipts, inventory_moves, recall_events: APPEND-ONLY (like
--    task_completions) — corrections are new rows (kind='correction').
--  * batches/products/suppliers are living operational data (mutable);
--    the immutable history lives in inventory_moves.

create extension if not exists pg_trgm with schema extensions;

create type public.invoice_kind as enum ('invoice', 'delivery_note', 'credit_note', 'receipt');
create type public.invoice_status as enum ('uploaded', 'extracting', 'needs_review', 'confirmed', 'failed');
create type public.product_category as enum
  ('meat', 'fish', 'dairy', 'produce', 'dry', 'frozen', 'beverage', 'bakery', 'packaging', 'nonfood', 'other');
create type public.storage_type as enum ('fridge', 'freezer', 'dry', 'ambient');
create type public.batch_expiry_kind as enum ('use_by', 'best_before', 'internal');
create type public.batch_origin as enum ('received', 'produced', 'leftover');
create type public.batch_status as enum ('active', 'finished', 'discarded', 'recalled');
create type public.move_kind as enum
  ('receive', 'use', 'waste', 'leftover_in', 'transfer_out', 'sale_b2b', 'correction');
create type public.waste_reason as enum ('expired', 'dropped', 'overproduction', 'deviation', 'other');

-- ── suppliers (§6.4) — org-level, optionally site-scoped ─────────────────────
create table public.suppliers (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  site_id uuid references public.sites (id),
  name text not null,
  cvr text,
  address text,
  city text,
  postal_code text,
  country text not null default 'DK',
  email text,
  phone text,
  approved boolean not null default true,
  ai_created boolean not null default false,   -- §9.1: created by the matcher, review-optional
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_org_idx on public.suppliers (org_id);
create index suppliers_cvr_idx on public.suppliers (org_id, cvr) where cvr is not null;
create index suppliers_name_trgm_idx on public.suppliers using gin (name extensions.gin_trgm_ops);
create trigger set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ── products (§6.4/§9.2) — org catalog, grows from invoices ──────────────────
create table public.products (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  normalized_name text not null,               -- lowercased, unit-stripped (matching key)
  category public.product_category not null default 'other',
  storage_type public.storage_type not null default 'ambient',
  default_shelf_life_days int,
  allergens text[] not null default '{}',      -- of the 14 EU allergens
  allergens_ai_suggested boolean not null default false,  -- §9.1: until confirmed
  unit_default text not null default 'pcs',    -- kg | g | l | pcs | box
  gtin text,
  is_food boolean not null default true,
  favourite boolean not null default false,
  merged_into_id uuid references public.products (id),  -- §9.2 merge tool keeps history
  ai_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_org_idx on public.products (org_id) where merged_into_id is null;
create index products_normalized_trgm_idx
  on public.products using gin (normalized_name extensions.gin_trgm_ops);
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ── invoices (§6.4/§9.1) — guarded lifecycle, original kept forever ──────────
create table public.invoices (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  supplier_id uuid references public.suppliers (id),
  kind public.invoice_kind not null default 'invoice',
  file_paths text[] not null,                  -- original photos/PDF (permanent)
  page_count int not null default 1,
  status public.invoice_status not null default 'uploaded',
  extraction_json jsonb,                       -- raw AI output + confidences (write-once)
  invoice_number text,
  invoice_date date,
  total_amount numeric,
  currency text,
  duplicate_of_id uuid references public.invoices (id),  -- §9.1 duplicate warning
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_site_idx on public.invoices (site_id, created_at desc);
create index invoices_dup_idx on public.invoices (site_id, supplier_id, invoice_number)
  where invoice_number is not null;
create trigger set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- §17 guard: original immutable; status forward-only; extraction + confirmation
-- write-once with server-authoritative timestamps.
create or replace function private.invoices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rank_old int;
  rank_new int;
begin
  if new.site_id is distinct from old.site_id
     or new.file_paths is distinct from old.file_paths
     or new.created_at is distinct from old.created_at then
    raise exception 'invoice original and site are immutable (§17)';
  end if;

  rank_old := case old.status
    when 'uploaded' then 0 when 'extracting' then 1 when 'needs_review' then 2
    when 'failed' then 2 else 3 end;
  rank_new := case new.status
    when 'uploaded' then 0 when 'extracting' then 1 when 'needs_review' then 2
    when 'failed' then 2 else 3 end;
  if rank_new < rank_old then
    raise exception 'invoice status can only move forward (§17)';
  end if;

  if old.extraction_json is not null
     and new.extraction_json is distinct from old.extraction_json then
    raise exception 'invoice extraction is write-once (§17)';
  end if;
  if old.confirmed_at is not null
     and (new.confirmed_by is distinct from old.confirmed_by
          or new.confirmed_at is distinct from old.confirmed_at) then
    raise exception 'invoice confirmation is write-once (§17)';
  end if;
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    new.confirmed_at := now();   -- server-authoritative, never back-dated
  end if;

  return new;
end;
$$;
create trigger invoices_guard before update on public.invoices
  for each row execute function private.invoices_guard();

-- ── invoice_lines (§6.4) — working data until the invoice is confirmed ───────
create table public.invoice_lines (
  id uuid primary key default public.uuid_v7(),
  invoice_id uuid not null references public.invoices (id),
  line_no int not null,
  raw_text text not null,                      -- exact line as printed (§9.1)
  product_id uuid references public.products (id),
  description text not null,
  quantity numeric,
  unit text,
  unit_price numeric,
  lot_code text,
  gtin text,
  is_food boolean not null default true,
  match_confidence numeric,
  needs_review boolean not null default false,
  page int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, line_no)
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create trigger set_updated_at before update on public.invoice_lines
  for each row execute function public.set_updated_at();

-- review corrections stop once the invoice is confirmed (§17)
create or replace function private.invoice_lines_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_status public.invoice_status;
begin
  select status into parent_status from public.invoices where id =
    case when tg_op = 'INSERT' then new.invoice_id else old.invoice_id end;
  if parent_status = 'confirmed' then
    raise exception 'invoice lines are frozen after confirmation (§17)';
  end if;
  if tg_op = 'UPDATE' and new.raw_text is distinct from old.raw_text then
    raise exception 'extracted raw_text is immutable (§7.5 provenance)';
  end if;
  return new;
end;
$$;
create trigger invoice_lines_guard before insert or update on public.invoice_lines
  for each row execute function private.invoice_lines_guard();

-- ── goods_receipts (§6.4/§9.3) — APPEND-ONLY (also a CP record, R3+R5) ───────
create table public.goods_receipts (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  supplier_id uuid references public.suppliers (id),
  invoice_id uuid references public.invoices (id),
  received_at timestamptz not null default now(),
  received_by uuid not null references public.profiles (id),
  transport_temp_ok boolean,
  packaging_ok boolean,
  temp_reading numeric,
  photo_paths text[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);
create index goods_receipts_site_idx on public.goods_receipts (site_id, received_at desc);
create index goods_receipts_invoice_idx on public.goods_receipts (invoice_id);

create or replace function private.goods_receipts_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();   -- server-authoritative (§17)
  new.created_at := now();
  return new;
end;
$$;
create trigger goods_receipts_stamp before insert on public.goods_receipts
  for each row execute function private.goods_receipts_stamp();

-- ── batches (§6.4) — living stock; history lives in inventory_moves ──────────
create table public.batches (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  product_id uuid not null references public.products (id),
  goods_receipt_id uuid references public.goods_receipts (id),
  lot_code text not null,
  quantity numeric not null check (quantity >= 0),
  unit text not null,
  remaining numeric not null check (remaining >= 0),
  expiry_date date,
  expiry_kind public.batch_expiry_kind,
  origin public.batch_origin not null default 'received',
  parent_batch_ids uuid[],                     -- produced/leftover provenance (§9.4)
  label_printed boolean not null default false,
  status public.batch_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index batches_site_status_idx on public.batches (site_id, status, expiry_date);
create index batches_product_idx on public.batches (product_id, created_at desc);
create index batches_lot_idx on public.batches (site_id, lot_code);
create index batches_receipt_idx on public.batches (goods_receipt_id);
create trigger set_updated_at before update on public.batches
  for each row execute function public.set_updated_at();

-- ── b2b_customers (§6.4/§9.7) ────────────────────────────────────────────────
create table public.b2b_customers (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  cvr text,
  address text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index b2b_customers_org_idx on public.b2b_customers (org_id);
create trigger set_updated_at before update on public.b2b_customers
  for each row execute function public.set_updated_at();

-- ── leftover_sessions (§6.4/§9.5) ────────────────────────────────────────────
create table public.leftover_sessions (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  service_label text not null,                 -- "lunch" | "dinner" | date-based
  started_at timestamptz not null default now(),
  started_by uuid not null references public.profiles (id),
  completed_at timestamptz,
  items_count int not null default 0,
  discarded_count int not null default 0,
  created_at timestamptz not null default now()
);
create index leftover_sessions_site_idx on public.leftover_sessions (site_id, started_at desc);

-- ── inventory_moves (§6.4) — APPEND-ONLY movement ledger ─────────────────────
create table public.inventory_moves (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  batch_id uuid not null references public.batches (id),
  kind public.move_kind not null,
  quantity numeric not null check (quantity <> 0),  -- signed only for correction
  reason public.waste_reason,                       -- required for waste (checked below)
  moved_by uuid not null references public.profiles (id),
  moved_at timestamptz not null default now(),
  note text,
  b2b_customer_id uuid references public.b2b_customers (id),
  leftover_session_id uuid references public.leftover_sessions (id),
  created_at timestamptz not null default now(),
  constraint waste_needs_reason check (kind <> 'waste' or reason is not null),
  constraint positive_unless_correction check (kind = 'correction' or quantity > 0)
);
create index inventory_moves_site_idx on public.inventory_moves (site_id, moved_at desc);
create index inventory_moves_batch_idx on public.inventory_moves (batch_id, moved_at);
create index inventory_moves_session_idx on public.inventory_moves (leftover_session_id)
  where leftover_session_id is not null;

create or replace function private.inventory_moves_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.moved_at := now();   -- server-authoritative (§17)
  new.created_at := now();
  return new;
end;
$$;
create trigger inventory_moves_stamp before insert on public.inventory_moves
  for each row execute function private.inventory_moves_stamp();

-- ── recall_events (§6.4/§9.6) — APPEND-ONLY compliance artifact ──────────────
create table public.recall_events (
  id uuid primary key default public.uuid_v7(),
  org_id uuid not null references public.organizations (id),
  scope_json jsonb not null,                   -- supplier/product/lot/date filters
  reason text not null,
  initiated_by uuid not null references public.profiles (id),
  initiated_at timestamptz not null default now(),
  report_pdf_path text,
  created_at timestamptz not null default now()
);
create index recall_events_org_idx on public.recall_events (org_id, initiated_at desc);

-- ── §6.6 views (security_invoker: querying user's RLS applies) ───────────────
create view public.v_traceability_lookup
  with (security_invoker = true) as
select
  b.id as batch_id,
  b.site_id,
  b.lot_code,
  b.quantity,
  b.unit,
  b.remaining,
  b.expiry_date,
  b.origin,
  b.status,
  b.parent_batch_ids,
  b.created_at as batch_created_at,
  p.id as product_id,
  p.name as product_name,
  p.allergens,
  gr.id as goods_receipt_id,
  gr.received_at,
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  s.id as supplier_id,
  s.name as supplier_name,
  s.cvr as supplier_cvr
from public.batches b
join public.products p on p.id = b.product_id
left join public.goods_receipts gr on gr.id = b.goods_receipt_id
left join public.invoices i on i.id = gr.invoice_id
left join public.suppliers s on s.id = gr.supplier_id;

create view public.v_expiring_batches
  with (security_invoker = true) as
select b.*, p.name as product_name, p.storage_type
from public.batches b
join public.products p on p.id = b.product_id
where b.status = 'active'
  and b.remaining > 0
  and b.expiry_date is not null
  and b.expiry_date <= (current_date + 3);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.batches enable row level security;
alter table public.inventory_moves enable row level security;
alter table public.b2b_customers enable row level security;
alter table public.leftover_sessions enable row level security;
alter table public.recall_events enable row level security;

-- org-level catalogs: org members read, any member writes (operators receive
-- goods and create products from invoices — §9 near-zero data entry)
create policy suppliers_select on public.suppliers
  for select to authenticated
  using (org_id in (select private.user_org_ids()) or private.is_platform_staff());
create policy suppliers_write on public.suppliers
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

create policy products_select on public.products
  for select to authenticated
  using (org_id in (select private.user_org_ids()) or private.is_platform_staff());
create policy products_write on public.products
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
create policy products_update on public.products
  for update to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

create policy b2b_customers_select on public.b2b_customers
  for select to authenticated
  using (org_id in (select private.user_org_ids()) or private.is_platform_staff());
create policy b2b_customers_write on public.b2b_customers
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
create policy b2b_customers_update on public.b2b_customers
  for update to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

-- site-scoped flows
create policy invoices_select on public.invoices
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (private.can_access_site(site_id));
create policy invoices_update on public.invoices
  for update to authenticated
  using (private.can_access_site(site_id))
  with check (private.can_access_site(site_id));

create policy invoice_lines_select on public.invoice_lines
  for select to authenticated
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_id and private.can_access_site(i.site_id)));
create policy invoice_lines_insert on public.invoice_lines
  for insert to authenticated
  with check (exists (select 1 from public.invoices i
                      where i.id = invoice_id and private.can_access_site(i.site_id)));
create policy invoice_lines_update on public.invoice_lines
  for update to authenticated
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_id and private.can_access_site(i.site_id)))
  with check (exists (select 1 from public.invoices i
                      where i.id = invoice_id and private.can_access_site(i.site_id)));

create policy goods_receipts_select on public.goods_receipts
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy goods_receipts_insert on public.goods_receipts
  for insert to authenticated
  with check (
    private.can_access_site(site_id)
    and private.is_site_member_profile(received_by, site_id)
  );

create policy batches_select on public.batches
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy batches_insert on public.batches
  for insert to authenticated
  with check (private.can_access_site(site_id));
create policy batches_update on public.batches
  for update to authenticated
  using (private.can_access_site(site_id))
  with check (private.can_access_site(site_id));

create policy inventory_moves_select on public.inventory_moves
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy inventory_moves_insert on public.inventory_moves
  for insert to authenticated
  with check (
    private.can_access_site(site_id)
    and private.is_site_member_profile(moved_by, site_id)
  );

create policy leftover_sessions_select on public.leftover_sessions
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy leftover_sessions_insert on public.leftover_sessions
  for insert to authenticated
  with check (
    private.can_access_site(site_id)
    and private.is_site_member_profile(started_by, site_id)
  );
create policy leftover_sessions_update on public.leftover_sessions
  for update to authenticated
  using (private.can_access_site(site_id))
  with check (private.can_access_site(site_id));

create policy recall_events_select on public.recall_events
  for select to authenticated
  using (org_id in (select private.user_org_ids()) or private.is_platform_staff());
create policy recall_events_insert on public.recall_events
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));

-- ── grants (§17 append-only at grant level too) ──────────────────────────────
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert, update on public.invoices to authenticated;          -- guard trigger owns integrity; no delete
grant select, insert, update on public.invoice_lines to authenticated;     -- frozen after confirm; no delete
grant select, insert on public.goods_receipts to authenticated;            -- APPEND-ONLY
grant select, insert, update on public.batches to authenticated;           -- no delete: history via moves
grant select, insert on public.inventory_moves to authenticated;           -- APPEND-ONLY
grant select, insert, update on public.b2b_customers to authenticated;
grant select, insert, update on public.leftover_sessions to authenticated;
grant select, insert on public.recall_events to authenticated;             -- APPEND-ONLY

grant select, insert, update on public.suppliers, public.products,
  public.invoices, public.invoice_lines, public.batches,
  public.b2b_customers, public.leftover_sessions to service_role;
grant select, insert on public.goods_receipts, public.inventory_moves,
  public.recall_events to service_role;

revoke delete on public.suppliers, public.products, public.invoices,
  public.invoice_lines, public.goods_receipts, public.batches,
  public.inventory_moves, public.b2b_customers, public.leftover_sessions,
  public.recall_events from anon, authenticated, service_role;
revoke update on public.goods_receipts, public.inventory_moves,
  public.recall_events from anon, authenticated, service_role;

grant select on public.v_traceability_lookup, public.v_expiring_batches
  to authenticated, service_role;

-- ── storage: invoice originals (permanent, site-scoped like imports) ─────────
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy invoices_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and private.can_access_site(private.site_id_from_path(name)));
create policy invoices_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'invoices' and private.can_access_site(private.site_id_from_path(name)));
-- no update/delete policies: invoice originals are immutable evidence (§9.1)
