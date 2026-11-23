# Risk: skill workflow packs

- **Mode:** Standard, with one trust-surface edit (`spec/`, two optional fields) signed under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).
- Execution owner: Claude Code (controller) in Orchestrator.inc worker session control-rod-16, with Codex and Claude subagents as builders under D3 in [basis](basis.md).
- Decision owner: Ben Huffer.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Upstream text changes under us and steers agents without anyone reading it. | Pinned commits, digests on every generated file, `--check`, a sync report per bump, a person reads each bump. | A pack file that differs from its manifest, or a bump merged without its report. |
| R-02 | A tampered or escaping pack file reaches a brief. | The loader checks realpath containment and the digest of every file it reads; a failure blocks the run before launch. | A test where a tampered file reaches inputs. |
| R-03 | A workflow quietly changes briefs that did not ask for one. | Playbook adds nothing; byte-for-byte tests for Light and Nuclear briefs. | Any playbook brief that differs from before. |
| R-04 | An agent chooses or upgrades its own workflow. | The server stamps intake drafts from the capture's tag and removes agent-written values. | A draft whose workflow came from agent output. |
| R-05 | Upstream skills tell the agent to spawn subagents, push, merge or publish tickets. | Every stage card overrides those steps; the run's sandbox and tool allowlist still bind; ADR 0023 composition between runs. | A run that pushes, merges or publishes. |
| R-06 | A builder's work ships unchecked. | The controller reviews every diff and reruns every test; builders' reports are not evidence on their own. | A claim in this record with no artifact the controller produced or checked. |
| R-07 | The hybrid's name implies the authors endorse it. | Working name; asked before it appears in a release. | The label in a release without that check. |

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; the `spec/` fields are optional and additive.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A package can run under the playbook, Superpowers, Pocock or Pocock Superpowers workflow, chosen per card with a project default and in New work, separate from its context profile. The two upstream packs are generated from pinned commits with digests and a `--check`; the composer puts the right stage card in the intake, author and pre-check briefs and ships the named upstream skills as verified inputs; a run whose pack is missing or tampered never starts; a sync script reports every upstream change for a person to read. Playbook briefs are byte for byte unchanged. The owner's recorded yes for the two `spec/` fields is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
