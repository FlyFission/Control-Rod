# Risk: A passed check counts on a fresh install, and the pull request push finds the GitHub sign-in

- **Harness registration without a pin.** A probe row is recorded from the daemon's signed-in claim, and the attestation is signed by the enrolled daemon key. A party that holds the daemon token could report a probe and sign a check. That party could already run checks, so no new actor gains anything. An administrator's pin restores strict matching for that runtime.
- **Token in an environment variable.** The token goes only to the git child processes of the push, never into arguments or logs. git's helper reads it as `gh` would.
- No trust surface is touched (no kernel decision function, policy, spec or workflow). This relaxes counting for unpinned runtimes, and is called out for the owner.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

With no live pin for a runtime, the server counts a check whose attested executable digest has a passing probe for that runtime, the daemon's own rule; with a pin, only pinned digests count. The pull request push gets the GitHub token read with the person's own environment. Authors are told not to commit. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
