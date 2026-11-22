# Control Rod Web Design Specification (`apps/web/DESIGN.md`)

Clean-room design system and interaction contract for the Control Rod web workbench, governing the Board, Review Drawer, Case views (M5–M8), and UI polish (#124).

---

## 1. Visual Thesis & Non-Negotiables

Control Rod is an engineering custody workbench where small teams and sole engineers capture work, supervise AI drafting runs, inspect code diffs and engineering documents, and record passkey-signed decisions. The interface stays calm under load, refuses to fabricate certainty, and keeps human judgment legible at a glance.

1. **Three Looks (A / B / C):**
   - **Look A (Control room, `:root` default):** Charcoal ground (`#0a0a0c`), dark surfaces (`#101012` / `#141416`), Cherenkov cyan accent (`#00f2ff`).
   - **Look B (Drafting table, `[data-look="b"]`):** Warm paper ground (`#f1ece2`), cream panels (`#fffdf8`), drafting ink blue accent (`#1f3a8a`).
   - **Look C (Instrument panel, `[data-look="c"]`):** Cool neutral ground (`#f4f5f7`), crisp white surface (`#ffffff`), high-visibility vermilion accent (`#b83a08`).
   - Until M8 promotes looks globally, `data-look` sits on the board root (`.bd`); the outer shell remains Look A.
2. **WCAG 2.2 AA Contrast Floor (Enforced by Test):**
   - Every text and meaning token (`--accent`, `--needs`, `--waiting`, `--stuck`, `--changed`, `--done`, `--idle`, `--check`, `--kind-code`, `--kind-doc`) MUST meet **>= 4.5:1** on every surface (`--ground`, `--surface`, `--panel`, `--line`) across all three looks (`contrast.test.ts`, `looks-contrast.test.ts`).
   - Primary reading colors (`--text`, `--text-2`, `--muted`) MUST meet **AAA (>= 7:1)** on `--ground`, `--surface`, and `--panel` in all three looks.
   - New CSS rules in feature stylesheets MUST use palette variables from `src/design/tokens.css`, never unmeasured `rgba()`/`hsl()`/8-digit hex fills for text/backgrounds unless explicitly recorded.
3. **Reading-Comfort Floor (`--fs-chip: 11px`):**
   - Readable chrome never drops below `--fs-chip` (`11px`), stepping up through `--fs-label` (`12px`), `--fs-small` (`13px`), `--fs-ui` (`14px`), and explicit `>= 14px` sizes (`type-scale.test.ts`).
   - Font letter-spacing stays at each font's designed default (Inter / JetBrains Mono, self-hosted).
   - Multi-line monospace logs and code previews use `--lh-mono: 1.25`; prose reading columns cap at `--measure: 75ch`.
   - Scene art inside scaled canvases (Office Worlds, Legacy Floor) is exempt only when every datum is also exposed at full reading size in a paired list or card surface.
4. **Symbol + Word Meaning Tokens:**
   - Status meaning is NEVER conveyed by color alone. Every card status line pairs an invariant symbol with its meaning word:
     - `▲ Needs you` (`--needs`)
     - `◆ Independent check` (`--check`, Safety / Material grade)
     - `✕ Blocked` (`--stuck`)
     - `✓` (`--done`, paired with its outcome word such as `Accepted` / `Closed`)
     - `○ Waiting` (`--text-2`)
   - `colorBy` lenses (`kind`, `state`, `agent`, `person`, `none`) paint ONLY the 3px left edge and legend swatches, never meaning hues (`--needs`, `--check`, `--stuck`, `--done`).
5. **6-Column Custody Pipeline (Derived, Never Dragged):**
   - Fixed custody progression: `ready` → `drafting` → `agent-check` → `person-verifies` → `needs-signature` → `reached` (with mode-specific display labels in `MODE_COPY`).
   - Column placement is strictly derived from the work package record, office pre-check state, and person-verification reads. Cards are never dragged across columns.
6. **Office Worlds Preserved:**
   - All 15 Office Worlds (`src/features/office/themes/`) remain intact under their strict SVG contract (`office/contract.test.ts`), opaque plate + outer ring contrast rules, and full-size card/list parity.
7. **Zero-Fabrication Copy & Honest Confidence:**
   - UI copy never invents counts, completion claims, or runtime capabilities.
   - Confidence states (`current`, `last-known`, `unknown`) are surfaced honestly: unread/failed counts read `"unknown"` (never `0`), failed board loads never show empty-state onboarding, stale reads past the 1s refetch grace show `"Last known: ..."`, and unverified Safety/Material work never offers `Accept` (Ruling 16) or hides missing second-person eligibility (O6).

---

## 2. Reference Boundary Rule

Never infer visual rules, spacing, color tokens, or interaction patterns from legacy screens (such as `LegacyFloor.tsx` or pre-redesign table views). Legacy screens remain solely for backwards compatibility or fallback parity; all new UI work in M5–M8 and #124 derives strictly from `apps/web/DESIGN.md`, `apps/web/src/design/tokens.css`, and the automated design-contract suites (`contrast.test.ts`, `looks-contrast.test.ts`, `type-scale.test.ts`, `office/contract.test.ts`).

---

## 3. Shared-List vs. Card Border Discipline

- **Shared Lists, Tables, and Logs** (e.g., `AgentPanel` transcripts, `MoveMenu` lists, `CommandPalette` options, review comment threads, audit record tables):
  - Sit inside a single bordered container (`1px solid var(--line-2)` or `--surface` panel) and separate rows with hairline `1px solid var(--line)` dividers or hover surface fills.
  - Do NOT wrap individual list items in nested bordered cards (`border` + `border-radius` inside a bordered list creates visual noise and double-stacking).
- **Standalone Board & Capture Cards** (`.bd-card`, `.bd-capture`):
  - Paint `--panel` over `--surface` columns (`1px solid var(--line)`), framed by `1px solid var(--line-2)` plus a `3px` left-edge accent (`--kind-code`, `--kind-doc`, or active `edgeColor` lens).
  - Hover changes `border-color` to `--muted` without changing border width, padding, or title wrapping.
  - Secondary card actions (`Move to`, `Retry`) live below `.bd-next` in `.bd-actions`, never inline with `.bd-title` and never hidden behind hover-only CSS, so keyboard reachability never shifts the card title.

---

## 4. Interaction Lifecycle Table

Every board, card, drawer, and review interaction follows six explicit lifecycle states:

| Phase | Contract |
|---|---|
| **Arrive** | Land with focus intact (no unrequested autofocus steals on page load). Counts and cards show `"unknown"` or `"Checking what is next"` until reads settle—never fabricated `0`s or premature `"Accept"`. |
| **Leave untouched** | Pressing `Escape`, blurring a quick-add draft, or closing a drawer without acting leaves server state untouched, preserves typed drafts where safe (Quick Add keeps unsent draft text), and returns focus to the triggering element (`triggerRef`, `opener`). |
| **Begin** | User intent is explicit: `c` (outside fields) opens Quick Add; `Cmd/Ctrl+F` focuses board search while yielding to `BOARD_FIND_YIELDS_TO` (`input`, `textarea`, `select`, `[contenteditable]`, `[role="dialog"]`); `j`/`k` steps across `.bd-title` buttons; clicking a title opens `BoardReviewDrawer` without losing board scroll or lenses. |
| **Active** | Long operations (`busyWith === "sign" \| "stop"`, active runs) disable duplicate submission in the same tick (`inFlight` ref), announce `"Waiting for your passkey"` / `"Sending the stop request"` plainly, and show a spinner ONLY when `shouldSpinStatus(readiness, isActive)` is `true`. Search filtering defers via `useDeferredValue` so typing stays responsive. |
| **Finish** | Confirmed mutations invalidate affected queries and announce settled status in a `role="status"` region (`"Accept recorded."`). Cards move columns only when the refreshed record confirms the new state. |
| **Interrupt** | Stream drops (`stream === "unknown"`), slow refetches (`> REFETCH_GRACE_MS`), or server/network errors immediately revoke live action buttons (`offered` cleared), display `Status unknown since <time>` or `Last known: ...`, and keep local error recovery (`Retry` / `Reconnect`) in place without wiping user context. |

---

## 5. Compositor-Only Looping Animation Rule

- **Allowed properties for looping `@keyframes`:** `transform` and `opacity` ONLY.
- **Forbidden in looping animations:** layout or paint properties (`width`, `height`, `top`, `left`, `margin`, `padding`, `border-width`, `border-color`, `background-color`, `box-shadow`).
- **Mandatory rest hooks:**
  - `@media (prefers-reduced-motion: reduce)` MUST disable (`animation: none`) all looping animations and transitions.
  - Background tabs (`.tab-hidden`) MUST pause (`animation-play-state: paused`) any looping pulse or spinner (`live.ts` `useTabVisible`).
- **One-shot feedback transitions** (e.g., button hover color, focus ring) stay crisp and never alter element geometry.

---

## 6. Honest Capability, Reroute, Refusal & `statusReadiness` Spinner Rules

1. **Honest Capability & Reroute Disclosure:**
   - Never imply live agent steering when runs are one-shot (ADR 0020); state plainly that notes apply to the next run or that stopping ends the current run.
   - If a capability is unavailable, rerouted, or held (e.g., an independent pre-check runtime is missing or held for author-runtime independence), state the actual constraint and the exact owner/checker action required.
2. **Visible, Explainable Refusals:**
   - Refused decisions in `MoveMenu` and `CommandPalette` MUST remain visible and keyboard-focusable (`aria-disabled="true"`), displaying the server's `reason` and `change` guidance rather than disappearing silently.
   - Selecting a refused item sends no network request and surfaces the explanation in the card's `role="alert"` region.
3. **`statusReadiness` Truthful Spinner Rule (`shouldSpinStatus`):**
   - `shouldSpinStatus(readiness, isActive)` returns `true` **only** when `isActive === true` AND `readiness` is `"active"` or `"live"`.
   - Spinners MUST NOT animate beside `"settled"`, `"held"`, `"unknown"`, `"last-known"`, `"blocked"`, or `"connecting"` states—even if an underlying run record still reports `status: "queued"` (e.g., a held pre-check waiting on runtime independence or an active run during a stream drop).

---

## 7. Review QA Rubric (`Blocker / Must fix / Follow-up migration`)

UI changes across M5–M8 and #124 are triaged with three severity tiers:

| Tier | Criteria | Action |
|---|---|---|
| **Blocker** | Breaks a trust invariant or accessibility/design gate: offers `Accept` on unverified Safety/Material work (Ruling 16), drops `O6` block, fabricates `0` or empty-state on unread/error, fails WCAG 2.2 AA / `contrast.test.ts` / `looks-contrast.test.ts`, drops below `--fs-chip: 11px` (`type-scale.test.ts`), breaks Office World SVG contract, or spins beside `held`/`settled`/`unknown`. | Reject merge; fix before PR approval. |
| **Must fix** | Degrades keyboard flow, layout stability, or honesty without violating a hard security gate: shortcut hijacks input/dialog (`BOARD_FIND_YIELDS_TO`), secondary actions shift `.bd-title` or vanish on blur, non-compositor looping `@keyframes`, missing `prefers-reduced-motion` rest, or missing unit test for pure helpers. | Fix within the same PR before merge. |
| **Follow-up migration** | Non-blocking polish or cross-screen alignment intentionally deferred to a later slice (e.g., promoting `data-look` to the outer `Shell` in M8, or migrating a legacy table view to shared-list hairline styling). | Record in the slice's `risk.md` / issue tracker with target slice; do not expand current PR scope silently. |
