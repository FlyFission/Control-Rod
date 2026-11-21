# ADR 0024: Sole-maintainer sign-off for trust surfaces

- Status: Accepted when merged; the sign-off is recorded in `.nuclear/changes/sole-maintainer-review-fixes/ship.md`
- Date: 2026-11-19
- Amends: [ADR 0001](0001-record-decisions.md), "accepted only by a signed commit from a maintainer who did not author it", and `AGENTS.md` rule 2, for the case where only one maintainer exists

## Context
ADR 0001, `AGENTS.md` rule 2 and `docs/collaboration.md` require a maintainer who did not author a trust-surface change to sign it, and count the person who prompted an agent as its author. CODEOWNERS names one maintainer, `@FlyFission`, who prompts the agents. Under those rules no trust-surface change, and no ADR, could ever be signed. The rule text was added in #97; this record makes it a decision, as ADR 0001 asks.

## Decision
While CODEOWNERS names a single maintainer, that maintainer's own recorded yes is the human signature for a trust-surface change or an ADR, on the five conditions in [docs/collaboration.md](../collaboration.md#sole-maintainer-sign-off): the maintainer's own words to a question naming the pull request and each trust surface it changes; covering the pull request as asked; recorded by the agent in the change record's `Signature` table, never signed or initialled for the maintainer; nothing else waived; lapsing when a second maintainer is added.

## Consequences
- Trust-surface work can merge again, with a human yes on every change and an exact record of it.
- There is still no independent review. An agent's mistake reaches `main` if the maintainer misses it, so the conditions keep CI, review threads and record validation in force.
- GitHub shows no approving review from a second account; the record in `ship.md` is the evidence.
- When a second maintainer is added, this record is superseded by the independent rule, and sign-offs already recorded stand.
