// Usage recorded once (workbench plan task 5.2; specification 26). A run has at most one measured and
// one reported usage record, so no race between sweeps can charge a run twice. Additive.
export const USAGE_ONCE_SQL = `
create unique index usage_records_once on usage_records (run_id, (body->>'source')) where run_id is not null;
`;

/** Reverses 017 for the migration preservation tests: the index only, no row is touched. */
export const USAGE_ONCE_DOWN_SQL = `
drop index usage_records_once;
delete from schema_migrations where version = '017-usage-once';
`;
