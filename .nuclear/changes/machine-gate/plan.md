# Plan: machine checks before the model check

**Status:** Proposed. These steps run only after the owner says to build it and answers the questions in [basis](basis.md#questions-for-the-owner).

1. Add optional `paths: string[]` to `PreparationTask` and optional `command: string[]` to `PreparationCheck` in `spec/preparation.tsp`. Add a `MachineGateResult` model (scope outcome, out-of-scope paths, and for each command: check id, argv, exit code, stdout and stderr digests). Regenerate `spec/generated`.
2. Planner brief: ask for `paths` on tasks and `command` on checks where a program can decide the result. Release view: list every command on its own line.
3. After an author round succeeds, run the scope step, then each required check's command once. Store the result as a retained artifact and append `package.machine-gate` with the outcome.
4. On a gate failure, do not queue the pre-check. Turn the failure into findings and send the author back, under the round rule the owner chose.
5. On a gate pass, give the result to the pre-check as an input. Checker brief: the gate covers the listed commands and scope only.
6. Web: a gate line on the card and in the package view, shown before the checker's verdict.
7. Tests: a plan with no paths or commands (unchanged behaviour), scope pass and fail, command pass and fail, argv not passed through a shell, network off in the gate run, and a gate failure counted as a round. Then the API suite, the web suite and typecheck.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).
