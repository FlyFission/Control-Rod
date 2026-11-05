# Risk: Reading comfort in the web app

**Purpose:** Name what this change could get wrong and the least evidence needed before it merges.

**Change slug:** `reading-comfort`
**Owner:** Ben Huffer
**Date:** 2026-11-05
**Lifecycle phase:** Verify
**Status:** Ready for owner review.

---

## Mission anchor

- **Objective:** text in the web app is easier to read for long sessions, and a person reading a live log can hold it still.
- **Success criterion (done when):** web typecheck, tests and build pass; contrast and type-scale guards pass; the pause control is tested; the floor and office pages show no overflow or clipping; no trust surface is edited.
- **Non-goals:** a light theme, a text-size setting, scene art, notifications, anything clinical.

## Risk class

Low. Presentation only, plus one client-side control that changes what the log shows, not what is recorded. No contract, kernel, policy, authorization or evidence behaviour changes.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this quietly get wrong? | A larger size wrapping or clipping a tight control; a paused log hiding a failure. |
| What did checking find? | Contrast already met the bar, so no colour changed. The browser suite showed one failure, a focus-order test, that fails the same way on the unmodified code. |
| What about a paused log hiding something? | Pausing holds only the log text. Run status, errors and actions above it come from the package data, not the log, and keep updating; the bar says how many lines are waiting. A run that finishes while paused keeps its Resume button. |
| What is assumed? | That readers want the larger steps. No user study was run; the report's grade for exact sizes is weak. The steps are tokens so they can be retuned in one place. |

## Affected items

| Item | Type | Why it matters |
|---|---|---|
| Type, measure and line-height tokens and the rules that use them | Presentation | What users read all day. |
| `RunCard` pause control | Client behaviour | Changes what the log shows while paused. |
| `index.html` preload | Asset hint | Requests a font the app already ships; no new host. |
| Contrast and type-scale tests | Tests | Keep the above from regressing. |

## Selected mode

- **Mode:** Standard
- **Why this mode:** every record in this repository uses the six-file packet, and the repository's change-records check requires `proof.md` only for Quick mode. The risk itself is low: presentation plus one client-side display control, fully reversible, no trust surface, contract, kernel, policy or evidence behaviour touched.
- **Why heavier mode is not required:** no runtime decision, data, authorization or irreversible step is touched.

## Required links

- `basis.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- Packet: `.nuclear/changes/reading-comfort/`

## Exit criteria

- The mode is justified.
- Risks, assumptions and evidence duties live in this packet rather than in chat.

## Source-lineage note

Packet structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
