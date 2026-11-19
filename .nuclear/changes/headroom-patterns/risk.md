# Quick Risk: Headroom pattern note

## Selected mode

- **Mode:** Quick
- **Why this mode:** docs only, with no trust surface changed. The note records decisions, leaves the owner's questions open, and proposes no kernel, policy, red-team, workflow or spec change.

---

## Change

- Slug: headroom-patterns
- PR / issue: draft PR from branch `claude/focused-noether-n5a59m`
- Owner: Ben Huffer (decision owner); drafted by Claude Code under his instruction to apply the high-confidence lessons from reviewing the Headroom project
- Date: 2026-11-19
- Summary: three edits.
  - Add a pattern note on Headroom (Apache-2.0, commit `53a2521`) and list it in `docs/patterns/README.md`.
  - Add one threat-model row for text an agent or a transcript shaped becoming a standing instruction. It states the controls that exist and names the workspace gap as open.
  - Add a "Not tested" line to the pull request template's Evidence section.

## Scope

- Affected files/configs/docs: `docs/patterns/headroom.md` (new), `docs/patterns/README.md` (one line), `docs/threat-model.md` (one row), `.github/pull_request_template.md` (one line), this record.
- Controlled items touched: a pattern note (design input), the threat model (draft), the PR template.
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
  - The PR template sits under `/.github/`, which CODEOWNERS routes to the maintainer for review. AGENTS.md rule 2 does not list it as a trust surface.
- User-visible behavior changed? yes/no: no (contributors see one more line in the PR template)
- Dependency/model/API/prompt/tool permission changed? yes/no: no
- Release or rollback posture changed? yes/no: no

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | The note misdescribes Headroom or Control Rod, or the threat-model row overstates a control. Nothing reads either at runtime. |
| Reversibility | Instant: revert the commit. |
| Detectability | High. Every row cites a file. An independent read-only review checked the rows against their sources, and its 21 findings are dispositioned in `evidence/review-dispositions.md`. |
| Exposure | Repository docs and the PR template. |
| Uncertainty | Moderate for the note, which describes a third party's files read on one date. Low for the rest. |
| Why Quick is enough | No trust surface, contract, dependency, runtime path or claim about Control Rod's assurance changes. The threat-model row records an open gap rather than claiming a control. |

## Required proof

- Command/check/eval to run: seven checks.
  - a six-word n-gram comparison of the new text against the 17 Headroom files read;
  - an independent read-only review;
  - `python3 tools/check_originality.py`;
  - `python3 tools/check_public_claims.py`;
  - `git diff --check`;
  - `git diff origin/main -- .github/workflows policies tests/redteam spec kernel docs/adr`;
  - `python -I <nuclear-grade>/tools/ng.py validate --strict-custody` on this record.
- Expected result: one per check.
  - no shared six-word run of prose beyond names and the URL;
  - review findings dispositioned;
  - both checkers pass;
  - no diff under the trust surfaces;
  - the record validates.
- Evidence link/location: `proof.md` and `evidence/`.

## Critical-action self-check

- Exact target: the five paths in Scope.
- Expected result: `git status` shows only those paths.
- Stop condition: any edit under a trust surface or `docs/adr/`, or a note sentence that cannot be tied to a file read.

## Escalation check

Move up to Standard if this change adds a red-team case, edits a workflow, ADR, policy or kernel decision function, or is used to justify one. None of these is in this change.

## Exit criteria

- Every path this change touches is named above and none is a trust surface.
- Owner decisions (rows 2, 3, 9 and the workspace gap in the threat-model row) stay open for the owner.

## Required links

[Proof](proof.md), [pattern note](../../../docs/patterns/headroom.md), [review dispositions](evidence/review-dispositions.md), [n-gram check](evidence/ngram-check.txt).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
