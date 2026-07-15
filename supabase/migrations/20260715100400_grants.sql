-- Explicit verb-level grants. This stack grants NO DML by default (fail-closed)
-- but its default ACL includes TRUNCATE — which would let API roles empty
-- append-only tables. We grant exactly what each role may do; RLS remains the
-- row-level boundary (§17).

-- ── Kill the TRUNCATE hole, now and for future tables ────────────────────────
revoke truncate on all tables in schema public from anon, authenticated, service_role;
alter default privileges in schema public
  revoke truncate on tables from anon, authenticated, service_role;

-- anon: no direct table access at all (RPC get_invite_preview is definer-based).
revoke select, insert, update, delete on all tables in schema public from anon;

-- ── authenticated: per-table verb surface ────────────────────────────────────
grant select, update on public.organizations to authenticated;          -- insert via RPC
grant select, insert, update on public.sites to authenticated;          -- no delete (archive via status)
grant select, insert, update on public.profiles to authenticated;
grant select, update, delete on public.memberships to authenticated;    -- insert via RPCs; delete = pending invites only (RLS)
grant select, insert, update on public.device_sessions to authenticated;
grant select, insert, update on public.inspector_links to authenticated;
grant select on public.platform_roles to authenticated;
grant select, insert on public.audit_log to authenticated;              -- append-only (§17)
-- membership_pins: no grants (RPC-only access)

-- ── service_role: ops/backoffice, but NEVER audit tampering (§17) ────────────
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.sites to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.memberships to service_role;
grant select, insert, update, delete on public.device_sessions to service_role;
grant select, insert, update, delete on public.inspector_links to service_role;
grant select, insert, update, delete on public.platform_roles to service_role;
grant select, insert on public.audit_log to service_role;               -- no update/delete
-- membership_pins: no grants for service_role either (definer RPCs only)
