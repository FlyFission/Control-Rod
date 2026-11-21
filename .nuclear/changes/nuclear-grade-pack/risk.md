# Quick Risk: generated Nuclear-grade pack

## Selected mode

- **Mode:** Quick
- **Why this mode:** new generated content, a generator, a ported counter and their tests. Nothing at runtime reads the pack yet, no trust surface is touched, and the change reverts cleanly.

---

## Change

- Slug: nuclear-grade-pack
- PR / issue: worktree branch, no PR yet
- Owner: Ben Huffer (decision owner); built by Claude Code under the instruction relayed by the coordinating agent in the owner's project thread
- Date: 2026-11-21
- Summary: four parts.
  - `scripts/lib/token-count.mjs`: a JavaScript port of NGCE's deterministic `count_tokens`.
  - `scripts/generate-nuclear-pack.mjs`: writes `packs/nuclear-grade/` from a local NGCE checkout (Core 7 card, six cluster cards, verbatim reference skills, quick/standard/cm templates, LICENSE, manifest with token counts and sha256 digests), and with `--check` fails on any hand edit without needing the checkout.
  - Tests in a new workspace package `scripts/` (`@control-rod/scripts`, `node --test`), so `pnpm -r run test` runs them.
  - License evidence: `THIRD_PARTY_NOTICES.md` row, two rows in `docs/third-party/register.md`, `third_party/licenses/FlyFission__nuclear-grade-context-engineering/`, and [provenance](provenance.md).

## Scope

- Affected files: `scripts/lib/token-count.mjs`, `scripts/generate-nuclear-pack.mjs`, `scripts/package.json`, `scripts/test/`, `packs/nuclear-grade/` (generated), `third_party/licenses/FlyFission__nuclear-grade-context-engineering/` (generated), `THIRD_PARTY_NOTICES.md`, `docs/third-party/register.md`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` (one empty importer), this record.
- Controlled items touched: the borrowed-code register and the workspace list.
  - Not touched: `.github/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `services/api/src`, `apps/web` (`evidence/trust-surface-diff.txt`).
- User-visible behavior changed? yes/no: no. No code loads the pack yet.
- Dependency/model/API/prompt/tool permission changed? yes/no: no new dependency; one new workspace package with none.
- Release or rollback posture changed? yes/no: no

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A card misstates a skill, or a token count differs from NGCE's. Nothing consumes either yet. |
| Reversibility | Instant: revert the commit. |
| Detectability | High. `--check` recompiles every card from the verbatim reference copies and compares digests; the counter is compared with NGCE's own Python function. |
| Exposure | Repository files and the workspace test run. |
| Uncertainty | Low for the copies and digests. The counter differs only on code points newer than Python's Unicode database ([provenance](provenance.md)). Open question for the owner: ADR 0002 says discipline packs live in a private repository; this pack is public MIT content placed in the public repository by instruction. |
| Why Quick is enough | No trust surface, contract, runtime path or assurance claim changes. |

## Required proof

- Command/check/eval to run: `node scripts/generate-nuclear-pack.mjs --check`; `pnpm --filter @control-rod/scripts run test`; `NGCE_EXHAUSTIVE=1 node --test scripts/test/token-count.test.mjs`; `tools/check_register.py`, `check_originality.py`, `check_public_claims.py`, `check_agents_map.py`, `tools/license-gate.mjs`; `git diff --cached --check`; trust-surface diff.
- Expected result: all pass, except register problems that exist without this change; empty trust-surface diff.
- Evidence link/location: [proof](proof.md), `evidence/`.

## Critical-action self-check

- Exact target: the paths in Scope; `/home/claude/ngce` is read only.
- Expected result: `git status` shows only those paths.
- Stop condition: any edit under a trust surface or the paths other agents own.

## Escalation check

Move up to Standard when code starts loading the pack into agent context, or when the pack is used to justify a policy or kernel change. Neither is in this change.

## Exit criteria

- Every path this change touches is named above and none is a trust surface.
- The ADR 0002 question stays open for the owner.

## Required links

[Proof](proof.md), [provenance](provenance.md), [tests](evidence/tests.txt), [checks](evidence/checks.txt), [trust-surface diff](evidence/trust-surface-diff.txt).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
