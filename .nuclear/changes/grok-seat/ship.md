# Ship: Grok CLI as a confined seat

Release decision: **pending** the live qualification, at most two Codex blind-review rounds (the owner's limit), and the owner's merge decision.

## Signature

Owner (sole maintainer): not yet given.

## Known limits

- The Grok process reads the user's Grok login (it must); see the risk residual.
- Only Grok CLI 1.0.92 is seated; any other build waits for a qualification.
- macOS only. Linux and Windows keep Grok listed and switched off.
- No authoring in a repository checkout and no work that needs network: commands are fenced to the workspace folder with no network.
- Commands cannot read the home folder, so tools installed there (for example under `~/.nvm` or `~/.cargo`) are not available to them.
- Rollback: revert the merge. Grok returns to "found, not supported yet"; no stored data changes shape.
- Monitoring after merge: the first real Grok check on a Mac ends with a verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Grok CLI runs author (outside a checkout), intake and pre-check work on macOS through Control Rod's ACP bridge: Grok under a Seatbelt profile and a host-allowlist proxy, its session limited to the four delegated tools by an allowlist it confirms and a hook the bridge answers, and every command and file access under a second profile derived from the run's policy. It stays refused on every other platform, for checkout authoring and for network work; its pre-checks count with the Grok models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
