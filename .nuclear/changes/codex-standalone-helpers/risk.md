# Risk: Codex's standalone install keeps its helper programs when staged

- **Identity.** The digest now covers the helpers too, so a swapped helper is caught, which it was not before. Unpinned runs use the probe's digest, which goes through the same resolution, so no pin breaks.
- **Scope.** Only a folder holding nothing but codex files is taken in. A shared bin (Homebrew, /usr/local/bin) stays a single file.
- **Model provenance.** On macOS the Codex model now comes from Codex's own session record of the model it ran, not the API. That is stronger than trusting `-m`, weaker than a server-reported model. The agent's commands cannot write that record (outside the workspace and denied by name), but on macOS this rests on Codex's own sandbox.
- **Sign-in.** A refreshed token is written back only when the host file is unchanged, by atomic rename keeping its mode. A crash leaves a copy of auth.json in the work folder until the next check there removes it.
- **Concurrency.** Two checks on the same package revision share a parent folder; the stale-home cleanup could remove the other's home. Unlikely (one check per revision at a time).
- **No trust surface is touched** (kernel decision functions, policies, spec and workflows are unchanged; admission gains one refusal rule).

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers is staged with them, and a shared bin folder stays a single file. A macOS Codex checker uses a disposable CODEX_HOME, keeps a refreshed sign-in, and names its model from its session rollout. A real Codex check on the owner's Mac ends with a verdict (TestRealCheckerOnThisMac). Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
