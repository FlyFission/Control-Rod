# Draft compare and swap review adjudication (task 1.6)

Independent review by Codex (codex-cli 0.166.0, read only), 2026-10-30: [draft-cas-codex-round1.md](draft-cas-codex-round1.md). It found the server side sound (comparison under the row lock, exact strong tags only, array headers cannot bypass it, no other writer of draft bodies) and four issues. All accepted.

| ID | Finding | Fix | Test |
|---|---|---|---|
| CAS-01 | A background refresh could replace criteria being typed | The editor captures the draft and its tag when editing begins and never replaces the text while editing; a stale save shows a conflict notice, keeps the text, and offers "Load the latest criteria" | `apps/web/src/pages/criteria.test.tsx` |
| CAS-02 | After a save, editing reopened before the fresh tag arrived | The editor stays open until the refresh with the new draft and tag completes | `criteria.test.tsx` (save uses the captured tag) |
| CAS-03 | The concurrency test might not contend | An owner connection holds the package row; both edits are confirmed waiting on that lock in `pg_stat_activity` before it is released; one lands, the other is `stale`, and exactly one edit event is recorded | `services/api/test/draft-cas.test.ts` |
| CAS-04 | An existing contract refusal test could skip its assertion | Replaced by an unconditional test on a dedicated draft that also checks the draft is unchanged | `draft-cas.test.ts` |

## Round 2

Codex confirmed CAS-01, CAS-03 and CAS-04 fixed ([draft-cas-codex-round2.md](draft-cas-codex-round2.md)). CAS-02 remained: awaiting the invalidation hides refetch errors, so a failed reload could still close the editor without the new tag. **Fixed**: the save's own response (the stored draft and its ETag header) goes straight into the page's cache before the editor closes, so the next edit always starts from the saved tag; the background refresh is only for everything else. Test: `criteria.test.tsx` mounts the real package query, fails the reload, and checks the second save sends the tag the first save returned.

## Required links

[Execution ledger](../../../../../../docs/superpowers/execution/2026-10-29-workbench-buildout.md).

## Exit criteria

Every finding has a fix and a test, confirmed by a second independent read before merge.

## Source-lineage note

Review output retained in `draft-cas-codex-round1.md` (absolute paths trimmed); dispositions by the authoring session.
