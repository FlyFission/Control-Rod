export const CONFIRMATION_SQL = `
create table preparation_confirmations (
 id text primary key,
 package_id text not null,
 package_revision int not null,
 requirements_digest text not null,
 body jsonb not null,
 decided_at timestamptz not null,
 foreign key(package_id,package_revision) references packages(id,revision)
);
create index preparation_confirmation_subject on preparation_confirmations(package_id,package_revision,requirements_digest);
create trigger preparation_confirmation_no_change before update or delete on preparation_confirmations
 for each row execute function preparation_append_only();
`;
