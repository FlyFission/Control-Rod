# Plan: Practice agent: watch the whole loop on a bundled sample, with no account

1. Spec: add the practice fields and operation; regenerate with `pnpm spec`; check no drift.
2. Daemon: `adapter_practice.go` with the two runtimes and the `PracticeRunner` path in `copyRunOutputs`; keep the fake gate; refuse the practice checker in `controlrod check`; golden outputs in `tests/e2e/practice`.
3. API: `practice.ts`, the signed `project.practice-start` command, `POST /practice/cards`, claim filtering and the guards; sample copy in Control Rod's own data folder.
4. Web: the entry point in Setup and the first-run guide, labels on cards and captures, the board note.
5. Tests: daemon adapter tests and the golden loop; API guard tests and an end-to-end loop that submits the daemon's golden files; web tests for the entry point and labels.
6. Docs: `docs/daemon.md`, `docs/getting-started.md`.
7. Gates, commits. No push and no pull request from this session; the owner decides the merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a machine with no agent account, Try a practice run in Setup or in the first-run guide makes the practice project (signed with the passkey) and one card. The practice agents plan, author and pre-check it with no model and no process; the person releases and accepts with the passkey, and no pull request opens. The API refuses a practice agent on any other project and never gives one any other project's run. The fake runtime stays test-only. Daemon, API and web tests pass, and `pnpm spec` shows no drift.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
