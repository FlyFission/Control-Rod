# Risk: checker workspace for the run daemon

- **Mode:** Standard
- Execution owner: implementing agent under the Milestone 2 brief (checker workspace).
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow, or spec edit.
- Scope: `daemon/`, `docs/daemon.md`, `packs/general/roles/pre-check.md`, and this packet. The pull request is based on `cursor/adapter-seam-55eb` (pull request #76), which is not merged.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Author or intake launch bytes change while the checker gains flags. | Checker flags and the checker prompt are added only when the run role is `pre-check` and the adapter requires a sandbox. Author golden files are not rewritten. | Any author file under `testdata/launch-golden/` differs from pull request #76. |
| R-02 | The checker still starts where a planted `CLAUDE.md`, `AGENTS.md`, or `.claude` hook is discovered. | Those names are not written at the working directory or its parents inside the job root. The deliverable tree is a sibling. The test walks that chain and does not run the hook. | A discovery hit inside the job root, or the hook marker file exists. |
| R-03 | A pass is recorded after a write outside scratch, a deliverable change, a bad `verification.json`, or a missing mount. | `settleChecker` sets `Counts` only for a schema-valid file with an unchanged tree and no other workspace write. The completion is then failed and the verification is cleared. Mount setup errors before `Start`. | A test where one of those faults still returns a verification or `Counts`. |
| R-04 | Bubblewrap becomes the process the daemon accepts as the verified runtime, or the verified descriptor is lost inside the mount. | `--ro-bind-fd` puts the opened executable back on its own path. `ConfirmSandbox` requires a child whose `/proc/pid/exe` is that file. `Confirm` on the bubblewrap pid fails. | `TestConfirmSandboxSeesTheBubblewrapChild` fails, or the inner argv is still `/proc/self/fd/N`. |
| R-05 | The checker's `HOME` is replaced, or a login file is read or copied. | `AgentEnv` is unchanged. The mount binds `/` and does not set `HOME`. The test requires `HOME` to be the process home and requires provider tokens to be absent. No code path opens a login file. | `HOME` equal to the working directory, or a provider token in the child environment. |
| R-06 | `--safe-mode` is passed and breaks headless login, or it is described as measured when it was not. | The flag is not passed. The record says Claude Code was not installed, so the headless login claim was not run. | A checker argv that contains `--safe-mode`, or evidence that claims a live `--safe-mode` run. |

## Selected mode

- **Mode:** Standard
- Basis: the change alters what a checker process may write and which files it may treat as instructions. Author behavior is claimed unchanged and is checked by the existing golden bytes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
