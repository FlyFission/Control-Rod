# Basis: one SCRAM button with a beacon lamp

**Change slug:** `scram-switch`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24

## Mission / need

The top bar showed a rod gauge plate reading "No SCRAM" beside the SCRAM button. The owner found the pair confusing and asked for one SCRAM button, a small beacon or red light beside it that flashes while SCRAM holds, and a short explanation that says what it does and that work can be resumed.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | One SCRAM button, a light that flashes on SCRAM, a short explainer | "We just need the 'Scram' button ... a beacon or a red light right by it that flashes when you hit scram. And a small infographic by the scram button that says, 'Stops all agent activity.' Or pauses it. That way, it can be resumed." | 2026-11-24, 23:11 UTC, project thread "Simplify the SCRAM button" | The top bar keeps one SCRAM button with a lamp that flashes while SCRAM holds and a short card that says what it does; the copy follows what SCRAM really does (see the next section). | SCRAM behaviour, the banner, the Plant's SCRAM dialog, spec, policies and kernel. |

## What SCRAM really does (copy must match)

`apps/web/src/features/office/Scram.tsx`: a SCRAM stops every running agent in its scope where it stands, holds queued runs, revokes their credentials and quarantines what they report. The way back is a staged restart (everything, one discipline or one package) after review, which the control plane refuses while an outcome is unknown or quarantine is unreviewed. The copy therefore says "stops" and "held until you restart it", not "pause" or "resume anytime".

## Scope

In scope: `apps/web/src/components/ScramSwitch.tsx` and `scram-switch.css` (lamp, button, Restart, hover card), `Shell.tsx` (uses it; the top bar rod plate and its "No SCRAM" label are removed), top bar CSS, and the shell tests. The rod gauge stays on the Plant.

Out of scope: SCRAM behaviour, the banner, the Plant's SCRAM dialog, spec, policies, kernel.

## Exit criteria

One SCRAM button in the top bar; a lamp that is dark when clear, flashes red on a SCRAM, amber on a drill, hatched when unknown, and holds steady under reduced motion; a hover and focus card that says what SCRAM does; a Restart button beside SCRAM while one holds, which opens the banner's review and restart. Web tests and typecheck pass. The owner keeps the merge decision.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
