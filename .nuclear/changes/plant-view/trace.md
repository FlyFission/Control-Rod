# Trace: the Plant view

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | The plant layout is valid: zones nest, regions in their zone, nothing in the reactor, doors on walkways, queues on walkways of their zone, gates connected. | `plant-layout.test.ts` | implemented and tested |
| T-02 | The annunciator has four windows, dark when normal; Waiting on you is `needs_me`; a drill alone never lights SCRAM; missing reads say Loading or Unavailable, never 0. | `plant-instruments.test.ts`; `office-view.test.tsx` | implemented and tested |
| T-03 | The core is lit only while a shown agent works; presenting mode says how many are hidden. | `plant-instruments.test.ts` | implemented and tested |
| T-04 | The rods follow the SCRAMs in force: unknown, withdrawn, inserted (stop claimed only once recorded), bank, drill. | `plant-instruments.test.ts` | implemented and tested |
| T-05 | The view opens on the Plant; office themes are under Advanced; the old storage key is ignored; `/office` redirects to `/plant`. | `office-view.test.tsx`; `places.test.tsx`; `contract.test.ts` | implemented and tested |
| T-06 | Every figure is reachable in the list view, grouped by zone. | `office-view.test.tsx` | implemented and tested |
| T-07 | The plant theme passes the contract validator and the allowlisted SVG check. | `contract.test.ts` | implemented and tested |
| T-08 | Contrast, state shapes, lenses, the worst case of every place filled with every mark, and motion that stops with reduced motion and in a hidden tab hold on the plant at minimum zoom in a real browser. | `e2e/office-harness.spec.ts` | implemented; run on Chromium (E-03) |
| T-09 | The real page reads well at 1440 and 390 wide and with an organization SCRAM in force, after the visual overhaul the owner asked for. | Screenshots (E-05) | captured; owner review open |
| T-11 | Fixes from the Codex blind check of f2539fa (HOLD, no P0 or P1): presenting with every figure hidden never says no agent is working; the live region says clear only on a confirmed dark reading and a window flashes only when it comes on; a project SCRAM claims nothing about other work; a reading that failed or is overdue (three refresh intervals) carries "as of" on the captions and the console status; the annunciator's flash and fades and the flow's fade stop with reduced motion and in a hidden tab, and the harness mounts the annunciator; a queued figure's lane comes from its region's door side, not from where it stands. | `annunciator.test.tsx`; `plant-instruments.test.ts` "stale and hidden readings"; `e2e/office-harness.spec.ts` | implemented and tested |
| T-12 | Fixes from the Codex blind check of f9ef354 (HOLD, no P0 or P1): presenting starting or stopping resets the annunciator's baseline, so no window flashes or is announced for it; a reading is stale after one refresh interval plus 10 s grace, and the empty floor note carries "as of" when stale; a flash cut short by a newer change is cleared, so it never plays again when motion resumes; the harness takes seated or queued from where the fixture placed the figure. | `annunciator.test.tsx`; `plant-instruments.test.ts`; `e2e/office-harness.spec.ts` motion test | implemented and tested |
| T-13 | Fixes from the Codex blind check of f97d401 (HOLD, no P0 or P1): hiding the tab ends a flash, so a quick hide and show never restarts it; the SCRAM note and rod caption count distinct projects, not SCRAM events; the design states the worst case for marking a reading stale (30 s interval, 10 s grace, 10 s check: within 50 s); a baseline reset clears the live region so the next change is announced; list mode shows the empty-floor line once. | `annunciator.test.tsx`; `plant-instruments.test.ts` two SCRAMs on one project; `e2e/office-harness.spec.ts` motion test | implemented and tested |
| T-14 | Fixes from the Codex blind check of df45884 (HOLD, two P2 and one P3): a change that lands while the tab is hidden never arms a flash; a failed refresh keeps the last floor reading drawn, marked "as of", with a note and Try again, and the full error shows only when there is no reading; the harness sets the flash timer to ten minutes, so the motion test proves the hidden tab ended the flash. | `annunciator.test.tsx` hidden tab; `office-view.test.tsx` "a failed refresh"; `e2e/office-harness.spec.ts` motion test | implemented and tested |
| T-15 | Fixes from the Codex blind check of 8648b81 (HOLD, two P2 and one P3): the list states each agent's marks in words, as the drawing does; below 1024 px container width the list shows whatever was picked and the drawing cannot be picked, and the pick returns when the drawing fits; list mode hides the folded-work banner and Show everyone. | `office-view.test.tsx` "lists the same marks" and the resize test | implemented and tested |
| T-10 | Switching between the Plant and an archived theme keeps every figure's element (the console frame keeps one element tree). | `e2e/office-harness.spec.ts` "a theme switch keeps selection" | implemented; run on Chromium (E-03) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
