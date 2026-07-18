-- risk_analyses.approved_by pointed at auth.users (Phase 1 oversight) — every
-- PostgREST embed of the approver (`profiles!risk_analyses_approved_by_fkey`)
-- failed, which silently broke the §7.4 approval PDF snapshot (its failure is
-- non-fatal by design and was audited as programme.pdf_failed). Repoint to
-- profiles like every other person column.
alter table public.risk_analyses
  drop constraint risk_analyses_approved_by_fkey;
alter table public.risk_analyses
  add constraint risk_analyses_approved_by_fkey
  foreign key (approved_by) references public.profiles (id);

-- §10.1 safeguard: never lock a device nobody can unlock. membership_pins is
-- RLS deny-all (RPC-only), so existence is checked via a definer function.
create or replace function public.site_has_manager_pin(p_site_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.membership_pins p on p.membership_id = m.id
    join public.sites s on s.org_id = m.org_id
    where s.id = p_site_id
      and m.role in ('org_owner', 'org_admin', 'site_manager')
      and m.accepted_at is not null
      and (m.site_ids is null or p_site_id = any (m.site_ids))
      and p.pin_hash is not null
  );
$$;
grant execute on function public.site_has_manager_pin(uuid) to authenticated;
