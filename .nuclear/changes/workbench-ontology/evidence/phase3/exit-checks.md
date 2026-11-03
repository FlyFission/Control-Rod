# Phase 3 exit checks (shell, palette, Inbox, case view)

Run on 2026-11-02 in Chromium (Playwright 1.64.1) against the production build (`vite build` then `vite preview`), with the control plane mocked by recorded fixtures covering every place, the Inbox with a SCRAM hold, a lost run, a gate decision and work waiting on someone else, and the case view of a standard rigor package with a run story. The spec is `apps/web/e2e/phase3-exit.spec.ts`; the command and its raw output are at the end of this file.

## Accessibility (specification Q-8, WCAG 2.2 AA)

- Automated (asserted by the spec): axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) on Inbox, Office, Packages, Registers, Explore, Roster, Usage, Records, Policies, the case view, and the open command palette. First run found one violation (the hidden capture file input had no label and was a second tab stop); fixed by labelling it and taking it out of the tab order. Second run: no violations. The floor scene layer is excluded; its own accessibility is covered by the theme browser suite.
- Keyboard journey: from page load, Tab reaches the skip link, the brand, the palette trigger, Sign out, then every place in order, then the Inbox's actions. Ctrl+K opens the palette with focus in the search field; typing "roster" and Enter navigates there; Escape closes and returns focus (unit tests also cover focus containment, Home and End staying in the field, and refused commands).
- Reflow (WCAG 1.4.10): at 320 CSS pixels wide every place and the case view fit with no horizontal scrolling. Every place was also checked at 390 and 1440 pixels.
- Not done by these checks: a screen reader pass with a real assistive technology (NVDA, VoiceOver) and a browser zoom pass at 200 percent by a person. They remain for the recorded manual pass the specification asks for; the roles and names they depend on are covered by axe and the unit tests.

## Performance (specification Q-10)

- Case view with a run of 1,000 normalized events: the story is on screen 254 ms after navigation in the first run and 195 ms in the recorded run below (budget: first meaningful view under 1.5 s), and showing all 500 steps takes under 90 ms. Long stories render the latest 200 steps first.
- Not measured here: event to screen under 500 ms on the reference machine with the live stream, and the office floor at 60 frames per second with 40 agents (Phase 4, office view). The Inbox reads prepared packages' artifacts to prove their integrity; its speed with many prepared packages is an accepted Medium recorded in the Inbox adjudication, to be measured on the reference workload.

## Browser suites

Chromium and Firefox floor and theme suites pass (20 tests); WebKit is not installed on this machine.

## Command and raw output

```
cd apps/web && PHASE3_BIG=1 pnpm exec playwright test e2e/phase3-exit.spec.ts --project=chromium --reporter=list
AXE no violations
TAB Skip to content > Control Rod > Search or run a commandCtrl K > Sign out > Inbox3 > Office > Packages > Registers > Explore > Roster > Usage > Records > Policies > Open SCRAM commands > Open the runs > Open and decide > Waiting on someone else (1)
PALETTE navigated to /roster
REFLOW all fit
PERF first story view 195 ms; show all 500 steps 88 ms
  4 passed (28.9s)
```
