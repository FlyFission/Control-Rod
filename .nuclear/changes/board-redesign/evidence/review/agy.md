# Independent Adversarial Review: Control Rod Board Redesign

## Verdict

The proposed board redesign promises to reconcile local-first autonomous coding with rigorous engineering governance, but it collapses upon scrutiny because its governance model is fundamentally disjointed from both its target audience and its underlying execution engine. While advertising a lean tool for solo engineers and small teams, the ledger specifies high-ceremony compliance procedures that dead-end a single user, relies on a client-side role toggle for separation of duties that the Rust kernel does not even validate, and introduces mid-run steering and pause controls that contradict the repository's frozen-run isolation architecture. Compounding these structural defects, the research ledger misrepresents commercial competitor exits to manufacture an artificial dichotomy between proof and parallelism, while selecting unmaintained and high-risk libraries for document markup and virtualized drag-and-drop. The project should not write a specification until its governance claims match its kernel capabilities, its workflow accommodates solo practitioners, and its execution model respects the immutability guarantees of its own sandboxes.

---

## Numbered Findings

### 1. Solo user lockout under independent check governance
* **Severity:** Critical
* **Claim or design element:** Owner decision 1 sets users as "small teams or solo users." Owner decision 3 and ledger row V4 assert: "cards marked 'independent check' can only be approved by someone other than the requester, as a passkey-signed decision."
* **Why it is wrong or risky:** A solo engineer is by definition both requester and approver. Under the rule that an independent check card can only be approved by someone other than the requester, a solo practitioner is physically locked out of completing their own work unless they register a fake identity, create a secondary passkey, or downgrade the card's review strictness. A core safety feature that cannot function for the primary declared user persona turns governance into theater.
* **Evidence:** `./BRIEF.md#L11-L15`, `../00-decision-ledger.md#L59`, and `../mockups/board-v3-card-and-review.html#L251`.
* **Fix:** Define an explicit, audited solo-practitioner clearance protocol. For solo workspaces, allow self-approval only with a mandatory secondary automated verification run from a disjoint model provider, an extended cooldown period, and an explicit cryptographic attestation of single-operator status recorded in the evidence package.

### 2. Phantom separation of duties in the Rust kernel
* **Severity:** Critical
* **Claim or design element:** Ledger row V4 claims separation of duties is "GitHub's rule, made cryptographic" (Strength: Strong, citing 02, 03).
* **Why it is wrong or risky:** The claim is factually false against the current codebase. The Rust kernel's decision function (`decide` in `kernel/src/transition.rs`) inspects only `actor_id`, `actor_kind`, `assertion_verified`, `author_baseline`, and `checker_baseline`. It does not record, track, or compare a human `requester_id` against a human `approver_id`. The check shown in the mockup (`board-v3-card-and-review.html#L246-L252`) is executed entirely in browser JavaScript via `const requester = st.as === "BH";`. Any user can bypass this restriction by sending a direct API request, toggling client state, or signing with any registered passkey on the machine. The kernel will accept the transition because it only checks that the actor is human and the assertion is verified.
* **Evidence:** `/home/flyfission/worktrees/control-rod-signin/kernel/src/transition.rs#L103-L142`, `/home/flyfission/worktrees/control-rod-signin/kernel/src/transition.rs#L167-L182`, and `../mockups/board-v3-card-and-review.html#L246-L252`.
* **Fix:** Add `requester_id: Option<String>` to `Request` in `kernel/src/transition.rs`. Enforce at kernel level that for cards requiring an independent check, `req.action == Action::Accept` or `Action::AcceptWithFindings` must return `ReasonCode::Forbidden` or `ReasonCode::NotIndependent` if `req.actor_id == req.requester_id`.

### 3. Regulatory invalidation by signing off on failing checks
* **Severity:** Critical
* **Claim or design element:** Mockup screen 3 (`board-v3-card-and-review.html#L249-L250`) and screenshot `v3-doc.png` show the "Sign with passkey" button enabled while check "Cited sources at current revision" is failing (red X: "2 relay manual sections are older; see note"), stating: "One check is failing, so signing now also asks you to state why it is acceptable."
* **Why it is wrong or risky:** In regulated engineering (nuclear, aerospace, medical), allowing an operator to override an invalid document citation or failing verification check by typing a brief informal justification into a text field invalidates the entire safety case. Under NQA-1 and ISO 9001, an unverified calculation basis or obsolete reference cannot be signed into a release baseline. In the kernel (`kernel/src/transition.rs#L243-L247`), `AcceptWithFindings` allows transitioning directly to `Accepted` on any failure as long as `reason_given` is true. This degrades "compete on proof" into an advisory checklist that any signer can rubber-stamp.
* **Evidence:** `../mockups/board-v3-card-and-review.html#L249-L250`, `screens/v3-doc.png`, and `/home/flyfission/worktrees/control-rod-signin/kernel/src/transition.rs#L243-L247`.
* **Fix:** Segregate automated check failures into waivable advisory notes versus non-waivable regulatory criteria. For non-waivable gates (such as document citation validity, tool run digest match, and sandbox attestation), fail closed at the kernel level: refuse `AcceptWithFindings` entirely until the discrepancy is resolved in a new revision.

### 4. Architectural conflict between "Steer now" and sandbox isolation
* **Severity:** Critical
* **Claim or design element:** Ledger row R4 specifies messages to a running agent marked "Queue (next turn) or Steer (now)." Mockup `board-v3-card-and-review.html#L175-L176` explains "Steer now: Interrupts the current step."
* **Why it is wrong or risky:** This directly contradicts the repository's core execution and sandbox model. Under ADR 0021 (`0021-native-cli-sandboxes.md`), agent CLIs (Claude Code, Codex) run inside locked bubblewrap (`bwrap`) command sandboxes with network disabled and filesystem write restrictions. The runner executes discrete, isolated tool steps. Injecting an interruption mid-step breaks process isolation, risks leaving modified workspace files in an untracked, half-written state, and invalidates the pre-run isolation attestation. Neither Claude Code nor Codex CLI supports clean mid-tool steering in non-interactive batch invocations.
* **Evidence:** `../00-decision-ledger.md#L46`, `../mockups/board-v3-card-and-review.html#L175-L176`, and `/home/flyfission/worktrees/control-rod-signin/docs/adr/0021-native-cli-sandboxes.md#L14-L38`.
* **Fix:** Eliminate "Steer now" for active commands. Adhere strictly to the discrete turn model: allow messages only to be queued for the subsequent turn boundary, or provide a confirmed hard `Stop` that cancels the execution process and reverts the git working tree to the last clean checkpoint before accepting new human instructions.

### 5. False commercial narrative regarding competitor failures
* **Severity:** Major
* **Claim or design element:** Ledger row S1 asserts: "standalone run-many-agents boards shut down (Vibe Kanban, Terragon, Conductor, Jules, Codex app folded). Every funded survivor sells governance."
* **Why it is wrong or risky:** This claim conflates cloud SaaS hosting economics, platform acquisitions, and vendor product line consolidations to manufacture a false market trend:
  1. Conductor did not fold due to market failure; it was acquired by Meta to integrate its parallel execution technology into Meta Superintelligence Labs.
  2. Vibe Kanban (`BloopAI/vibe-kanban`) sunsetted its cloud-hosted SaaS tier due to free-user cloud infrastructure costs, but its local open-source multi-agent Kanban board remains active and widely used via npm.
  3. Jules was consolidated by Google into Antigravity as part of an internal tooling rollup.
  4. OpenAI merged the Codex desktop application into the unified ChatGPT desktop client Work tabs.
  5. Terragon closed its cloud sandbox service because foundational model providers built native cloud execution, and it subsequently open-sourced its platform under Apache-2.0.
  Small teams and solo developers actively seek parallel local agent execution. Claiming that market demand for multi-agent execution is dead misinforms the product strategy.
* **Evidence:** `../00-decision-ledger.md#L11`, [Conductor Acquisition](https://daily.dev), [Vibe Kanban OSS](https://github.com/BloopAI/vibe-kanban), and [Google Jules Consolidation](https://techradar.com).
* **Fix:** Retitle the strategy to "Local-first governance without SaaS subscription lock-in." Acknowledge that developers demand parallel multi-agent workspaces, but differentiate by offering private, unmetered local execution where evidence and audit trails remain on the user's filesystem rather than trapped in a vendor's hosted cloud.

### 6. Contradiction between Drag-and-Drop and derived status
* **Severity:** Major
* **Claim or design element:** The redesign introduces drag-and-drop columns via `@dnd-kit/core` (ledger row 71 and B2).
* **Why it is wrong or risky:** This violates fundamental principle P6 of the workbench ontology specification (`2026-10-29-workbench-ontology-design.md#L97`): "Status is derived, never dragged." In Control Rod, a card's state represents a verified cryptographic rung (`Draft -> Released -> InWork -> InVerification -> Accepted -> Closed`). A user cannot drag a card into "Done" or "Review" without verified pre-checks, test passes, and passkey assertions. Enabling dragging on a Kanban board creates an expectation of direct manipulation, but any drag operation across columns must either fail closed or trigger complex modal approval prompts, frustrating users who expect standard Kanban interactions.
* **Evidence:** `/home/flyfission/worktrees/control-rod-signin/docs/superpowers/specs/2026-10-29-workbench-ontology-design.md#L97` and `../00-decision-ledger.md#L71`.
* **Fix:** Explicitly define board columns as projections of lifecycle state. Retain drag-and-drop only for intra-column priority sorting within the Backlog. Disallow inter-column dragging; state transitions must occur via explicit action buttons (such as "Release", "Submit for Review", "Review and Sign") that invoke verified backend commands.

### 7. Missing pause/resume state in API contracts and schema
* **Severity:** Major
* **Claim or design element:** Ledger row R1 states: "Pause and resume on provider quota." Ledger row R6 states: "Hard budget stop: Per card cap, enforced."
* **Why it is wrong or risky:** The API contracts and data models in `spec/work.tsp` and `services/api/src/work.ts` do not support paused runs. `RunStatus` contains only `queued`, `running`, `succeeded`, `failed`, `stopped`, and `lost`. When an agent process hits an API quota or a budget ceiling, it cannot pause cleanly: the underlying CLI process either continues polling or terminates. Pausing a bubblewrap-sandboxed CLI process indefinitely consumes host resources, risks session timeouts, and has no representation in the PostgreSQL state store.
* **Evidence:** `../00-decision-ledger.md#L43-L48` and `/home/flyfission/worktrees/control-rod-signin/spec/work.tsp#L62-L71`.
* **Fix:** Formally introduce `paused` into `enum RunStatus` in `spec/work.tsp`. Specify a quota suspension protocol in the runner daemon that terminates the active subprocess after committing a temporary worktree git stash, saves token consumption metrics, and transitions the run to `paused`, allowing a clean resume via a new subprocess invocation once quota resets.

### 8. Accessibility violations and color collision in visual design
* **Severity:** Major
* **Claim or design element:** The visual designs in `board-v2-color-and-lenses.html` use color as a 3px edge strip and a 7% background tint to designate document vs code cards.
* **Why it is wrong or risky:**
  1. A 3px border strip with a 7% color mix (`background: color-mix(in srgb, var(--k) var(--wash), var(--card))`) is completely indistinguishable for users with deuteranopia or protanopia, violating WCAG 2.1 Success Criterion 1.4.1 (Use of Color).
  2. Severe semantic color collision occurs across the entire UI. Green is used simultaneously for "Document" kind (`--doc: #7cc49a`), the "Done" column (`--ok: #5ad08a`), CI passing checks, and diff additions (`.plus`). Blue is used for "Code" kind (`--code: #7aa2ff`), user avatars (`BH`), and active state in Look C. Amber is used for "Needs you" flags and Look A primary buttons. This creates extreme visual confusion.
  3. In Look B (Drafting table), the Newsreader serif font at 15.5px reduces legibility for complex engineering symbols, P&ID revision codes, and error traces, while the drawing grid background adds persistent visual noise.
* **Evidence:** `../mockups/board-v2-color-and-lenses.html#L22-L37`, `../mockups/board-v2-color-and-lenses.html#L80-L82`, and `screens/v2-a.png`.
* **Fix:** Decouple object kind from status coloring. Reserve green exclusively for passing/complete states, amber/orange for required human intervention, and red for failures. Display card kind via high-contrast monochrome text chips and explicit icon tags (for example `[DOC]` or `[CODE]`) rather than color tints. Remove background grid lines on table views to maintain a clean reading canvas.

### 9. Cognitive overload on card faces
* **Severity:** Major
* **Claim or design element:** Card face design during active runs (`board-directions.html#L187-L203`, screens `dir-0`, `dir-1`, `dir-2`).
* **Why it is wrong or risky:** A single active card simultaneously displays: kind icon, document ID, title, "Needs you" callout banner, question text, two action buttons, two user/agent avatars, independent check pill, waiting duration, live pulsating radar animation, latest test command snippet, multi-step progress bar, cost budget bar, cost numbers against ceiling, diff additions/deletions, and elapsed run time. With several cards running concurrently, the board turns into an overwhelming dashboard of conflicting animations, progress bars, and log streams.
* **Evidence:** `../mockups/board-directions.html#L187-L203` and `screens/dir-0.png`.
* **Fix:** Restrict the default card face to four stable elements: ID/Title, assigned agent chip, status pill, and single blocking requirement. Move live sub-second stdout streams, pulsating indicators, and multi-field financial telemetry into an expandable drawer or the card detail inspection pane.

### 10. Dependency unreliability and maintenance decay in selected building blocks
* **Severity:** Major
* **Claim or design element:** Research file 07 recommends `@dnd-kit/core` 6.3.1, `docx-preview` 0.4.1, and `@pierre/diffs` 1.6.4.
* **Why it is wrong or risky:**
  1. `@dnd-kit/core` 6.3.1 has not shipped an update since December 2024. Its active author branch `@dnd-kit/react` is pre-1.0 (v0.5.3) and contains open drag-end target identification bugs (`#1564`). The library has unpatched DOM errors (`#1940 removeChild on Node`) in multi-list setups and documented jitter on variable-height cards (`#2088`).
  2. `docx-preview` is unmaintained (zero issues closed in 90 days) and explicitly fails to render charts (`#57`) and page breaks (`#39`). Presenting a flawed client-side DOCX rendering to an engineer for signed regulatory approval creates severe legal exposure if the rendered text omits tables or formatting present in the underlying Word file.
  3. `@pierre/diffs` was created in late 2025. It introduces a massive 133 kB gzip bundle footprint plus Shiki grammars, and its line-comment anchor stability across agent git revisions remains an unproven spike.
* **Evidence:** `../07-building-blocks.md#L44-L61`, `../07-building-blocks.md#L112-L126`, and `../07-building-blocks.md#L155-L165`.
* **Fix:**
  - Replace client-side `docx-preview` with an asynchronous server-side headless LibreOffice or Pandoc conversion pipeline that renders DOCX files to deterministic PDF, enabling a single, robust `pdfjs-dist` pipeline to review all engineering documents.
  - Defer `@pierre/diffs` in favor of a lean, proven diff viewer like `react-diff-view` (23 kB) until `@pierre/diffs` demonstrates proven comment-anchor stability across revision diffs.
  - Pin `@dnd-kit/core` strictly, bypass virtual list dragging, and ensure the non-drag keyboard move menu is built first.

### 11. Fragility of browser-based PDF text coordinate anchoring
* **Severity:** Minor
* **Claim or design element:** Research file 07 (Pick 5a) proposes: "react-pdf on pdfjs-dist, with our own thin anchor layer. Store each comment as page number, normalized rectangles... and the quoted text with prefix and suffix."
* **Why it is wrong or risky:** Hand-rolling a text-quote coordinate anchoring system over `pdfjs-dist` text layers is notoriously difficult. PDF text layers contain non-standard glyph bounding boxes, font kerning spans, hyphenation splits, and canvas scaling discrepancies across devices. When an agent updates a calculation sheet or SOW and re-renders the PDF, page layouts shift, causing normalized rectangle coordinates to highlight empty space or unrelated paragraphs.
* **Evidence:** `../07-building-blocks.md#L140-L143`.
* **Fix:** Anchor document comments primarily to structural semantic identifiers (such as Section Heading, Paragraph Hash, Table Cell ID) with text-quote fallbacks, rather than raw floating geometric rectangles on the rendered canvas.

### 12. Unrestricted metadata modification of card review strictness
* **Severity:** Minor
* **Claim or design element:** Ledger row C2 introduces per-card review strictness ("light review" vs "independent check").
* **Why it is wrong or risky:** The ledger provides no access control specification for who may change a card's strictness after creation. If the author of a card can toggle the card from "independent check" back to "light review" when a second checker is unavailable, the entire governance gate is rendered meaningless.
* **Evidence:** `../00-decision-ledger.md#L34`.
* **Fix:** Make card review strictness immutable once the card leaves the `Backlog` / `Draft` state. Require an explicit, passkey-signed administrative modification event to downgrade strictness, recorded in the card's audit trail.

---

## Three Mandatory Changes Before Spec Authoring

Before writing any implementation specification or UI code for the board redesign, the following three changes must be made:

1. **Implement true separation of duties in the Rust kernel:**
   Extend `kernel/src/transition.rs` and `spec/records.tsp` to track human requester identities alongside agent baselines. Ensure that the kernel rejects any approval or sign-off where the signer matches the requester on an independent-check card, rather than relying on an easily bypassed browser-side toggle.

2. **Establish a valid solo-engineer verification workflow:**
   Resolve the solo user deadlock. Create an explicit operational mode for single-engineer workspaces that substitutes the secondary human sign-off with an automated, independent pre-check from a disjoint foundation model provider, accompanied by an attestation of single-operator status in the exportable evidence package.

3. **Eliminate mid-step steering and align with batch sandbox isolation:**
   Remove "Steer now" and interactive mid-step messaging from the product design. Maintain fidelity with ADR 0021's bubblewrap sandbox model by restricting human input to queued turn-boundary prompts or hard execution cancellations that revert the workspace to a clean git checkpoint.
