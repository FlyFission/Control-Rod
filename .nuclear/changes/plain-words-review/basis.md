# Basis: A card, the Inbox and Today say what happened in plain words

**Change slug:** `plain-words-review`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-25: "The system we're building is complicated, but the end user experience doesn't have to be", and asked for an adversarial review of the board from the views of many different end users, so that what the app says is impossible to misread. A walk through his live install (board, card drawer, Inbox, Today) found screens that say things that are not true:

- A check that crashed is labelled **Dispute** (twice per row) on the Inbox and Today, as if the checker had disagreed with the work. The row also shows the raw runner error, including a local file path, a sha256 digest, "rev 0", "Signing binds revision 0 ...", two buttons that both open the card, and "You may return, reject."
- The card drawer reads "In verification" while the board column says "Being checked"; "Check result: Not run yet" after three runs and a failed check; "Outputs: 2 of 1 file"; "Who and how: author, standard check" (a role, not an agent); "Signing record: Revision 0"; and "Passkey sign-off" under Light signing, where no passkey is asked.
- A card on the board shows "r0" after its id.

## Proposal

1. `plainItem` (lib/plainError.ts): an attention item whose detail is a failed run is labelled "Did not finish", with `plainError`'s sentence and fix; the runner's text moves under Details. Used by the Inbox and Today.
2. Inbox: one short intro line ("Most urgent first."), one tag, one **Open** button (the exact link stays where an item points somewhere more exact, such as its runs), and id, version, digest, runner text and what signing binds folded under Details. A runtime alert names the agent ("Codex can't take work right now.").
3. Today: the row's tag uses the same words; the digest is left to the Inbox.
4. Card drawer: the header uses the board's column word; Check result says Running or Did not finish from the latest check run; Outputs counts files; Who and how names the agents ("Claude writes, Grok checks"); acceptance reads "You, or your signing settings"; versions count from 1.
5. Board card: no "r0"; "version N" only from the second version; agent icon tooltips say "Claude does the work" and "Grok checks it".

Not changed here, noted for follow-up: Grok and Antigravity still read "Not yet runnable" in the pickers and roster (lib/agents.ts, lib/runtimes.ts) though both run work since #211 and #214; making them runnable changes default seating and belongs with the agent-seating work. The Inbox digest still counts failed runs as "disputes" (server wording).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that did not finish reads "Did not finish" with a plain sentence on the Inbox and Today, never "Dispute"; the runner's own text, the digest and what signing binds sit under Details. The card drawer names its column as the board does, counts files without "2 of 1", says "Did not finish" rather than "Not run yet" after a failed check, names the agents that write and check, and counts versions from 1. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
