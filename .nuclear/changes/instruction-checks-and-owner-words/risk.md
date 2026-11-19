# Risk: instruction checks and owner words

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-19 instruction to start PL5 and PL8.
- Decision owner: Ben Huffer. No trust surface changes: no policy, red-team fixture, workflow, `spec/` or kernel file.
- Scope: the files listed in `basis.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A case is read as proof that a text works. | Each case ran once; verification and the harness docstring say so. A failing control showed the texts matter, not that they always hold. | A record that uses one passing run as a gate. |
| R-02 | A failure is blamed on a text when the harness caused it. | The first `AGENTS.md` failure was checked with a probe before being reported. It turned out the daemon's flags kept the instructions out, and the case was rerun in contributor mode. | A finding about a text with no control showing the text was in context. |
| R-03 | Account details reach the public repository through transcripts. | Saved transcripts keep a short allowlist of the opening event and drop rate-limit events; results record both raw and saved digests; a test pins the sanitizer. | A saved transcript with plugins, skills, folders or plan usage in it. |
| R-04 | A case runs where it can change the repository or the operator's files. | Each case runs in a new temp folder outside the repository, which the runner refuses to use if it is inside the checkout; tool lists are limited per case. | A case that writes outside its folder. |
| R-05 | The owner-decision rule is used to put words in the owner's mouth. | Words must be quoted exactly, or the row is marked as the agent's own choice; the rule says never to present an agent's choice as the owner's. | A quoted row whose words the owner did not say. |

## Selected mode

- **Mode:** Standard
- Basis: tooling, documentation and evidence; no gated surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The instruction-check harness and its first cases run against the real CLI with results recorded, the owner-decision rule is in `docs/collaboration.md` with a passing checker, this pull request's records use it, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
