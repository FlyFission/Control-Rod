// A project's default context profile (light or nuclear) is a setting its administrator may change,
// like its default rigor. Additive: a project without one reads as light.
export const CONTEXT_PROFILE_SQL = `
insert into lifecycle_mutable values ('projects', 'default_context_profile');
`;

/** Reverses 024 for the migration preservation tests. */
export const CONTEXT_PROFILE_DOWN_SQL = `
delete from lifecycle_mutable where table_name = 'projects' and field = 'default_context_profile';
delete from schema_migrations where version = '024-context-profile';
`;
