export const RELEASE_SQL = `
create table preparation_release_manifests (
 package_id text not null,
 package_revision int not null,
 digest text not null unique,
 body jsonb not null,
 decision_id text not null references decisions(id),
 created_at timestamptz not null default now(),
 primary key(package_id,package_revision),
 foreign key(package_id,package_revision) references packages(id,revision)
);
create trigger preparation_manifest_no_change before update or delete on preparation_release_manifests
 for each row execute function preparation_append_only();
`;
