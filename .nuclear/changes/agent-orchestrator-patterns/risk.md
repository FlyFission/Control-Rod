# Quick Risk: Agent Orchestrator pattern note

## Selected mode

- **Mode:** Quick
- **Why this mode:** docs only, with no trust surface changed. The note records design input (`AO-1` through `AO-16`), explicit trust-model exclusions, and hardening test targets mapped to `#118`–`#133` and `M5`–`M8`, and proposes no kernel, policy, red-team, workflow, or spec change.

---

## Change

- Slug: agent-orchestrator-patterns
- PR / issue: Slice 1 on branch `feat/ao-s1-patterns` (design input for `#118`–`#133` and board slices `M5`–`M8`)
- Owner: Ben Huffer (decision owner); drafted from the pinned `agent-orchestrator` review for Slice 1
- Date: 2026-11-22
- Summary: two documentation edits.
  - Add `docs/patterns/agent-orchestrator.md` capturing ideas only from `OrchestratorInc/agent-orchestrator` (Apache-2.0, commit `7c65ce3cfc0fc0cd9c71d00ad94391d7bf2bc771`, snapshot `2026-11-22`), mapping `AO-1`–`AO-16` to `#118`–`#133` and `M5`–`M8`, listing explicit trust-model and UI exclusions, and recording battle-scar hardening test targets drawn from `agent-orchestrator` issues and PRs, each linked in the note.
  - List `agent-orchestrator.md` in `docs/patterns/README.md`.

## Scope

- Affected files/configs/docs: `docs/patterns/agent-orchestrator.md` (new), `docs/patterns/README.md` (two entries), `docs/patterns/agent-workbenches.md` with its own record `agent-workbench-patterns`, and this record (`risk.md` and `proof.md`).
- Controlled items touched: pattern note (design input) and pattern index.
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes/no: no.
- Dependency/model/API/prompt/tool permission changed? yes/no: no.
- Release or rollback posture changed? yes/no: no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | The note misstates an `agent-orchestrator` pattern or its Control Rod target. Nothing reads pattern notes at runtime. |
| Reversibility | Instant: revert the commit. |
| Detectability | High. Every pattern cites source files/lines and maps to tracked issues (`#118`–`#133`) or board slices (`M5`–`M8`). |
| Exposure | Repository documentation only. |
| Uncertainty | Low to moderate: summarizes a pinned snapshot (`7c65ce3cfc0fc0cd9c71d00ad94391d7bf2bc771`) without running upstream code; every citation is a file and line range at that public commit. |
| Why Quick is enough | Docs-only design input; no trust surface, contract, dependency, runtime path, or public assurance claim changes. |

## Required proof

- Command/check/eval to run: five checks.
  - `python3 tools/check_originality.py` (with new files staged so `git ls-files` scans them);
  - `python3 tools/check_public_claims.py`;
  - `git diff --check`;
  - `git diff origin/main --stat -- .github/workflows policies tests/redteam spec kernel docs/adr`;
  - the pinned `ng.py validate --strict-custody` run by the CI `change-records` job.
- Expected result: one per check.
  - `originality check passed`;
  - `public claims check passed`;
  - `git diff --check` prints no whitespace or conflict-marker errors (empty output, exit 0);
  - trust-surface diff is empty;
  - `OK: .nuclear/changes/agent-orchestrator-patterns`.
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the four paths in Scope (`docs/patterns/agent-orchestrator.md`, `docs/patterns/README.md`, `.nuclear/changes/agent-orchestrator-patterns/risk.md`, `.nuclear/changes/agent-orchestrator-patterns/proof.md`).
- Expected result: `git status` shows only those paths.
- Stop condition: any edit under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`, or any failing verification check.

## Escalation check

Move up to Standard if this change modifies code, adds a red-team case, edits a workflow, ADR, policy, spec, or kernel decision function. None of these is in this change.

## Exit criteria

- Every path this change touches is named above and none is a trust surface.
- `check_originality.py`, `check_public_claims.py`, `git diff --check`, trust-surface diff, and `ng.py validate` all pass and their exact outputs are recorded in `proof.md`.

## Required links

[Proof](proof.md), [pattern note](../../../docs/patterns/agent-orchestrator.md), [pattern index](../../../docs/patterns/README.md).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
