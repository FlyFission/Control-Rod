# Quick Risk: XERJ pattern note and CI timeout guard

## Selected mode

- **Mode:** Quick
- **Why this mode:** docs and a new hand-run checker only; nothing in a trust surface is changed. The one trust-surface edit this work motivates (timeouts in `.github/workflows/ci.yml`) is deliberately not made here; it is a proposal in `evidence/` for a maintainer's signature and needs its own Standard record.

---

## Change

- Slug: xerj-patterns-and-timeout-guard
- PR / issue: draft PR from branch `claude/funny-fermi-hls5sp`
- Owner: Ben Huffer (decision owner); drafted by Claude Code under his instruction to copy what adds confident value from the XERJ project after an adversarial review
- Date: 2026-11-06
- Summary: add a pattern note on the XERJ project, add `tools/check_workflow_timeouts.py` with tests (not wired into CI), and record the proposed `timeout-minutes` edit for the maintainer to sign.

## Scope

- Affected files/configs/docs: `docs/patterns/xerj.md` (new), `docs/patterns/README.md` (one line), `tools/check_workflow_timeouts.py` (new), `tools/test_check_workflow_timeouts.py` (new), this record.
- Controlled items touched: a pattern note (design input), a checker script. Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`.
- User-visible behavior changed? yes/no: no
- Dependency/model/API/prompt/tool permission changed? yes/no: no (standard library only)
- Release or rollback posture changed? yes/no: no

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A pattern note misdescribes another project, or the checker passes or fails a workflow wrongly. Neither affects shipped behavior: the checker is run by hand and nothing reads the note at runtime. |
| Reversibility | Instant: delete the files. |
| Detectability | High: the checker has tests, a mutation check, and runs against the real workflow; the note was fact-checked by an independent reviewer. |
| Exposure | Repository docs and a developer script. |
| Uncertainty | Low for the script. Moderate for the note, which describes a third party's documents read on one date. |
| Why Quick is enough | No trust surface, contract, dependency, claim about Control Rod, or runtime path changes. The workflow edit that would matter is excluded and flagged. |

## Required proof

- Command/check/eval to run: `cd tools && python3 -m unittest test_check_workflow_timeouts`; `python3 tools/check_workflow_timeouts.py`; the proposed diff applied to a scratch copy and checked; an n-gram comparison of new text against the XERJ files; an independent read-only review; `python3 tools/check_public_claims.py`; `python -I .ng/tools/ng.py validate --strict-custody` on this record.
- Expected result: tests pass; the checker flags the 7 uncapped jobs in the current `ci.yml` and none in the proposed one; no six-word run shared with XERJ files in prose; review findings dispositioned.
- Evidence link/location: `proof.md` and `evidence/`.

## Critical-action self-check

- Exact target: the five files in Scope. `.github/workflows/ci.yml` is read, never written; the proposal was built on a scratch copy.
- Expected result: `git status` shows no change under `.github/`.
- Stop condition: any edit under a trust surface, or a note sentence that cannot be tied to a source file read.

## Escalation check

Move up to Standard if the checker is wired into CI, the workflow is edited, or the note is used to justify a change to a policy, a kernel decision function or a red-team test. None of these is in this change.

## Exit criteria

- Every path this change touches is named above and none is a trust surface.
- The workflow edit and the CI wiring remain a proposal for a maintainer's signature.

## Required links

[Proof](proof.md), [proposed workflow diff](evidence/ci-timeouts.proposed.diff), [pattern note](../../../docs/patterns/xerj.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
