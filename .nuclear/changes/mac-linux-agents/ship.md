# Ship: agent runs on macOS and native Linux

Release decision: **approved by the owner's recorded yes (see Signature) to merge #96; no release is authorized by this record.**

- **Proposed:** merge the platform change, the `platforms` workflow and this record to `main`.
- **Not claimed:** a live-login check on macOS or native Linux; that the whole app starts on macOS; checker launches qualified on any platform; an independent review by a second person.
- **Decisions:**
  1. Who signs (risk R-05): the owner, as sole maintainer, under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).
  2. Whether a live-login check on a real Mac and a real Ubuntu machine is required before launch, or can follow it: still open, not decided by this sign-off.
  3. Dropping the `CONTROLROD_SEATBELT_QUALIFIED` gate: covered by the owner's yes to merge this pull request as it stood. The gate was a control in `checker-workspace` (risk R-10) for a profile never run on a Mac; it now runs on one in every `platforms` run.

## Signature

| Field | Entry |
|---|---|
| Decision | Approve: merge pull request #96 |
| Question | "Should I merge PR 96, knowing it adds that CI workflow?", after "A new repo rule says your yes only counts as the second reviewer if the question names a trust surface, and PR 96 adds a CI workflow that tests agents on Mac and Linux." Asked in the Claude chat at 2026-11-20 5:54 PM ET (22:54 UTC). The same question, "Should I merge PR 96? It touches a trust surface: it adds a CI workflow that tests agents on Mac and Linux.", was asked in the PR's Claude chat thread at 5:53 PM ET (22:53 UTC) |
| Answer | "Merge PR 96", Ben Huffer, project owner and sole maintainer, in the same Claude chat at 2026-11-20 5:54 PM ET (22:54 UTC). It matches a suggested reply offered with the question, so it may have been sent with one tap. Earlier, at 5:51 PM ET (22:51 UTC), he answered "Yes" in the PR's thread to "Should I merge PR 96?", a question that did not name the trust surface and so is not relied on here |
| Head when asked | c87bd4e (the PR with main merged in); the only file changed after the yes is this `ship.md`, which is not a trust surface |
| Recorded by | The implementing agent, from the chat messages. Ben Huffer did not write this entry, and no signature or initials were typed for him |

## Rollback and monitoring

Rollback: revert the PR. Monitoring: any `platforms` run where a `*_holds_every_boundary` check is false, and any user report of an agent reaching a file outside its workspace on macOS or Linux.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

ML-01 to ML-07 are implemented with CI and local evidence reported as it ran; the signature for the new `platforms` workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
