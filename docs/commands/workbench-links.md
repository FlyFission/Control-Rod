# Workbench links (migration 019)

Migration `019-workbench-links` adds two links migration 010 left open:

- A checkpoint's workspace must be its own exploration's worktree, never another exploration's worktree or a run's workspace.
- A controlled record's candidate must belong to the package revision the record names.

No product path records checkpoints or controlled records before this release, so a database Control Rod wrote itself has no row that breaks either link and the migration runs without a step from you.

## If startup is refused

A database written to directly could hold such a row. Then startup stops with:

```
Migration 019-workbench-links refused: stored rows link across explorations or package revisions. Checkpoints naming a workspace outside their exploration: <ids>. Controlled records naming a candidate outside their package revision: <ids>. ...
```

It names up to 20 rows of each kind. The migration runs in one transaction, so nothing was changed and the previous release still runs against the same database.

To list every row it refuses, connect as the database owner:

```sql
select c.id, c.exploration_id, c.workspace_id, w.kind, w.exploration_id as workspace_exploration
from checkpoints c left join workspaces w on w.id = c.workspace_id and w.org_id = c.org_id
where c.workspace_id is not null and c.exploration_id is not null
  and not exists (select 1 from workspaces w2
    where w2.id = c.workspace_id and w2.exploration_id = c.exploration_id and w2.org_id = c.org_id);

select r.id, r.package_id, r.package_revision, r.candidate_id, a.package_id as candidate_package, a.package_revision as candidate_revision
from controlled_records r left join candidate_assignments a on a.id = r.candidate_id and a.org_id = r.org_id
where r.candidate_id is not null and r.package_id is not null and r.package_revision is not null
  and not exists (select 1 from candidate_assignments a2
    where a2.id = r.candidate_id and a2.package_id = r.package_id
      and a2.package_revision = r.package_revision and a2.org_id = r.org_id);
```

Each listed row records evidence against the wrong exploration or package revision, so it cannot be trusted as it stands. Both tables are append only (the `checkpoints_guard` and `controlled_records_guard` triggers refuse updates and deletes), so a row cannot be corrected in place. Review each one with whoever owns that project's records, keep an export of it, and then, as the database owner and under your change control, remove it:

```sql
begin;
alter table checkpoints disable trigger checkpoints_guard;
delete from checkpoints where id = '<id>';
alter table checkpoints enable trigger checkpoints_guard;
commit;
```

Use `controlled_records` and `controlled_records_guard` for a controlled record. A delete that another row still references (a promotion of that checkpoint, for example) fails, which shows what else rests on the wrong link; review that row the same way. Start Control Rod again once both queries return nothing.
