# Basis: Claude checks on a Mac can reach their model (DNS in the sandbox)

On 2026-11-26 three Claude (Haiku) pre-checks on the owner's Mac (R-eadc2a98, R-b0123531, R-96d9be53) each ended after ten api_retry attempts with "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)", so no check ever wrote its verdict. The checker's Seatbelt profile denies every outbound Unix socket, and macOS resolves host names through mDNSResponder's Unix socket. On the same Mac, `sandbox-exec` with the deny alone made curl fail with "Could not resolve host: api.anthropic.com" (exit 6); adding an allow for `/private/var/run/mDNSResponder` returned HTTP 404 (exit 0), the same as curl with no sandbox. The launch qualification never saw this because its scripted provider listens on a loopback IP address, so nothing is looked up. Codex checks escaped it after #228 by running under Codex's own sandbox.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker resolves host names inside its Seatbelt sandbox: the profile still denies every outbound Unix socket except /private/var/run/mDNSResponder. A darwin test resolves a real host name under the profile, a profile test pins the single allow, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
