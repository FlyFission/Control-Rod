# Risk: trust agent updates

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A new Codex feature reaches outside the sandbox. | It is switched off for every run, and only after Codex reports it off; a feature that stays on is refused; switch names must look like feature names and cannot be a safe feature. | A run with an unqualified feature reported on. |
| R-02 | A probe lands between building a Codex command and launching it, so the switches differ. | The launch compares its switches with the status for the launched digest and refuses a mismatch. | A launch with switches its artifact's preflight did not find. |
| R-03 | A newer Antigravity adds a tool the seat gate's deny list does not name, or changes the sandbox-bypass field. | Accepted by owner decision (updates trusted). Still in place: Antigravity's print-mode terminal sandbox, the file-tool deny rules, the empty run home, the bypass hook (which refuses any unreadable input), the result check and the before-and-after hashes. Residual: a new tool acting outside the sandbox is not refused until it is added to the gate. | A newer build observed using a tool outside the sandbox. |
| R-04 | A newer Grok changes a tool id, the hook method or the allowlist log line. | Accepted by owner decision. The run still stops unless Grok's log confirms the allowlist; the hook allows only the four bridge tools; Grok and the bridge's tools stay under Seatbelt with Grok's own hosts only. Residual: a changed hook method would leave only the allowlist between a non-client tool and use. | A newer build observed running a tool other than the four. |
| R-05 | An older or unreadable version is seated. | Refused as before, with an "update" or "could not read" reason. | An older build seated. |

## Selected mode

- **Mode:** Standard
- Basis: daemon seating rules; reversible by revert; no wire, spec or trust-surface path changed.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-05 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
