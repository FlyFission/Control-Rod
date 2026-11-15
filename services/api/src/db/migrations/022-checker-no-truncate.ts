// Row triggers do not fire on TRUNCATE. These statement triggers keep the checker history
// append-only the same way update and delete already are.
export const CHECKER_NO_TRUNCATE_SQL = `
create trigger checker_attempts_no_truncate before truncate on checker_attempts
  for each statement execute function tenancy_append_only();
create trigger checker_recheck_overrides_no_truncate before truncate on checker_recheck_overrides
  for each statement execute function tenancy_append_only();
create trigger checker_recheck_uses_no_truncate before truncate on checker_recheck_uses
  for each statement execute function tenancy_append_only();
create trigger checker_queued_digests_no_truncate before truncate on checker_queued_digests
  for each statement execute function tenancy_append_only();
`;

export const CHECKER_NO_TRUNCATE_DOWN_SQL = `
drop trigger if exists checker_queued_digests_no_truncate on checker_queued_digests;
drop trigger if exists checker_recheck_uses_no_truncate on checker_recheck_uses;
drop trigger if exists checker_recheck_overrides_no_truncate on checker_recheck_overrides;
drop trigger if exists checker_attempts_no_truncate on checker_attempts;
delete from schema_migrations where version = '022-checker-no-truncate';
`;
