# Board redesign: design

- **Date:** 2026-11-06
- **Owner:** Ben Huffer
- **Status:** Approved by the owner 2026-11-06
- **Change record:** `.nuclear/changes/board-redesign/`
- **Research and reviews:** `.nuclear/changes/board-redesign/evidence/` (decision ledger revision 2, seven research files, three adversarial reviews and their synthesis, interactive mockups)

## 1. Intent

The first pilot (2026-11-05) showed that Control Rod's trust machinery works but its web app does not invite use: the board existed (`/board`, `pages/Board.tsx`) but was read-only and reached only through Office, the screens were function first, and how the pieces fit together was unclear. This redesign makes the board the home of the product. A small team, or one engineer, adds work on the board, watches agents draft code and engineering documents, and reviews, verifies and signs the results there.

The aim for this spec is a **minimum viable product** that a second developer can pick up and extend slice by slice. Every slice in section 9 is one pull request that stands alone.

## 2. Goals

1. The board is the home screen, and every card says the next thing a person must do, or why it waits.
2. Adding work is fast: an inline title at the top of Ready.
3. A person can follow a run, stop it, review the output (code or document), return it with comments, verify it, and sign it without leaving the card.
4. One board answers different questions through lenses: kind filter, color by, group by, density, saved views, and three looks.
5. Every claim on screen is something the system recorded. Nothing promises a capability the kernel, daemon or API lacks.
6. It looks designed: restrained, dense, legible, accessible (WCAG 2.2 AA), in all three looks.

## 3. Non-goals and anti-goals

**Non-goals for the MVP (parked as separate owner decisions, see section 11):** live steering of a running agent; questions to the owner during a run; pause and resume; a per-card money cap; new separation-of-duty rules in the kernel; a solo path for independent checks; a verifiable offline evidence export; passage anchors inside DOCX or PDF files; multi-repository cards; a calendar view.

**Anti-goals (a failure even if it works):**
- A screen that says a run was steered, gated, capped, attested or verified when the record does not show it (ADR 0020 condition 4 generalized).
- Dragging a card across columns. Status is derived, never dragged (workbench design P6).
- Color as the only carrier of meaning.
- A default view that hides work waiting on a signature or a person verification.
- Any font, script or asset loaded from a third-party host at runtime.

## 4. Owner decisions (fixed inputs)

| # | Decision |
|---|---|
| O1 | Users are the owner and his engineers: small teams or one engineer. Agents draft, people review. |
| O2 | Outputs are a real mix of code and documents. |
| O3 | Review strictness is per card: light by default, an independent check where the card needs it. |
| O4 | Rebuild the web app around the board; the kernel, daemon, sandbox, attestation and records stay as they are. |
| O5 | Keep the lenses: color by, filters, group by, density, look switch. |
| O6 | Independent-check work with no eligible second person is blocked, and the card says so plainly. |
| O7 | Kind color stays as a gentle third signal beside the kind icon and word. |
| O8 | Strictness is fixed once work starts. |

**How O3 and O8 map onto what exists (no schema change).** The package already carries `grade` (`safety`, `material`, `general-service`). The workbench design (section on person verification) already requires, for Safety and Material work, a person verification by a qualified checker who is neither an originator nor the pre-check runtime. So "independent check" is the grade: Safety or Material means independent check; General service is light review. The grade is set on the draft and becomes fixed at release, which satisfies O8 without a new field. A Return reopens revision N+1 as an editable draft, so the UI also locks grade on any revision after the first; that lock is in the UI only until the parked kernel rule exists, and the spec says so where it shows. Caveat, stated on screen where it matters: the kernel guard that refuses acceptance without a person verification is protected change D-4 and is not yet signed. Until it is, the board shows the step and never claims the kernel enforces D-4. Because the actions endpoint does not require a person verification before it offers acceptance, the board adds a **UI acceptance block**: on Safety or Material work without a passing person verification that covers the current subject, the board and the card view offer no Accept and no Accept with findings, and the next line names the verification requirement. The block is screen only. Other API clients can still accept such work until the kernel guard D-4 is signed, and the spec says so where it shows.

## 5. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| A. Rebuild the web app around the board, keep everything underneath | Most UI work; governance becomes the product instead of a bolt-on | **Chosen** (O4) |
| B. Start from Vibe Kanban's Apache-licensed frontend | Fast board, but it carries the account-gated, workspace-centric model its users left, and the project is unmaintained | Rejected |
| C. Use Linear or GitHub Projects as the board, Control Rod as the engine | No board to build, but evidence lives in a vendor cloud and local or restricted use fails | Rejected for now; import from a tracker is in scope as a way in |

## 6. Design

### 6.1 Places and navigation

The board is `/` (today `/` redirects to `/inbox`). Inbox becomes the board's "Needs you" filter plus the existing digest; its route stays for links. Office, Floor, Packages, Registers, Roster, Usage, Records and Policies stay reachable from the command palette and a compact side menu. Nothing is removed in the MVP; the board simply becomes the front door.

### 6.2 The board

**Columns** are the existing `boardColumn` projection (`apps/web/src/lib/board.ts`), reworked (M1 is a rework of `pages/Board.tsx`, not a new page) and renamed for plain reading: Ready, Drafting, Agent check, Person verifies, Needs signature, Accepted. Closed packages leave the board. Today `in-verification` maps to Agent check or Needs signature only, driven by office items (`preCheckDone`). The MVP adds Person verifies for Safety and Material work whose agent pre-check is recorded and whose person verification is not. Person verifications are recorded objects (`person-verification.recorded`) with no per-package read today, so M1 adds one additive read route (section 7) that returns each verification with the package revision it was recorded against and a server-computed `covers_current_subject` flag, true only when recomputing the verification's signed digest over the package's current subject (outputs, pre-check and author run) reproduces the recorded one. The board treats a pass as verified only when that flag is true, so a changed output or pre-check on the same revision does not count. A failed pre-check (office `dispute`) stays in Agent check with the dispute as its next line.

**Captures** (quick adds not yet drafted into a package) appear at the top of Ready with their own face: "Classify the data lane" until classified, then "Intake drafting" (from the capture's `intake` status) until `GET /captures` lists its `package_ids`, then they become those packages' cards. One capture can yield several packages.

**Moving cards.** Drag reorders within a column only, and only where an order is stored (MVP: none, so no drag at all in the MVP). Changing state happens through the card's primary action button or its **Move to** menu. The menu lists lawful actions, not column names: the decisions from `GET /packages/:id/actions` (release, accept, accept with findings, return, reject), plus Stop when a run is active (the run comes from the package view's `runs`), plus Verify for Safety and Material work, whose standing comes from the person-verification options call because the actions endpoint does not list it. A refused action shows the API's own `reason` and `change` sentences in place on the card.

**Card face** (small, fixed core):
- kind icon and word, with the kind hue on a 3 px edge and a light tint (O7);
- title and identifier;
- owner and agent avatars; grade chip; "Independent check" tag when grade is Safety or Material;
- the **next line**: the first allowed action for the viewer, or the reason the card waits, or "Needs a second qualified person" (O6), derived from `/packages/:id/actions`, office items and run state.

Run detail, usage, diff size and pre-check advice live in the card view, not on the face. Compact density hides the avatars and chips, never the next line.

**Kind** is derived from the package's deliverables: a deliverable whose `type` is in a small code vocabulary (`code`, `patch`, `pull-request`, `change`) is code; anything else is a document. A package with both shows both icons. The vocabulary lives in one web module so it can grow without a contract change.

**Meaning colors and symbols** are fixed across looks and never reused by a lens: needs you (amber, ▲), independent check (magenta, ◆), blocked or refused (red, ✕), accepted (green, ✓). Each always appears with its word. Kind hues: code blue, documents teal.

**Lenses** (state kept in the URL so a view is shareable):
- Kind: All, Code, Documents, with counts.
- Toggles: Needs you, Mine.
- Color by: kind, state, agent, person, none. A legend always states the active lens.
- Group by: none, kind, person, project (swimlanes).
- Density: comfortable, compact.
- Look: A Control room, B Drafting table, C Instrument panel.
- **Saved views**: a named lens state, kept per member (browser storage in the MVP; server persistence later). The **default view may not hide** cards waiting on a person verification or a signature; a filter that would hide them shows a count of what is hidden.

**Header:** project switcher, command palette trigger, "Needs you" count (same as the toggle), a count of running agents (information only; the API does not report the daemon's parallel limit, so none is shown).

### 6.3 Adding work

"+ Add a card" at the top of Ready, and the `C` key, open an inline title field. Enter creates a capture (`POST /captures`) and opens the next field; Escape closes; a typed draft survives losing focus. Pasting several lines offers one capture per line. The new card shows "Classify the data lane" with the lane choices inline (`POST /captures/:id/classify`), because no content leaves the machine before classification (workbench design M-0). Full creation (instructions, project, agent, grade, repository and base branch for code) happens in the package draft the intake agent produces, edited in the card view. Import from an issue tracker is out of the MVP but the capture path is the entry it will use.

### 6.4 The card view

Opening a card opens a full-height view (route `/packages/:id`, replacing today's package page progressively). Header: back to board, kind, identifier, title, state, grade, independent-check tag, and the lawful actions as buttons. Tabs:

- **Activity:** the run's recorded events (`GET /packages/:id/runs/:runId/events`, live over the existing event stream): actions, files, tests, usage, and the sandbox attestation result per claim (observed, refuted, not established). Usage totals the run's usage events (input, output and cached tokens) for the card, since `/usage` is organization wide, using the API's own settlement semantics (the last cumulative event when the runtime reports one, otherwise the steps; a figure is shown only when every counted event carried it; totals are withheld and labeled when events were dropped, when any page of the run's events fails to load, or when the feed is truncated), and shows "cost not reported" because no runtime reports cost; the only hard limit shown is the run time limit and any minutes budget.
- **Plan and basis:** the existing preparation flow.
- **Review:** section 6.5 or 6.6.
- **Evidence:** the existing proof and records views.

**Stop** calls `POST /packages/:id/runs/:runId/stop`; the card shows "Stopping" (the run's `stop_requested_at`) until the final outcome arrives through events, including "outcome unknown" when the daemon could not confirm it. There is no steering: a note box says the run cannot be steered and that a note goes with the return decision for the next run.

### 6.5 Code review

The Review tab for code deliverables shows the agent's changes from the retained outputs (`GET /packages/:id/outputs/*`) as a diff, the agent pre-check as advice grouped by confidence, and a checklist "Before this can be accepted" built from the actions endpoint's reasons. What is diffed: a code deliverable's output includes a patch (`*.patch` or `*.diff`), shown as a diff; without one the tab lists the changed files. Selecting a line adds a draft comment; comments are kept client-side and sent together as the reason text of a **Return** decision (`POST /packages/:id/decisions`). Return closes the revision and opens revision N+1 as an editable draft with no run; the follow-up run starts when someone Releases that draft, a second signed decision. The card says exactly that and offers Release in place. "Since your last review" needs the previous revision's outputs, which M6 reads through the second additive route (section 7). **Accept** opens the passkey prompt; the sign panel states what is bound, in the API's words: decision, package, revision, subject digest, outputs. It also says plainly that signing records acceptance of this revision and does not certify correctness.

### 6.6 Document review

The Review tab for document deliverables shows the retained file with its name, digest and a Download original button. Markdown renders in place with comments anchored by source position. PDF renders with the browser's or pdf.js's viewer; comments are a side list keyed to the file digest and page. DOCX shows the original for download and, where the server conversion spike succeeds (section 10), a PDF rendition labeled as a rendition. Comments are sent together as a Return reason, as for code.

**Verification and signing.** For Safety and Material work, Verify (`/packages/:id/person-verifications/options` then `/person-verifications`) is offered only to a qualified member who did not originate the work, as the server already enforces. The panel states what the verification binds, lists the criteria, and shows hardware-key eligibility where the grade requires an attested key. Verify and Accept are disabled while a required check, basis currency or deliverable integrity fails, with the reason in place. For Safety and Material work, Accept and Accept with findings are also withheld until a passing person verification exists for the current revision (the UI acceptance block of section 4; screen only until D-4 is signed), and every acceptance entry point honors it: the board next line, the Move to menu, the shared decision bar (`DecisionBar`) on the package page and on the `/packages/:id/case` route, the card header buttons and the Review tab. The decision bar is covered from M1, so the retained routes are not left open. Accept with findings appears only when the actions endpoint offers it, collects the reason, and is labeled as accepted with findings.

### 6.7 Visual system

Tokens stay in `apps/web/src/design/tokens.css`; the three looks are token themes (A dark default, B warm paper, C bright). Fonts stay self-hosted (Inter, JetBrains Mono); look B's serif uses a self-hosted face or the system serif, never a font CDN. Every text style meets 4.5:1 in every look and state; focus is always visible; every control is a real button or input; motion respects reduced motion. Impeccable leads the visual pass in refinement mode with hooks not installed and telemetry off; the Vercel web design guidelines (pinned local copy) critique it.

## 7. What is reused, what is new

| Need | Exists | New in the MVP |
|---|---|---|
| Board columns | `lib/board.ts` projection | Person verifies mapping, renames, card face, lenses |
| Next action and refusals | `GET /packages/:id/actions` (ActionDescriptor with reason and change) | Card next line and Move to menu built on it |
| Quick add | `POST /captures`, `/classify` | Inline add, capture card face |
| Run feed and stop | run events, log, stream, stop | Activity tab layout |
| Decisions and signing | `/decisions/options`, `/decisions`, passkey | Return with batched comments, sign panel wording |
| Person verification | `/person-verifications/options`, `/person-verifications` | Verify panel in Review; read route returning each verification with its package revision (joined through its candidate assignment) and `covers_current_subject` |
| Outputs by revision | current revision only | read route for a previous revision's outputs |
| Outputs | `/outputs/*`, proof | Diff view, document viewer |
| Usage | `/usage`, run usage events | Honest usage lines |

No kernel, policy, red-team, workflow or spec major change is needed for the MVP. Two additive read routes are in scope (a minor spec addition, generated types regenerated): person verifications for a package (M1), and a package's outputs by revision (M6). If a slice discovers it needs anything more, it stops and raises it as an owner decision.

## 8. Errors and edge cases

- An action refused by the server shows its reason and change on the card; the card does not move until the event stream confirms a new state.
- Stale stream or lost connection: cards show "status unknown since <time>" instead of their last state, and a reconnect control.
- A run lost by the daemon shows "outcome unknown" and the existing reconcile path.
- Two people editing a draft: the existing ETag (`if-match`) refusal is shown with a reload, never a silent overwrite.
- No eligible verifier: "Needs a second qualified person" (O6), with who is excluded and why.
- An empty board shows how to add the first card and what happens next, not a blank grid.

## 9. MVP slices (one pull request each)

Each slice ships behind no flag, keeps the current pages working, and adds tests (Vitest with MSW for components, the existing Playwright and axe checks for pages).

| Slice | Delivers | Depends on |
|---|---|---|
| M1 Board home | `/` is the board (rework of `pages/Board.tsx`); six columns with Person verifies (with the read route for a package's person verifications); card face with kind, grade, next line from the actions endpoint; meaning colors and symbols; looks A, B, C as token themes; axe clean in all three | none |
| M2 Lenses | Kind filter, Needs you, Mine, color by, group by, density, URL state, saved views in browser storage, default-view guard | M1 |
| M3 Move to and actions | Card action button and Move to menu from ActionDescriptor; refusal shown in place; keyboard path | M1 |
| M4 Quick add | Inline add, chained Enter, paste many, capture card face, inline lane classification | M1 |
| M5 Card view: Activity | Run feed with attestation per claim, honest usage, Stop with recorded outcome, note-to-next-run box | M1, M3 |
| M6 Code review | Patch diff or file list from retained outputs, line comments batched into Return, Release of the returned draft in place, since-last-review (with the read route for a previous revision's outputs), sign panel wording | M5 |
| M7 Document review | Markdown with source-position comments; PDF viewer with page-keyed side comments; Download original; Verify and Accept panels with disabled-while-failing rules | M5, M6 |
| M8 Visual pass | Impeccable refinement pass and critique across M1 to M7; density and motion polish | M1 to M7 |

Spikes that gate parts of M6 and M7, each a throwaway branch with a written result: diff viewer (@pierre/diffs versus react-diff-view, does a comment survive a follow-up revision), PDF page-keyed comments with pdf.js, DOCX to PDF server conversion fidelity on a real SOW and a real calculation.

## 10. Testing and validation

- Unit and component tests for the board projection (including Person verifies), kind derivation, next-line derivation from ActionDescriptor, lens state, and the default-view guard.
- Page tests with MSW for every refusal path, stale stream, lost run and ETag conflict in section 8.
- axe (WCAG 2.2 A and AA) on the board, card view and both review tabs in all three looks; keyboard-only walkthrough of add, move, review, return, verify and accept.
- **Owner validation after M7:** the owner and one engineer each take one real code task and one real engineering-document task through the app; record where they stall and what they distrust; adjust before M8.

## 11. Parked owner decisions

Live steering and in-run questions (ADR 0020 amendment); per-card money cap; requester, grade-change and downgrade rules in the kernel; D-4 kernel guard for person verification (already proposed, unsigned); non-waivable check categories; solo path for independent checks; verifiable evidence export (ADR 0009); in-file DOCX and PDF anchors; multi-repository cards and worktree retention; a paused run state; calendar view; tracker import.

## 12. For a second developer

Start with `AGENTS.md`, then this file, then `.nuclear/changes/board-redesign/evidence/00-decision-ledger.md` for why each choice was made. Open the interactive mockup `evidence/mockups/board-v4-after-review.html` in a browser to see the target. Pick the lowest unclaimed slice in section 9 whose dependencies are merged, open a draft pull request early, and keep each change inside its slice. The web app's API types are generated from `spec/`; do not hand-edit them. If a slice needs anything in section 11, stop and ask the owner.

## 13. Not claimed

This design creates no compliance, certification, safety or formal verification claim. A signature binds what the kernel binds and nothing more.
