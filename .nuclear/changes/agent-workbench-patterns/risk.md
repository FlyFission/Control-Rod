# Risk: agent workbench patterns and attention signals

- **Mode:** Standard
- Execution owner: Claude Code in Orchestrator.inc worker session control-rod-16, under D1 in [basis](basis.md).
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or `spec/` major version is edited.
- Scope: `docs/patterns/agent-workbenches.md`, `docs/patterns/README.md`, `apps/web` and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A count or notification claims something waits on the person when it does not, or waits on someone else (OV-01). | Both read only `GET /inbox` items, the same read as the rail badge; the count shows only after a successful read and drops after a failed refresh. | A test or a screen where the title counts `waiting_on_others` or keeps a number after a failed read. |
| R-02 | Notifications interrupt without consent, or announce work that was already waiting. | Off until the person chooses it from the Inbox; permission is asked only from that button; the first read is a baseline; only while the tab is hidden; one notification per read, tagged so a later one replaces it. | A notification on page load, without the choice, or while the tab is visible. |
| R-03 | One person's notification choice or list leaks to another on a shared browser. | The choice is stored per person; a change of person resets the baseline. | A test where Dora is notified because of Ben's choice or list. |
| R-04 | A notification states an outcome the record lacks. | The text is the item's kind word and the record's own title. | Any notification text not taken from the item. |
| R-05 | `N` offers a card whose state is unknown as needing the person. | `N` uses the card's shown tone, which is "unknown" while the stream is down or a read is last known. | `N` focusing a card whose tone is unknown. |
| R-06 | Single-letter keys fire while typing. | `?` and `N` are ignored inside fields, like `C`, `J` and `K`. | A test where typing `?` in a field opens the list. |
| R-07 | The note copies wording or code from a source. | Ideas only; a six-word overlap check, with matches reworded (E-03). | A copied sentence, code or configuration found in review. |

## Selected mode

- **Mode:** Standard
- Basis: web-only presentation and a documentation note; reversible by revert; no protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 work in the web app: the tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on and then fire only for new Inbox items while the tab is hidden; `N` on the board moves to the next card marked Needs you or Blocked; `?` opens the shortcut list. The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
