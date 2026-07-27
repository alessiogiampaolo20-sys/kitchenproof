-- §10.1 inspector magic link — hardening (docs/audit.md §3.4).
--
-- Three defects this fixes:
--   a) the page audited "the newest live link for this site" instead of the
--      link the visitor actually used, so with two live links the wrong one
--      was attributed;
--   b) a link could not be revoked — the only way out was to wait 4 hours;
--   c) the duration was hardcoded, so a manager could not hand an inspector a
--      link for the length of an actual visit.
--
-- Rollback: drop the two columns and restore the previous function body from
-- 20260718100000_m4_inspection.sql (the old signature returns three columns).

alter table public.inspector_links
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles (id);

comment on column public.inspector_links.revoked_at is
  'Set when a manager ends the inspector''s access early; resolve refuses the token from that moment.';

-- open (usable) links, the set the UI lists
create index if not exists inspector_links_active_idx
  on public.inspector_links (site_id, expires_at desc)
  where revoked_at is null;

-- The return type changes (link_id is added), so the old function must go
-- first: CREATE OR REPLACE cannot alter a function's OUT parameters.
drop function if exists public.resolve_inspector_link(text);

-- Anonymous inspector devices call this via the anon key; the sha256 token
-- hash + expiry + revocation gate access. First use is stamped (used_at) but
-- the link stays valid until it expires or is revoked — inspectors navigate
-- across tabs for the length of the visit.
create function public.resolve_inspector_link(p_token text)
returns table (link_id uuid, site_id uuid, site_name text, expires_at timestamptz)
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
    and l.expires_at > now()
    and l.revoked_at is null;
  if not found then
    return;
  end if;

  if v_link.used_at is null then
    update public.inspector_links set used_at = now() where id = v_link.id;
  end if;

  return query
  select v_link.id, s.id, s.name, v_link.expires_at
  from public.sites s
  where s.id = v_link.site_id;
end;
$$;
grant execute on function public.resolve_inspector_link(text) to anon, authenticated;
