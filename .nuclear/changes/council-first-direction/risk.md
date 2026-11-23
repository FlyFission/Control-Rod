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
- **Non-goals:** any app, kernel, policy or spec change; amending ADR 0023 (decision 6 is only proposed); editing `docs/status.md`, `README.md` or `docs/plan/`.

## Risk class

Low. Documentation, an ADR and analysis scripts. No runtime behaviour changes.

## Selected mode

- **Mode:** Standard
- Basis: the change adds an ADR, which moves a pattern-note change up from Quick.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this quietly get wrong? | Overstating the evidence. The personas are modeled and the weights are judgment; issue writers are power users. The ADR and research README say so. |
| Could a number be typed by a model? | Every count is in `counts_all.json`, `top60_counts.txt` or `outputs.json`, produced by the committed scripts. The judgment inputs (weights, top 60 codes) are recorded as inputs, not results. |
| Does the herdr note copy text? | It paraphrases the README's feature list in our own words; herdr is Apache-2.0. The originality check passed. |
| Does it decide something the owner has not? | Decisions 1 to 5 follow the owner's messages of 2026-11-22 and 2026-11-23 (basis.md). Decision 6 is marked Proposed. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Each claim in `trace.md` has a status.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
