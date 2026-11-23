// A project's default workflow (playbook, superpowers, pocock or pocock-superpowers) is a setting
// its administrator may change, like its default context profile. Additive: a project without one
// reads as the playbook.
export const DEFAULT_WORKFLOW_SQL = `
insert into lifecycle_mutable values ('projects', 'default_workflow');
`;

/** Reverses 026 for the migration preservation tests. */
export const DEFAULT_WORKFLOW_DOWN_SQL = `
delete from lifecycle_mutable where table_name = 'projects' and field = 'default_workflow';
delete from schema_migrations where version = '026-default-workflow';
`;
