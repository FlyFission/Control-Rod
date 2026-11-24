# Risk: scoped send-back after a failed check

- **Mode:** Standard
- **Status:** Built, for owner review.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture or workflow is edited. The spec change is additive inside API 0.1.
- Scope: `spec/records.tsp` (`Finding`), regenerated `spec/generated`, `services/api` (brief, rework round, event), `apps/web` (card and dispute text), and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A checker narrows the scope until the real fix is impossible, so the author cannot fix it within three rounds. | Drift is reported, not refused, in this version. The checker sees the drift event and the reason. | A package that hits the round cap where every drift event named a file the final fix needed. |
| R-02 | Evidence text from the checker carries planted instructions into the author's brief. | Findings already reach the author as JSON. The new fields go through the same path, so they get whatever handling findings get today. Planted text in findings gets no new check from this change; that stays a gap. The red-team suite is not edited. | A red-team case that passes today and fails after this change. |
| R-03 | The drift comparison misreads a rename or a generated file as drift, and the noise teaches people to ignore it. | Compare by path and sha256 against the previous round's retained outputs only. Paths a pack marks as generated are left out, once a pack can mark them. | Drift events on a round whose only changes are inside the scope. |
| R-04 | Old findings without the new fields break the brief or the web view. | All three fields are optional. A finding without them renders as it does today. | Any existing verification that fails validation after the change. |

## Selected mode

- **Mode:** Standard
- Basis: optional fields, one new event and brief text. No protected surface and no spec major version.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
