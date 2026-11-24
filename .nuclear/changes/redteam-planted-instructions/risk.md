# Risk: red-team case for planted instruction files

- **Mode:** Standard
- Execution owner: Claude Code under the owner's instruction of 2026-11-21.
- Decision owner: Ben Huffer. This edits `tests/redteam/catalog.yaml`, a trust surface, so it needs his recorded yes under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).
- Scope: `tests/redteam/catalog.yaml` (one appended case) and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The case's expected behavior commits to a control design the owner has not chosen. | It states the property that must hold (no unapproved load, visible at review, no merge without a person), not a mechanism; the owner's yes covers the wording as asked. | The owner rejects or rewords the expected line. |
| R-02 | A `pending` case is read as a control that exists. | Status stays `pending`; the threat row still says open. | Any doc calling the gap closed on the strength of RT-026. |
| R-03 | The edit disturbs other cases. | Append only; `evidence/catalog-diff.patch` shows one added block; the catalog check passes. | Any changed line outside RT-026. |
| R-04 | Merging on a yes that does not cover the final text. | The yes covers the pull request as asked; a catalog change after it needs a new yes. | A catalog edit pushed after the yes and merged on it. |

## Selected mode

- **Mode:** Standard
- Basis: a trust-surface edit (the headroom-patterns escalation check names adding a red-team case as a reason to move up from Quick); one YAML block; reversible by revert; no code or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 and RS-02 are met: `tests/redteam/catalog.yaml` has RT-026 for the author-workspace instruction-file gap, with status `pending`, the catalog check passes, no other case or trust-surface file changes, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
