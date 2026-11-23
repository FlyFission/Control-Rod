# Risk: board attention (rework of #142, #143 and #146)

- **Mode:** Standard
- Execution owner: Claude Code in the Control Rod project thread "Rework the agent-orchestrator PRs", under D1 in [basis](basis.md).
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or `spec/` major version is edited.
- Scope: `apps/web`, one line in `docs/status.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A count or notification claims something waits on the person when it does not, or waits on someone else. | Both read only `GET /inbox` items, the same read as the rail badge; the count shows only after a successful read and drops after a failed refresh. | A test or screen where the title counts `waiting_on_others` or keeps a number after a failed read. |
| R-02 | Notifications interrupt without consent, or announce work that was already waiting. | Off until the person chooses it from the Inbox; permission asked only from that button; the first read is a baseline; only while the tab is hidden. | A notification on page load, without the choice, or while the tab is visible. |
| R-03 | A notification shows a record title or SCRAM reason to the next person at a shared machine. | Notification text is the kind word and a count only; the tab closes its notification on sign-out or a change of person. | Any notification text taken from a record's title or reason. |
| R-04 | `N` or the attention sort promotes a card whose state is unknown. | Both use the card's shown tone, which is "unknown" while the stream is down or a read is last known. | A test where a last-known card is sorted up or focused by `N`. |
| R-05 | A spinner says work is executing when it is only queued or held. | The spinner turns only for a run with status `running`, on a live stream, with current reads. | A test where a queued or held run spins. |
| R-06 | Single-letter keys fire while typing, or `?` opens the list behind a dialog. | `?` and `N` are ignored inside fields and while a dialog or palette is open. | A test where `?` in a field or in New Work opens the list. |
| R-07 | A fallback seat is shown as if the requested model answered. | The run card reads the trace's own `requested_model` and `reported_model`; a difference is flagged; "default" is not called a fallback; a finished run with no reported model says so. | A test where a differing reported model is not flagged. |

## Selected mode

- **Mode:** Standard
- Basis: web-only presentation; reversible by revert; no protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, cards marked Needs you or Blocked sort to the top of their column (live, current reads only), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire only for new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view; `?` opens the shortcut list only when no dialog is open. A run that another model answered shows "Fallback: Answered by X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
