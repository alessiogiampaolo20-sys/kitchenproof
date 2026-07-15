-- Phase 0 foundation: extensions, private schema, uuid_v7, updated_at trigger.
-- BLUEPRINT §5: IDs are UUIDv7 (sortable); time stored as timestamptz UTC.

create extension if not exists pgcrypto with schema extensions;

-- Schema for security-definer helpers that must not be exposed via PostgREST.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- UUIDv7 (RFC 9562): 48-bit unix-ms timestamp + random; sortable by creation time.
create or replace function public.uuid_v7()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  ts_ms bytea;
  bytes bytea;
begin
  ts_ms := substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  bytes := uuid_send(gen_random_uuid());
  bytes := overlay(bytes placing ts_ms from 1 for 6);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112); -- version 7
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128); -- variant 10
  return encode(bytes, 'hex')::uuid;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
