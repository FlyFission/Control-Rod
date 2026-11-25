# Risk: Accepted work opens a draft pull request, and SCRAM is one press

- **Residual: a lane raised during the push.** No lock is held across the network, so a stalled push can never hold up other work (SCRAM included). The lane is read again right before the push and before the pull request, which leaves a window of one push. A lane raise is a person's deliberate act on accepted work; the card then says the branch should be deleted on GitHub if it must not stay.
- **Off by default.** Publishing runs only with CONTROLROD_PUBLISH_PULL_REQUESTS=1 until the follow-up (empty git setup for the push, a lane barrier) is reviewed.
- **Disclosure.** Pushing sends the work to GitHub. Only public and internal lanes go out on their own; proprietary and restricted stay local and the card says so. The push is a draft pull request, never a merge.
- **Credential redirection.** An agent working in the worktree could plant git config to send the owner's GitHub credential elsewhere. The push names `github.com/<repo>` itself, clears every credential helper but `gh`'s, and refuses when local or worktree config sets url, http, credential or include keys. Hooks stay disabled by the hardened defaults.
- **Unwanted files.** Leftover files are committed as the author left them (gitignore applies); Control Rod's run folders are excluded. The pull request is a draft the owner reviews.
- **Duplicate pull requests.** One attempt per package revision, claimed under the events lock.
- **Quick add lane.** A card in a project takes the project's lane, which a person chose; the field states it before Enter. Outside a project the card still waits for a lane.
- **SCRAM without a passkey.** Any active member can stop the organization's work with a press, as before with a passkey. The pull is recorded with who and why, and `signed: false`. A spurious stop costs a signed restart, never lost work. Restarting and reviewing quarantine stay signed.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; pull requests are drafts; no kernel, policy or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card added from the board in a project bound to a GitHub repository gets its own worktree and branch and the project's lane. Once accepted, its work goes out as a draft pull request with no clicks, recorded as events and shown on the card. Restricted lanes, non-GitHub repositories, no-change work and repository configs that could redirect the push open nothing and say why. SCRAM stops with one press; restarting stays signed. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
