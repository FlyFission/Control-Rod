# Ship: CI that tests what users run

Release decision: **pending**. Merge is the owner's decision, after CI is green on the pull request and the owner has signed the trust-surface changes below.

- Rollback: revert the merge. No data or migration.
- Monitoring after merge: the three new jobs (`kernel-wasm`, `product`, `gates`) pass on main; then the owner adds them to the branch protection rule (docs/collaboration.md, Branch protection).
- Limits: the new jobs were not run on GitHub before this record; the kernel table pins today's decisions, which the floor checks cross-check but do not prove; the readme-shots gap is documented, not closed.

## Signature

| Field | Entry |
|---|---|
| Decision | **Pending.** The owner has not been asked yet. Recorded by the agent; not the owner's signature. |
| Question | To be asked by the coordinating session, naming this pull request and each trust surface it changes: `.github/workflows/ci.yml`, `.github/workflows/platforms.yml`, `.github/workflows/readme-shots-commit.yml`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/change.yml`, `scripts/cr.mjs`, `scripts/build-kernel-wasm.sh`, `scripts/test/` (new doctor test), `kernel/tests/` (new table test; no decision code). |
| Answer | Pending. |
| When and where | Pending. |
| Head when asked | Pending. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CI installs and starts Control Rod as an ordinary user and checks that it answers and stops; rebuilds the WebAssembly kernel and fails on any difference; runs the repository's own checks, the doctor tests, the kernel decision table in Rust and WebAssembly, and the daemon tests under the race detector; and runs the API tests on the bundled PostgreSQL without compiling one. Every gate that failed on main passes, and no gate is weakened. The owner signs the `.github/` and other trust-surface changes before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
