// Workbench links the phase 1 review asked for (Codex threads on migration 010). Additive.
// - A checkpoint captures its own exploration's working tree: the workspace it names must be that
//   exploration's worktree, never another exploration's or a run's workspace.
// - A controlled record's candidate belongs to the package revision the record names, as a
//   candidate already belongs to its attempt set's exact release.
// Migration 010 is checksum locked, so these are new constraints here. Each is validated against the
// rows already stored; no product path records either type yet.
export const WORKBENCH_LINKS_SQL = `
alter table workspaces add constraint workspaces_exploration_key unique (id, exploration_id, org_id);
alter table checkpoints add constraint checkpoints_workspace_of_exploration
  foreign key (workspace_id, exploration_id, org_id) references workspaces(id, exploration_id, org_id);
alter table candidate_assignments add constraint candidate_assignments_revision_key unique (id, package_id, package_revision, org_id);
alter table controlled_records add constraint controlled_records_candidate_of_revision
  foreign key (candidate_id, package_id, package_revision, org_id) references candidate_assignments(id, package_id, package_revision, org_id);
`;

/** Reverses 019 for the migration preservation tests: the constraints only, no row is touched. */
export const WORKBENCH_LINKS_DOWN_SQL = `
alter table controlled_records drop constraint controlled_records_candidate_of_revision;
alter table candidate_assignments drop constraint candidate_assignments_revision_key;
alter table checkpoints drop constraint checkpoints_workspace_of_exploration;
alter table workspaces drop constraint workspaces_exploration_key;
delete from schema_migrations where version = '019-workbench-links';
`;
