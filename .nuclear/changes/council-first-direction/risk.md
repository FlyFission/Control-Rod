# Risk: Council-first direction

**Purpose:** Name what this change could get wrong and the least evidence needed before it merges.

**Change slug:** `council-first-direction`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Lifecycle phase:** Verify
**Status:** Ready for owner review.

---

## Mission anchor

- **Objective:** record the owner's direction (the agent table first, simple by default) as ADR 0024, with the scripted user-demand evidence behind it and a pattern note on herdr.
- **Success criterion (done when):** every number in ADR 0024 and the research README is produced by a committed script from recorded inputs; the persona and cross-repo outputs reproduce byte for byte; no trust surface changes; the public-claims and originality checks pass.
- **Trust surface:** `docs/adr/` is a CODEOWNERS path (`.github/CODEOWNERS`, `docs/collaboration.md`), so ADR 0024 stays Proposed until the owner's recorded yes is in the `Signature` table in `ship.md` (ADR 0001, sole-maintainer sign-off). Nothing under AGENTS.md rule 2's list changes.
- **Non-goals:** any app, kernel, policy or spec change; changing kernel or policy code for decisions 6 and 7 (separate signed changes); editing `docs/status.md`, `README.md` or `docs/plan/`.

## Risk class

Low. Documentation, an ADR and analysis scripts. No runtime behaviour changes.

## Selected mode

- **Mode:** Standard
- Basis: the change adds an ADR, which moves a pattern-note change up from Quick.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this quietly get wrong? | Overstating the evidence. The personas are modeled and the weights are judgment; that issue writers lean toward power users is an unmeasured assumption. The ADR and research README say so. |
| Does branch history hold unredacted titles? | Yes. Earlier commits on this branch hold snapshots from before redaction. A squash merge keeps them out of `main`'s history, but `refs/pull/150` keeps them; they are public issue titles from public repositories, and the reviewer accepted this on 2026-11-23. |
| Could a number be typed by a model? | Every count is produced by a committed script from committed inputs, including the issue snapshots, and `reproduce.sh` re-runs them all. The judgment inputs (weights, top 60 codes) are recorded as inputs, not results. |
| Does the herdr note copy text? | It paraphrases the README's feature list in our own words; herdr is Apache-2.0. The originality check passed. |
| Does it decide something the owner has not? | Decisions 1 to 7 follow the owner's messages of 2026-11-22 and 2026-11-23 (basis.md). Their kernel and policy parts are left for signed changes. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Each claim in `trace.md` has a status.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
