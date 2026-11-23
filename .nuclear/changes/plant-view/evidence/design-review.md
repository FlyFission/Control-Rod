# Independent review of the plant view plan (v1)

Date: 2026-11-23. The v1 plan was given, without the author's reasoning, to two reviewers from different vendors than each other: the Codex CLI (OpenAI) and a second reviewer (Anthropic). Each was asked for an adversarial review. A third review through the opencode CLI could not run because no provider was signed in on the owner's machine; it remains open.

The reviewers' raw output stayed on the owner's machine; this file records what each found and how the plan answered. Section 15 of the design document is the same list.

Found by both:
- The v1 layout (core inside containment with seats around it) could not fit the seat clearances. Answer: the reactor building holds no seats; bays get their own band; the canvas stays 1200 wide.
- The v1 core and rods could state untrue things (project SCRAMs, drills, partial restarts, missing stop timing, hidden figures in presenting mode, failed loads). Answer: the state table in design section 6, implemented in `plant-instruments.ts` and tested.
- Drop the "first out" annunciator tag. Done.
- Create the change record first. Done.

Codex CLI: walkway graph and queue footprint checks; a full small-screen list; real-page contrast checks; `site` declared in the manifest; plain functional names instead of trust words; one drawing convention, one quiet count line, amber only for exceptions. All taken.

Second reviewer: canvas width 1200 for the minimum zoom; physical security zone terms dropped; quarantine moved outside the fence; nobody seated beside the core; one projection (plan) only; no normal "waiting" annunciator window, and designs checked in light looks; the annunciator replaces the count line rather than adding height; plates are not interactive, so meanings go in `aria-label` and a legend; the bright harness theme counted; README and redirect covered; one warm light on the control room. All taken.
