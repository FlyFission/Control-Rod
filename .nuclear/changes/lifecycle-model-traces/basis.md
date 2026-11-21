# Basis: package lifecycle model and conformance traces

**Change slug:** `lifecycle-model-traces`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-18
**Decision this basis supports:** whether to accept a formal model of the package lifecycle (pattern PL1) and conformance traces generated from it that replay against the kernel natively and as compiled WebAssembly (pattern PL2). Source: `docs/patterns/plannotator.md`.

## Mission / need

The kernel's lifecycle function (`kernel/src/transition.rs`) holds the floors every package state change must meet. Its unit tests check chosen cases. Nothing checks the floors over long, mixed sequences of requests. Nothing checks that the WebAssembly build the API runs (`services/api/kernel/`, committed and not rebuilt in CI) still answers as the Rust source does.

## Scope

In scope:
- `models/package-lifecycle.qnt`, `models/generate.sh`, `models/itf_to_traces.py` and `models/README.md`;
- the generated traces under `models/traces/package-lifecycle/v1/`;
- two replay tests: `kernel/bindings/wasm/tests/lifecycle_traces.rs` and `services/api/test/lifecycle-traces.test.ts`;
- the PL1 and PL2 rows of the pattern note and a row in `docs/getting-started.md`.

Out of scope:
- any change to a kernel decision function, the WebAssembly build, policies, workflows or `spec/`;
- run lease and claim, which are left for a later change.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Start PL1 and PL2. | "start PL1 and PL2" | 2026-11-18, Claude Code session for this pull request | Build a first model and conformance traces with replays. | Changing a kernel decision function; modelling every lifecycle. |
| D2 | Model the package lifecycle first rather than run lease and claim. | none: authoring agent's choice, open to the owner | 2026-11-18, this record | The lifecycle is pure, is decided in one function, and runs in two forms (native and WebAssembly), so traces can compare implementations without a database. | Run lease and claim, left for a later change. |
| D3 | Close out the pull request: settle the open decisions by the agent's best judgement and merge. | "You have my permission to close all of these out in the objectively best way possible continue" | 2026-11-21, Claude project thread "Close out the open review decisions", in reply to a list of the open decisions on #88, #92 and #102 with a recommendation for each | The agent settles each open decision in this record by the recommendation it gave, records each as its own choice, and merges once CI is green. | Confirming words the owner gave in earlier sessions; a person's read of the note for copied wording; any new trust-surface change; building any item. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The model's request is what the server sends: history fields come from the server's records and the rest vary per request. | `transition.rs` module docs and `Request` field docs. | The server is found to send a request the model cannot build, such as a pre-check with no author runtime while the baselines differ. |
| The order of checks, and so which reason a refusal gives, is part of the kernel's contract. | The API maps reason names to teaching text (`services/api/src/refusals.ts`). | The owner decides reasons are not part of the contract; the model then compares only allowed and next. |
| Placing a test under `kernel/bindings/wasm/tests/` changes no decision function. | AGENTS rule 2 names kernel decision functions; the test only calls `decide_json`. | The owner reads the rule as covering every file under `kernel/`; the test then needs their signature or a move. |
| Quint 0.33.1 is Apache-2.0 and is not a repository dependency. | npm metadata; it is fetched by `npx` in `models/generate.sh` only. | It becomes a lockfile dependency, which would put it under the licence gate. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The package lifecycle model passes its scripted runs and its invariant simulation, its generated traces are committed with their seed and digests, both replays pass against the kernel and fail on a wrong expectation, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
