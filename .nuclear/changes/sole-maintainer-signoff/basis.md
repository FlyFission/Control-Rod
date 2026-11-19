# Basis: sole-maintainer sign-off for trust surfaces

**Change slug:** `sole-maintainer-signoff`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-18
**Decision this basis supports:** whether the sole maintainer's recorded yes may stand as the human signature on a trust-surface change while no second maintainer exists.

## Mission / need

`AGENTS.md` rule 2 needs a human signature on any trust-surface change, and `docs/collaboration.md` says the signer must be a maintainer who did not author it, counting the person who prompted an agent as the author. CODEOWNERS names one maintainer, `@FlyFission`, who prompts the agents. So no trust-surface change can be signed as written: the automated reviewers flagged this on #94 and #95 (Codex 4623379171, Copilot 4623390215 and 4623390243), and the open draft #92 (CI job timeouts) is held by the same gap.

Owner instruction, 2026-11-18 9:46 PM ET (2026-11-19 02:46 UTC), in the Claude chat, replying "Yes, draft it" to: "Want me to draft it? It would let your recorded yes count as the sign-off only while you're the sole maintainer, as a draft PR that waits on your merge yes."

## What changes

- `AGENTS.md` rule 2 gains one sentence pointing at the exception.
- `docs/collaboration.md` gains a "Sole-maintainer sign-off" section with five conditions: the maintainer's own words to a question naming the pull request; it covers the pull request as asked; it is recorded by the agent, never signed or initialled for the maintainer; nothing else is waived; it lapses when a second maintainer is added.
- `CONTRIBUTING.md`, the pull request template, the change issue template and the CODEOWNERS header comment name the exception where they state the signer rule.
- `.nuclear/changes/readme-shots-lockdown/ship.md` records the owner's yes to #95, which it had listed as not yet given.

Not changed: which paths are trust surfaces, CODEOWNERS ownership lines, branch protection or any repository setting, any workflow, policy, kernel or spec file.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the sole-maintainer rule and its five conditions are in `AGENTS.md` and `docs/collaboration.md`, no template or CODEOWNERS line contradicts it, the screenshot record shows both owner approvals, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
