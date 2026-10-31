# Draft compare and swap review adjudication (task 1.6)

Independent review by Codex (codex-cli 0.166.0, read only), 2026-10-30: [draft-cas-codex-round1.md](draft-cas-codex-round1.md). It found the server side sound (comparison under the row lock, exact strong tags only, array headers cannot bypass it, no other writer of draft bodies) and four issues. All accepted.

| ID | Finding | Fix | Test |
|---|---|---|---|
| CAS-01 | A background refresh could replace criteria being typed | The editor captures the draft and its tag when editing begins and never replaces the text while editing; a stale save shows a conflict notice, keeps the text, and offers "Load the latest criteria" | `apps/web/src/pages/criteria.test.tsx` |
| CAS-02 | After a save, editing reopened before the fresh tag arrived | The editor stays open until the refresh with the new draft and tag completes | `criteria.test.tsx` (save uses the captured tag) |
| CAS-03 | The concurrency test might not contend | An owner connection holds the package row; both edits are confirmed waiting on that lock in `pg_stat_activity` before it is released; one lands, the other is `stale`, and exactly one edit event is recorded | `services/api/test/draft-cas.test.ts` |
| CAS-04 | An existing contract refusal test could skip its assertion | Replaced by an unconditional test on a dedicated draft that also checks the draft is unchanged | `draft-cas.test.ts` |

## Required links

[Execution ledger](../../../../../../docs/superpowers/execution/2026-10-29-workbench-buildout.md).

## Exit criteria

Every finding has a fix and a test, confirmed by a second independent read before merge.

## Source-lineage note

Review output retained in `draft-cas-codex-round1.md` (absolute paths trimmed); dispositions by the authoring session.
