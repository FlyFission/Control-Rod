# Ship: red-team case for planted instruction files

Release decision: **pending the owner's recorded yes (see Signature) to merge this pull request; no release is authorized by this record.**

- **Proposed:** merge to `main` on the owner's yes. RT-026 stays `pending` until a component enforces it and a test turns it `active`.
- **Not claimed:** that the gap is closed. The threat-model row still says open; RT-026 records what must fail once a control exists.
- **Follow-up:** once #102 and this change are both on `main`, the threat-model row's "No red-team case yet" should name RT-026 (`docs/threat-model.md` is not a trust surface).
- **Not changed:** any other case, any workflow, policy, kernel, spec or daemon file, or any repository setting.

## Signature

| Field | Entry |
|---|---|
| Decision | Not yet given |
| Question | Not yet asked |
| Answer | Not yet given |
| Head when asked | Not yet asked |
| Recorded by | The implementing agent will fill this from the owner's own message. No signature or initials will be typed for Ben Huffer |

## Rollback and monitoring

Rollback: revert the merge. Monitoring: RT-026 marked `active` without a test that enforces it, or a doc calling the gap closed on the strength of this case.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 and RS-02 are met: `tests/redteam/catalog.yaml` has RT-026 for the author-workspace instruction-file gap, with status `pending`, the catalog check passes, no other case or trust-surface file changes, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
