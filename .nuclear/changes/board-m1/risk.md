# Risk: board redesign slice M1

- **Mode:** Standard
- Execution owner: Claude Code implementing agents under the controller's task briefs and rulings.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. The spec change is a minor, additive one.
- Scope: `apps/web`, `services/api` (package view and person verification reads), `spec/api.tsp` and its generated outputs, the plan's "M1 as built" note, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The board shows stale state as current after the stream drops or goes quiet. | Resume with ?after= the last frame id; refresh every query on the first frame after a drop; 45 s stall detection; cards read "Status unknown since <time>" and counts read "Last known" (rulings 13, findings 1 to 3). | A card or count that reads as current while the stream is unknown. |
| R-02 | A screen offers Accept on Safety or Material work no person has verified, or on a pass that no longer covers the current work. | One rule, `blockUnverifiedAccept`, in every entry point; `covers_current_subject` from the server (rulings 16, 18). Screen-only until D-4. | Any entry point that offers Accept from server actions alone, or a doc that says the kernel enforces it. |
| R-03 | The O6 line misstates who could verify. | `hasOtherQualified` follows the server's verify rules as far as the web can see; every originator excluded; licence currency named as not checkable (ruling 12). | A blocked or unblocked line that contradicts the server's `admissible` rules on visible fields. |
| R-04 | Additive data widens a scoping gap. | `GET /packages/:id` is gated by the caller's organization (ruling 14). | Another organization's package readable through any M1 route. |
| R-05 | A look breaks contrast. | Looks apply to the board only (ruling 10); contrast computed by script over every text token and surface, `--line` included; axe in three looks. | Any text pair under 4.5:1, or an axe violation on the board. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible behavior and on-screen claims about verification and signing change, with an additive contract change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Rulings: [m1-rulings](m1-rulings.md).

## Exit criteria

Slice M1 is implemented in PR #65 with its tests and evidence retained in this packet, the review findings and controller rulings 1 to 18 are addressed, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned) or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
