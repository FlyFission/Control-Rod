# Ship: per-card Context Light / Nuclear toggle

Release decision: **the `spec/` change is approved by the owner's recorded yes (see Signature); merge waits on the owner's ask to merge; no release is authorized by this record.** The change touches `spec/`, a trust surface (AGENTS.md rule 2), signed under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

- **Proposed:** merge the toggle, composer, pack and integration together on the owner's yes.
- **Not claimed:** that budgets cover every brief (four author-run fixtures only); that token counts equal any model's tokenizer; that the trust-surface path rule is applied (no path scope in the contract); an independent review.
- **Left open:** the ADR 0002 question (a discipline pack in the public repository); the two pre-existing register problems in `apps/web/src/lib/kind.ts` and `services/api/src/seals.ts`.

## Signature

| Field | Entry |
|---|---|
| Decision | Approve: the two optional `spec/` fields in pull request #108 (`WorkPackage.context_profile`, `Project.default_context_profile`) |
| Question | "The Light or Nuclear context toggle is built in draft [PR 108](https://github.com/FlyFission/Control-Rod/pull/108). Light briefs stay at about 340 tokens, and Nuclear briefs run 3,200 to 6,400 instead of 20,000. It needs your yes on two new optional fields in the spec, since that's a protected area. Do you approve them?" Asked in the Control Rod Claude project chat at 2026-11-21 10:43 AM ET (15:43 UTC) |
| Answer | "Yes approved", Ben Huffer, project owner and sole maintainer, in reply in the same project chat at 2026-11-21 10:58 AM ET (15:58 UTC) |
| Head when asked | `0ce7b75` |
| Recorded by | The implementing agent, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him |

To be filled only from Ben Huffer's own words, quoted with the question, time and place, as `docs/collaboration.md` says. No signature or initials are typed for him.

## Rollback and monitoring

Rollback: revert the merge; migration 024 adds nullable columns only, so old code runs on the migrated database. Monitoring: `run.context-profile` events with a `problem` field (a Nuclear run whose pack did not load), and the brief budget test failing in CI when a brief grows.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md), [provenance](provenance.md).

## Exit criteria

CT-01 to CT-08 are implemented and tested; Light briefs are byte for byte unchanged; the composer loads the real pack; every measured brief is within its budget; the owner's recorded yes for the `spec/` change is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
