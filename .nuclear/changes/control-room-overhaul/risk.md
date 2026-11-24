# Risk: Control Room Visual Overhaul

- **Mode:** Standard
- Execution owner: Implementing agent on branch `ui/nuclear-control-room-overhaul`.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow, or `spec/` change. No Board files (`apps/web/src/features/board/*`, `apps/web/src/pages/Board.tsx`, `apps/web/src/lib/board.ts`) are modified.
- Scope: as in [basis](basis.md).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Contrast or legibility regression on dark lit-console surfaces in Look A, or accidental breakage of Look B / Look C tokens. | Enforce WCAG AA/AAA token contrast ratios in `tokens.css`; keep Look B and Look C intact; verify with existing contrast and office-harness browser checks. | Any WCAG contrast failure or broken Look B/C token assertion. |
| R-02 | State meaning carried by color alone, or decorative animations continuing under `prefers-reduced-motion` or in a hidden tab. | Pair every lit annunciator window, switch state, and SCRAM indicator with shape/text cues; gate all animations on reduced-motion and tab visibility rules checked by the office harness. | Any color-only status cue or motion failure in the Playwright harness. |
| R-03 | Shell, Sign-In, Today, or Plant layout breaks at 390px phone width or loses keyboard focus / screen-reader structure. | Test responsive breakpoints down to 390px, keep semantic landmarks and focus rings intact, and preserve the Plant list fallback below container threshold. | Horizontal overflow, clipped controls at 390px, or unreachable keyboard control. |
| R-04 | Visual overhaul accidentally alters runtime behavior, API shapes, Board screens, or protected trust surfaces. | Restrict edits strictly to in-scope `apps/web` visual/presentation files; verify via `git diff --name-only` and full existing Vitest + Playwright suites. | Any diff in `spec/`, Board files, or trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `kernel/`), or any behavioral test regression. |
| R-05 | Richer nuclear console imagery implies physical power/safety measurements or obscures truthful loading/unavailable/stale/SCRAM states. | Keep all captions and labels tied to software work and confirmed API reads; preserve `plant-instruments.ts` pure state logic and guarded SCRAM confirmation behavior. | Any instrument showing unsupported claims, physical units, or obscured SCRAM/hold status. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible visual overhaul across main web screens (`apps/web`); no API, contract, or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Earlier work: [plant-view](../plant-view/basis.md).

## Exit criteria

The control room visual overhaul is implemented within the stated scope boundaries, all existing unit, typecheck, build, and browser/contrast tests pass with recorded outputs and digests in `verification.md`, after-screenshots are captured and reviewed, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, usability validation with real users, or that the visual console represents a real nuclear facility.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
