// Sessions name the passkey that started them (review thread on #21). Revoking a passkey then ends
// the sessions it started, and a session whose passkey is revoked no longer signs anyone in.
// Sessions from before this migration have none; revoking any of their Member's passkeys ends them.
export const SESSION_CREDENTIALS_SQL = `
alter table sessions add column credential_id text references credentials(id);
create index sessions_by_credential on sessions (credential_id);
`;

/** Reverses 018 for the migration preservation tests: sessions lose the column, nothing else changes. */
export const SESSION_CREDENTIALS_DOWN_SQL = `
drop index sessions_by_credential;
alter table sessions drop column credential_id;
delete from schema_migrations where version = '018-session-credentials';
`;
