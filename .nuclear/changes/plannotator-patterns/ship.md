# Ship: Plannotator pattern note

Release decision: **pattern note for owner review; no implementation authorized by this record.**

- **Proposed:** merge the note and this packet as documentation only.
- **Not claimed:** any implemented behavior; any compliance, certification or safety claim; a person's check for copied wording (an agent ran one; see Settled on 2026-11-21); that the PL4 hook works in print-mode runs.
- **Owner decisions requested:**
  1. Accept the note, or return it with changes.
  2. Say who checks it for copied wording, as `docs/patterns/README.md` asks before a pattern file merges.
  3. Pick which items to start. The proposal is PL6 and PL7 first (small, no gate), then PL1 and PL2 on run lease and claim.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each item that starts opens its own change record; watch for one that skips the gate its row names.

## Settled on 2026-11-21

The owner delegated the close-out (D2 in [basis](basis.md)). Each point below is the agent's own choice under that delegation, open to the owner, unless it says otherwise.

1. Note accepted as it stands, with six near-copied phrases reworded (below). Agent's choice under D2.
2. Copied-wording check: run by an agent that did not write the note, not by a person. A six-word n-gram comparison against every text file in Plannotator at the studied commit found 58 shared runs; the longest was an eleven-word run in PL5, taken from Plannotator's `CLAUDE.md`. That sentence and five other phrases were reworded. The 34 runs left are file paths, licence names, a markdown table's column labels and short generic phrases (`evidence/ngram.py`, `evidence/ngram-before.txt`, `evidence/ngram-after.txt`). Plannotator is MIT or Apache-2.0, so no licence rule was at stake; the check keeps the note in our own words. **A person's read is still not done**; the owner accepted that by delegation.
3. Items to start: PL1 to PL8 are started in this pull request. PL9 to PL11 wait for their own change records.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pattern note `docs/patterns/plannotator.md` is complete, each item has a decision, and the owner has reviewed it. No product code is part of this change; no behavior claim is made about Control Rod.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
