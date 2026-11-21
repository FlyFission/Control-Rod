# Ship: per-card Context Light / Nuclear toggle

Release decision: **pull request for owner review; no merge or release is authorized by this record.** The change touches `spec/`, a trust surface (AGENTS.md rule 2), so merge waits on Ben Huffer's recorded yes under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off). That yes is **pending**; the Signature table below is unfilled.

- **Proposed:** merge the toggle, composer, pack and integration together on the owner's yes.
- **Not claimed:** that budgets cover every brief (four author-run fixtures only); that token counts equal any model's tokenizer; that the trust-surface path rule is applied (no path scope in the contract); an independent review.
- **Left open:** the ADR 0002 question (a discipline pack in the public repository); the two pre-existing register problems in `apps/web/src/lib/kind.ts` and `services/api/src/seals.ts`.

## Signature

| Field | Entry |
|---|---|
| Decision | pending: Ben Huffer has not yet been asked |
| Question | pending |
| Answer | pending: no yes is recorded |
| Head when asked | pending |
| Recorded by | pending |

To be filled only from Ben Huffer's own words, quoted with the question, time and place, as `docs/collaboration.md` says. No signature or initials are typed for him.

## Rollback and monitoring

Rollback: revert the merge; migration 024 adds nullable columns only, so old code runs on the migrated database. Monitoring: `run.context-profile` events with a `problem` field (a Nuclear run whose pack did not load), and the brief budget test failing in CI when a brief grows.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md), [provenance](provenance.md).

## Exit criteria

CT-01 to CT-08 are implemented and tested; Light briefs are byte for byte unchanged; the composer loads the real pack; every measured brief is within its budget; the owner's recorded yes for the `spec/` change is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
