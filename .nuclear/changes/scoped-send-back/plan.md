# Plan: scoped send-back after a failed check

**Status:** Proposed. These steps run only after the owner says to build it.

1. Add optional `evidence: string`, `location: { path: string; line?: int32 }` and `scope_paths: string[]` to `Finding` in `spec/records.tsp`. Regenerate `spec/generated`. Do not bump `schema_version`.
2. Pre-check brief: ask for evidence, a location and a scope on each finding, and say that a finding without evidence is advisory.
3. Author rework brief (`services/api/src/work.ts`, the `run.round > 1` branch): after "Findings to fix from the pre-check", add "Scope of this fix", listing the union of `scope_paths`. If no finding names a scope, leave the section out.
4. When an author round after the first succeeds, compare its outputs with the previous round's outputs by path and sha256. Append `package.scope-drift` with the paths that changed outside the scope. Pass the drift list to the next pre-check as an input.
5. Web: show drift on the card and in the package view. Dispute item text: three failed rounds usually mean the plan needs another look, with Return as the suggested action.
6. Tests: a finding with and without the new fields; a rework round with no drift; one with drift; the dispute text. Then the API suite, the web suite and typecheck.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).
