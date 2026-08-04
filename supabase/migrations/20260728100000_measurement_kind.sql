-- §3.3: every temperature record states whether it is a PRODUCT or an AMBIENT
-- reading.
--
-- Basis: DK-HYGIEJNE (vejl. nr. 9700 af 24-07-2025) kap. 26.2, p. 57 —
--   "Temperaturkravene i hygiejneforordningen for animalske fødevarer og i
--    dybfrostbekendtgørelsen er i de fleste tilfælde produkttemperaturer, mens
--    temperaturbestemmelserne i hygiejnebekendtgørelsen er omgivelses-
--    temperaturer."
-- Comparing a fridge's air against a limit written for the food itself (or the
-- reverse) yields a wrong verdict in either direction, so a record whose kind
-- is unknown is not evaluated — the operator is asked.
--
-- Existing rows keep NULL. They are NOT guessed: a reading recorded before the
-- distinction existed is honestly "kind not stated", and the UI labels it so.
--
-- Rollback: drop the column and the type; limit_json annotations are additive
-- and harmless if left in place.

do $$ begin
  create type public.measurement_kind as enum ('product', 'ambient');
exception when duplicate_object then null;
end $$;

alter table public.task_completions
  add column if not exists measurement_kind public.measurement_kind;

comment on column public.task_completions.measurement_kind is
  'product = temperature of the food itself (kernetemperatur); ambient = the air around it (omgivelsestemperatur). NULL = not stated (records predating DK-HYGIEJNE kap. 26.2 support); never inferred.';

-- Annotate the site copies of the pack limits with the kind each one is about.
-- This changes no threshold — it records what the existing number always meant.
-- Matching is by the limit's own shape + the control point's source reference,
-- so a manager's custom limit is left untouched.
update public.control_points
   set limit_json = limit_json || '{"measurementKind":"ambient"}'::jsonb
 where limit_json ? 'max'
   and not (limit_json ? 'measurementKind')
   and source_ref->>'section' in ('kap. 26.1 + bilag 3', 'kap. 30.2');

update public.control_points
   set limit_json = limit_json || '{"measurementKind":"product"}'::jsonb
 where limit_json ? 'max'
   and not (limit_json ? 'measurementKind')
   and source_ref->>'section' = 'bilag 3 (Dybfrosne fødevarer)';

update public.control_points
   set limit_json = limit_json || '{"measurementKind":"product"}'::jsonb
 where not (limit_json ? 'measurementKind')
   and (limit_json ? 'min' or limit_json ? 'coolFrom')
   and source_ref->>'section' in ('kap. 27.1', 'kap. 27.3', 'kap. 26.7');
