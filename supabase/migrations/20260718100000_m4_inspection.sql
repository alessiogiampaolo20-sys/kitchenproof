-- Phase 6 (M4): inspection mode (§10).
--  * site_documents: pest contracts, training certificates, water tests,
--    previous smiley reports — the inspector's "Dokumenter" tab.
--  * resolve_inspector_link: SECURITY DEFINER token check for the magic-link
--    path (/inspect/[token]) — the token is the credential; pages then read
--    via a site-scoped server client and every access is audited.

create type public.site_document_kind as enum
  ('pest_control', 'training_certificate', 'water_test', 'smiley_report', 'other');

create table public.site_documents (
  id uuid primary key default public.uuid_v7(),
  site_id uuid not null references public.sites (id),
  kind public.site_document_kind not null default 'other',
  title text not null,
  file_path text not null,
  uploaded_by uuid not null references public.profiles (id),
  valid_until date,                      -- e.g. pest contract renewal date
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_documents_site_idx on public.site_documents (site_id, kind);
create trigger set_updated_at before update on public.site_documents
  for each row execute function public.set_updated_at();

alter table public.site_documents enable row level security;

create policy site_documents_select on public.site_documents
  for select to authenticated
  using (private.can_access_site(site_id) or private.is_platform_staff());
create policy site_documents_insert on public.site_documents
  for insert to authenticated
  with check (private.is_site_manager(site_id) or private.is_platform_admin());
create policy site_documents_update on public.site_documents
  for update to authenticated
  using (private.is_site_manager(site_id) or private.is_platform_admin())
  with check (private.is_site_manager(site_id) or private.is_platform_admin());

grant select, insert, update on public.site_documents to authenticated;
grant select, insert, update on public.site_documents to service_role;
-- compliance evidence shown to inspectors: no hard delete
revoke delete on public.site_documents from anon, authenticated, service_role;

-- ── documents bucket (site-scoped paths, like imports/invoices) ──────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.can_access_site(private.site_id_from_path(name)));
create policy documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.can_access_site(private.site_id_from_path(name)));

-- ── magic-link resolution (§10.1) ────────────────────────────────────────────
-- Anonymous inspector devices call this via the anon key; the sha256 token
-- hash + expiry gate access. First use is stamped (used_at) but the link stays
-- valid until expiry — inspectors navigate across tabs for up to 4 hours.
create or replace function public.resolve_inspector_link(p_token text)
returns table (site_id uuid, site_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.inspector_links%rowtype;
begin
  select * into v_link
  from public.inspector_links l
  where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and l.expires_at > now();
  if not found then
    return;
  end if;

  if v_link.used_at is null then
    update public.inspector_links set used_at = now() where id = v_link.id;
  end if;

  return query
  select s.id, s.name, v_link.expires_at
  from public.sites s
  where s.id = v_link.site_id;
end;
$$;
grant execute on function public.resolve_inspector_link(text) to anon, authenticated;
