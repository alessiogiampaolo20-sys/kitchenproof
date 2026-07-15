-- Phase 1: official corpus storage (§3.3) + photos bucket.
-- Corpus originals live in Storage/seed; text chunks here for retrieval (FTS
-- now, pgvector column ready for embeddings — RAG assistant lands in Phase 7).

create extension if not exists vector with schema extensions;

create table public.corpus_documents (
  doc_id text primary key,               -- 'DK-HYGIEJNE', … (§3.3 table)
  pack_code text not null references public.compliance_packs (code),
  title text not null,
  version_date date,
  file_path text not null,               -- original PDF (kept permanently)
  pages int,
  lang text not null default 'da' check (lang in ('da', 'en')),
  created_at timestamptz not null default now()
);

create table public.corpus_chunks (
  id uuid primary key default public.uuid_v7(),
  doc_id text not null references public.corpus_documents (doc_id) on delete cascade,
  section text,                          -- 'kap. 26.7' when known
  page_from int not null,
  page_to int not null,
  content text not null,
  -- language-neutral FTS (da/en mixed corpus); embeddings (gte-small, 384 dims)
  -- are filled by the Phase 7 RAG pipeline.
  tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding extensions.vector(384),
  created_at timestamptz not null default now()
);
create index corpus_chunks_doc_idx on public.corpus_chunks (doc_id, page_from);
create index corpus_chunks_tsv_idx on public.corpus_chunks using gin (tsv);

-- ── Storage: private photos bucket (equipment reference photos, evidence) ────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Path convention: photos/{site_id}/{entity}/{uuid}.jpg — site-scoped access.
create or replace function private.site_id_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and private.can_access_site(private.site_id_from_path(name))
  );

create policy photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and private.can_access_site(private.site_id_from_path(name))
  );

-- Evidence photos are never replaced or deleted by tenants (§17); managers can
-- do neither — corrections add new photos. (Retention jobs run server-side.)
