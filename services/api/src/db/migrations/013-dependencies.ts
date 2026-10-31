// Explicit package dependencies (workbench plan task 1.8; specification 7 "depends on"). Additive.
// A work package's `depends_on` names the packages it waits for; `design_inputs` are citations and
// never gate readiness. Released bodies are never rewritten (signed decisions bind their digests), so
// dependencies live beside them, one row per package revision and target:
// - rows from `depends_on` are kept in step with every package write by a trigger, which also refuses
//   an unknown target, a package depending on itself, and a cycle;
// - packages that already carry `depends_on` get their rows here once;
// - rows for packages that existed before this migration are classified from their `design_inputs`:
//   an entry naming an existing package was a dependency under the old rule, so it stays one, and a
//   later revision that still cites it inherits the row.
export const DEPENDENCIES_SQL = `
create table package_dependencies (
  package_id text not null,
  package_revision int not null,
  depends_on text not null,
  source text not null check (source in ('explicit', 'classified-design-input')),
  primary key (package_id, package_revision, depends_on),
  foreign key (package_id, package_revision) references packages(id, revision)
);
create index package_dependencies_target on package_dependencies (depends_on);

create function package_dependencies_sync() returns trigger language plpgsql as $$
declare target text;
begin
  -- Classified dependencies last only while the package still cites them.
  if tg_op = 'UPDATE' and new.body->'design_inputs' is distinct from old.body->'design_inputs' then
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
    insert into package_dependencies values (new.id, new.revision, target, 'explicit') on conflict do nothing;
  end loop;
  return new;
end $$;
create trigger packages_dependencies after insert or update of body on packages
  for each row execute function package_dependencies_sync();

insert into package_dependencies (package_id, package_revision, depends_on, source)
  select p.id, p.revision, d->>'package_id', 'explicit'
    from packages p, jsonb_array_elements(coalesce(p.body->'depends_on', '[]'::jsonb)) d
   where d->>'package_id' <> p.id and exists (select 1 from packages t where t.id = d->>'package_id')
  on conflict do nothing;
insert into package_dependencies (package_id, package_revision, depends_on, source)
  select p.id, p.revision, d->>'doc', 'classified-design-input'
    from packages p, jsonb_array_elements(coalesce(p.body->'design_inputs', '[]'::jsonb)) d
   where d->>'doc' <> p.id and exists (select 1 from packages t where t.id = d->>'doc')
  on conflict do nothing;
`;

export const DEPENDENCIES_DOWN_SQL = `
drop trigger packages_dependencies on packages;
drop function package_dependencies_sync();
drop table package_dependencies;
delete from schema_migrations where version = '013-dependencies';
`;
