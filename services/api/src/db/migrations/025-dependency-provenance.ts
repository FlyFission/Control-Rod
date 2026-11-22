import { DEPENDENCIES_SQL } from "./013-dependencies.js";

// Preserve the provenance of legacy design-input dependencies when an explicit
// dependency also names the target. An ordinary citation still creates no edge.
export const DEPENDENCY_PROVENANCE_SQL = `
create or replace function package_dependencies_sync() returns trigger language plpgsql as $$
declare target text;
begin
  -- A classified edge survives an overlapping explicit dependency and carries its
  -- provenance to the next revision. If the citation goes away, keep an explicit edge
  -- only when the package still names it in depends_on.
  if tg_op = 'UPDATE' and new.body->'design_inputs' is distinct from old.body->'design_inputs' then
    update package_dependencies d set source = 'explicit'
     where d.package_id = new.id and d.package_revision = new.revision and d.source = 'classified-design-input'
       and not exists (select 1 from jsonb_array_elements(coalesce(new.body->'design_inputs', '[]'::jsonb)) x where x->>'doc' = d.depends_on)
       and exists (select 1 from jsonb_array_elements(coalesce(new.body->'depends_on', '[]'::jsonb)) x where x->>'package_id' = d.depends_on);
    delete from package_dependencies d
     where d.package_id = new.id and d.package_revision = new.revision and d.source = 'classified-design-input'
       and not exists (select 1 from jsonb_array_elements(coalesce(new.body->'design_inputs', '[]'::jsonb)) x where x->>'doc' = d.depends_on);
  end if;
  -- A new revision of a package that predates depends_on keeps the dependencies classified for it,
  -- as long as it still cites them.
  if tg_op = 'INSERT' and new.revision > 0 then
    insert into package_dependencies
      select new.id, new.revision, d.depends_on, d.source from package_dependencies d
       where d.package_id = new.id and d.package_revision = new.revision - 1 and d.source = 'classified-design-input'
         and exists (select 1 from jsonb_array_elements(coalesce(new.body->'design_inputs', '[]'::jsonb)) x where x->>'doc' = d.depends_on)
      on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and new.body->'depends_on' is not distinct from old.body->'depends_on' then
    return new;
  end if;
  -- One dependency change at a time, so two concurrent edits cannot each miss the other's half of a cycle.
  if jsonb_array_length(coalesce(new.body->'depends_on', '[]'::jsonb)) > 0 then
    perform pg_advisory_xact_lock(hashtext('controlrod-package-dependencies'));
  end if;
  delete from package_dependencies where package_id = new.id and package_revision = new.revision and source = 'explicit';
  for target in select jsonb_array_elements(coalesce(new.body->'depends_on', '[]'::jsonb))->>'package_id' loop
    if target = new.id then
      raise exception 'package % cannot depend on itself', new.id using errcode = '23514';
    end if;
    if not exists (select 1 from packages where id = target) then
      raise exception 'package % depends on unknown package %', new.id, target using errcode = '23503';
    end if;
    -- Refuse a cycle: the target must not already wait, directly or not, on this package.
    if exists (
      with recursive reach(id) as (
        select d.depends_on from package_dependencies d
         where d.package_id = target and d.package_revision = (select max(revision) from packages where id = target)
        union
        select d.depends_on from package_dependencies d join reach r on d.package_id = r.id
         where d.package_revision = (select max(revision) from packages where id = r.id)
      ) select 1 from reach where id = new.id) then
      raise exception 'package % and % would wait on each other', new.id, target using errcode = '23514';
    end if;
    -- Preserve the classified source when both declarations name the same edge.
    insert into package_dependencies values (new.id, new.revision, target, 'explicit')
      on conflict (package_id, package_revision, depends_on) do nothing;
  end loop;
  return new;
end $$;
`;

/** Restores the trigger body from migration 013 for migration preservation tests. */
const start = DEPENDENCIES_SQL.indexOf("create function package_dependencies_sync()");
const end = DEPENDENCIES_SQL.indexOf("create trigger packages_dependencies");
export const DEPENDENCY_PROVENANCE_DOWN_SQL = `
${DEPENDENCIES_SQL.slice(start, end).replace("create function", "create or replace function")}
delete from schema_migrations where version = '025-dependency-provenance';
`;
