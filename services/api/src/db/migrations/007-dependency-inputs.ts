export const DEPENDENCY_INPUT_SQL = `
create table preparation_dependency_artifacts (
 manifest_digest text not null references preparation_release_manifests(digest),
 reference text not null,
 path text not null,
 sha256 text not null,
 bytes bytea not null,
 primary key(manifest_digest,reference,path),
 foreign key(manifest_digest,reference) references preparation_basis_artifacts(manifest_digest,reference)
);
create trigger preparation_dependency_no_change before update or delete on preparation_dependency_artifacts
 for each row execute function preparation_append_only();
`;
