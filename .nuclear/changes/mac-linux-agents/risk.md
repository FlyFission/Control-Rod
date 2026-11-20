# Risk: agent runs on macOS and native Linux

- **Mode:** Standard
- Execution owner: Claude Code under Ben Huffer's 2026-11-19 instruction "Start Mac and Linux".
- Decision owner: a maintainer other than the person who prompted the agent (`docs/collaboration.md`). Not chosen here; see `ship.md`.
- **Trust surface touched: yes.** New workflow `.github/workflows/platforms.yml` (AGENTS rule 2, CODEOWNERS `/.github/`). It is read only (`contents: read`, `persist-credentials: false`) and holds no secret. No policy, red-team fixture, spec version or kernel decision function is touched.
- Signed by the owner's recorded yes under sole-maintainer sign-off (`ship.md`). No independent review by a second person.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A boundary holds on the runner and leaks on a user's machine. | Weakened controls prove the probe sees a leak on each platform; the platform check still refuses any platform not qualified; each preflight still runs per launch. | A reported leak on macOS or native Linux. |
| R-02 | The live-login path differs from the scripted provider on Mac or Linux. | Named as not verified in `verification.md` and `docs/status.md`. | A logged-in launch that reaches a decoy. |
| R-03 | Ubuntu users loosen user namespaces for every program to get past the refusal. | The refusal and `docs/daemon.md` give the narrow AppArmor profile for bubblewrap only. | Docs advising `sysctl kernel.apparmor_restrict_unprivileged_userns=0`. |
| R-04 | macOS minutes cost the project. | The workflow runs only on demand or on a PR that touches the daemon, the qualification or the workflow; the repository is public, so standard runners are free. | The repository going private. |
| R-05 | Independent review cannot be shown on GitHub: CODEOWNERS lists only `@FlyFission`, which opens this PR. | Named in `ship.md` as an open decision. | Merge without a recorded signer. |

## Selected mode

- **Mode:** Standard
- Basis: widens where an already qualified launch is offered, with the same arguments and preflights, and adds a read-only workflow. Reversible by reverting the PR; no schema, contract or persisted data change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

ML-01 to ML-07 are implemented with CI and local evidence reported as it ran; the signature for the new `platforms` workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
