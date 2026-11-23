# Risk: machine checks before the model check

- **Mode:** Quick. It moves to Standard when building starts, and to Nuclear if the owner asks for the kernel floor (question 3 in [basis](basis.md#questions-for-the-owner)).
- **Status:** Proposed. Not built.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture or workflow is edited. The spec change is additive inside API 0.1.
- Scope: `spec/preparation.tsp`, regenerated `spec/generated`, `services/api` (gate step, refusal, finding), the daemon's ordinary run path for one extra sandboxed command run (`daemon/internal/runner` only if the existing run path cannot carry it), `apps/web` (gate line on the card), and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A plan's `command` is a way to run arbitrary code on the owner's machine. | The plan is signed by a person at release. Commands are argv only, never passed to a shell. They run in the author's sandbox profile with network off. They run only for packs that declare a runner. | A command that reaches the network or writes outside the run's workspace. |
| R-02 | Planted instructions in a capture make the Planner write a harmful command, and the person signs the plan without reading it. | The release view lists every command on its own line, above the fold. The instruction checks run on plan text. The red-team suite is not edited here; a new red-team case would need the owner's signature. | A release view where a command is hidden behind a toggle. |
| R-03 | A flaky test fails the gate and spends a round, and three flakes send good work to dispute. | The gate records the exit code and output digests, so a flake shows as the same bytes with a different exit code. A gate failure counts as a round only if the owner chooses that (question 1). | Two gate runs on the same bytes with different exit codes and no flake marker on the card. |
| R-04 | The scope check refuses legitimate work when the plan named paths too narrowly. | Scope is checked only when tasks name paths. The refusal names the path and the task list, so the fix is a plan return, not a guess. | A refusal whose message does not name the out-of-scope path. |
| R-05 | The checker treats a passed gate as a pass and stops judging. | The checker brief says the gate covers the listed commands and scope only. Criteria without a command still need the checker's evidence. | A pre-check pass whose criterion results cite only the gate artifact for a criterion with no command. |

## Selected mode

- **Mode:** Quick
- Basis: this record is a proposal and changes no behaviour. When building starts it becomes a Standard packet, because it will add spec fields, a server-side refusal and one sandboxed command run. No protected surface and no spec major version.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
