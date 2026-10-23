export const RESULTS_SQL = `
create table preparation_criterion_results (
 run_id text primary key references verifications(run_id),
 package_id text not null,
 package_revision int not null,
 manifest_digest text not null references preparation_release_manifests(digest),
 verification_digest text not null,
 digest text not null,
 body jsonb not null
);
create index preparation_results_package on preparation_criterion_results(package_id,package_revision);
create trigger preparation_results_no_change before update or delete on preparation_criterion_results
 for each row execute function preparation_append_only();
`;
