// Workbench links the phase 1 review asked for (Codex threads on migration 010). Additive.
// - A checkpoint captures its own exploration's working tree: the workspace it names must be that
//   exploration's worktree, never another exploration's or a run's workspace.
// - A controlled record's candidate belongs to the package revision the record names, as a
//   candidate already belongs to its attempt set's exact release.
// Migration 010 is checksum locked, so these are new constraints here. No product path records
// either type before this release, but 010 allowed the crossed links, so a database written to
// directly could hold one. The links go in as NOT VALID (enforced for every new row), then a check
// validates them only when no stored row breaks them. Otherwise it refuses startup naming the
// rows and pointing to docs/commands/workbench-links.md; the transaction rolls back, so the
// database is left exactly as the previous release had it.
export const WORKBENCH_LINKS_SQL = `
alter table workspaces add constraint workspaces_exploration_key unique (id, exploration_id, org_id);
alter table checkpoints add constraint checkpoints_workspace_of_exploration
  foreign key (workspace_id, exploration_id, org_id) references workspaces(id, exploration_id, org_id) not valid;
alter table candidate_assignments add constraint candidate_assignments_revision_key unique (id, package_id, package_revision, org_id);
alter table controlled_records add constraint controlled_records_candidate_of_revision
  foreign key (candidate_id, package_id, package_revision, org_id) references candidate_assignments(id, package_id, package_revision, org_id) not valid;
do $$
declare
  bad_checkpoints text;
  bad_records text;
begin
  select string_agg(id, ', ' order by id) into bad_checkpoints from (
    select c.id from checkpoints c
    where c.workspace_id is not null and c.exploration_id is not null
      and not exists (select 1 from workspaces w
        where w.id = c.workspace_id and w.exploration_id = c.exploration_id and w.org_id = c.org_id)
    order by c.id limit 20) x;
  select string_agg(id, ', ' order by id) into bad_records from (
    select r.id from controlled_records r
    where r.candidate_id is not null and r.package_id is not null and r.package_revision is not null
      and not exists (select 1 from candidate_assignments a
        where a.id = r.candidate_id and a.package_id = r.package_id
          and a.package_revision = r.package_revision and a.org_id = r.org_id)
    order by r.id limit 20) x;
  if bad_checkpoints is not null or bad_records is not null then
    raise exception 'Migration 019-workbench-links refused: stored rows link across explorations or package revisions. Checkpoints naming a workspace outside their exploration: %. Controlled records naming a candidate outside their package revision: %. Nothing was changed; see docs/commands/workbench-links.md',
      coalesce(bad_checkpoints, 'none'), coalesce(bad_records, 'none')
      using errcode = '23503';
  end if;
end $$;
alter table checkpoints validate constraint checkpoints_workspace_of_exploration;
alter table controlled_records validate constraint controlled_records_candidate_of_revision;
`;

/** Reverses 019 for the migration preservation tests: the constraints only, no row is touched. */
export const WORKBENCH_LINKS_DOWN_SQL = `
alter table controlled_records drop constraint controlled_records_candidate_of_revision;
alter table candidate_assignments drop constraint candidate_assignments_revision_key;
alter table checkpoints drop constraint checkpoints_workspace_of_exploration;
alter table workspaces drop constraint workspaces_exploration_key;
delete from schema_migrations where version = '019-workbench-links';
`;
