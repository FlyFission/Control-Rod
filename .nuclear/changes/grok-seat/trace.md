# Trace: Grok CLI as a confined seat

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| GK-01 Grok runs author (outside a checkout), intake and pre-check work on macOS. | `adapter_grok.go`, bridge | `TestGrokCommandIsTheBridge`, `TestGrokBridgeDrivesOneTurn`; qualification `files` | implemented, live check |
| GK-02 Commands and file access cannot read logins or the home folder, reach the network, or write outside the role's targets. | command profile, `fenced`, terminals | `TestGrokProfiles`, `TestGrokCommandEnv`; qualification `files`, `commands`, `checker` | implemented, live check |
| GK-03 Built-in tools are off. | allowlist, its log check, the hook | `TestGrokBridgeDrivesOneTurn` (hook answers), `TestGrokBridgeFailsClosed/unmapped`; qualification `builtin-tools` | implemented, live check |
| GK-04 The Grok process is fenced. | process profile, proxy, telemetry off, run `HOME` | `TestGrokProfiles`; qualification canaries | implemented, live check |
| GK-05 Only a verified `grok agent ... stdio` starts. | `bridgeExeIndex`, `Apply`, `parseBridgeArgs` | `TestGrokBridgeArgs` | implemented and tested |
| GK-06 Failed or missing results fail the run; only Grok models run. | bridge result line, `TurnEnd`, `ModelAllowed`, `ExitStatusUntrusted` | `TestGrokBridgeFailsClosed`, `TestGrokStreamMissingResultIsAFailure`, `TestGrokVersionLoginAndModels` | implemented and tested |
| GK-07 Only the qualified build is seated; login is read from the first line. | `grokQualifiedVersion`, `grokSignedIn` | `TestGrokVersionLoginAndModels` | implemented and tested |
| GK-08 Work Grok cannot do is not sent to it. | API `HOSTLESS`, `CHECKOUT_AUTHORS`; daemon refusals | `sandbox.test.ts`, `runs.test.ts`, `TestGrokRefusesWhatItCannotConfine` | implemented and tested |
| GK-09 Grok pre-checks count with registered Grok models. | `models.json`, `countedProvider` | `wave2-assurance.test.ts`, `run-attestation.test.ts` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Grok CLI runs author (outside a checkout), intake and pre-check work on macOS through Control Rod's ACP bridge: Grok under a Seatbelt profile and a host-allowlist proxy, its session limited to the four delegated tools by an allowlist it confirms and a hook the bridge answers, and every command and file access under a second profile derived from the run's policy. It stays refused on every other platform, for checkout authoring and for network work; its pre-checks count with the Grok models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
