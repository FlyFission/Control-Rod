# Verification: agent panel (click-to-talk slice S1)

Evidence status: **pass** on the local toolchain (E-01 to E-03). **Open** for Firefox and WebKit and for the owner's review (E-04).

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | Web suite: 636 tests in 46 files pass, including the 12 new tests in `agent-panel.test.tsx`. Local machine only. | `evidence/web-suite.log` |
| E-02 | pass | Board axe scan (WCAG 2.2 A and AA) clean in looks a, b and c, the existing board scan and the new scan with the drawer and agent panel open on a running card. Chromium only, through a local config that points at the machine's preinstalled Chromium and is not committed; axe finds a subset of accessibility issues. | `evidence/board-axe-chromium.log` |
| E-03 | pass | Web typecheck exits 0. | `evidence/typecheck.log` |
| E-04 | open | Firefox and WebKit runs of the board spec; the owner's review of the branch. | Not executed |

No human independent review has been done yet. The same agent wrote the code and the tests.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Slice S1 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the agent panel open, and the owner has made the merge decision. Nothing here claims that any agent can be talked to: controlled runs stay one prompt (ADR 0020), and the panel says so. No session, message channel or Exploration is added.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
