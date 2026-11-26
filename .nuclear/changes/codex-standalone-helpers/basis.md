# Basis: A real Codex check completes on macOS

After #228, the owner's Mac ran a Codex pre-check (2026-11-25, R-e0c6c4be). Codex started, signed in and read the task, but every tool call failed with "failed to spawn code-mode host .../controlrod-runtimes-501/<digest>/codex-code-mode-host: host executable was not found". Codex 0.172's standalone install, ~/.codex/packages/standalone/releases/0.172.0-aarch64-apple-darwin/bin/, holds codex, codex-code-mode-host and codex-exec-server. Codex starts the helpers from beside itself. Control Rod staged codex alone, because a native binary on the PATH was treated as a single file. The npm layout was already staged as a tree.

Reproducing the whole check on the owner's Mac outside the app (RunCheck, same sandbox and launch) found two more causes. First, `codex exec --json` (0.171, 0.172) never names the model, so ObservedModelsAllowed refused every Codex check ("the stream named no model"). Codex records the model only in its session rollout (`turn_context` payload.model), which `--ephemeral` suppressed. Second, since #228 a macOS Codex checker used the real ~/.codex, and Codex's startup skill sync there voided checks ("the checker's login instructions or settings changed").

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers is staged with them, and a shared bin folder stays a single file. A macOS Codex checker uses a disposable CODEX_HOME, keeps a refreshed sign-in, and names its model from its session rollout. A real Codex check on the owner's Mac ends with a verdict (TestRealCheckerOnThisMac). Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
