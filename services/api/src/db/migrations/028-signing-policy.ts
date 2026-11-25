// A project's signing policy (which steps on its routine cards need a passkey) is a setting its
// administrator may change, signed with a passkey each time. Additive: a project without one signs
// every step, as before policies existed.
export const SIGNING_POLICY_SQL = `
insert into lifecycle_mutable values ('projects', 'signing_policy');
`;

/** Reverses 028 for the migration preservation tests. */
export const SIGNING_POLICY_DOWN_SQL = `
delete from lifecycle_mutable where table_name = 'projects' and field = 'signing_policy';
delete from schema_migrations where version = '028-signing-policy';
`;
