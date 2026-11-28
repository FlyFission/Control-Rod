// Most record, inbox and SCRAM reads look events up by subject and type. Without an index each of
// those reads walks the whole event log, so pages slow down as history grows. Additive: an index
// changes no row and no result.
export const EVENT_SUBJECT_INDEX_SQL = `
create index if not exists events_subject_type on events ((body->>'subject'), (body->>'type'), seq);
`;

/** Reverses 029 for the migration preservation tests. */
export const EVENT_SUBJECT_INDEX_DOWN_SQL = `
drop index if exists events_subject_type;
delete from schema_migrations where version = '029-event-subject-index';
`;
