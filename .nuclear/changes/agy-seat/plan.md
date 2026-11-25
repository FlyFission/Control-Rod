# Plan: Antigravity CLI as a confined seat

1. `adapter.go`: an empty `ConfinementGap` means confined on this platform; `workspaceRooter` and `selfConfinedChecker` interfaces.
2. `adapter_agy.go`: print-mode launch, inline settings (`AgySettings`, `agyOutsideDenies`), run home, plan-mode checker, stream parser, `agy models` login check and model list. Refused off macOS, for checkout authoring, for network roles, and without the full tool set.
3. `checker.go`: Antigravity author and intake workspaces in a fresh private folder in `/var/tmp`, removed after the run; no outer mount for a self-confined checker; `GEMINI.md` joins the protected login names.
4. `runtime.go`, `daemon.go`, `check.go`: `HOME` is the run home when one is set; the daemon removes it after the run.
5. `models.json`: the Gemini models Antigravity offers.
6. API: `agy` pinnable, counted, offered by the claim, listed on subscriptions; one list of runnable runtimes and seat orders; checkout authors only on checkout-capable runtimes.
7. Tests, and the live qualification `TestAgyQualification` (darwin, opt-in) run on a Mac.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Antigravity CLI runs author (outside a checkout), intake and pre-check work on macOS under its own terminal sandbox, with file-tool rules, a per-run home and plan-mode checks that Control Rod derives from the run's policy; it stays refused on every other platform and for checkout authoring; its pre-checks count with the Gemini models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
