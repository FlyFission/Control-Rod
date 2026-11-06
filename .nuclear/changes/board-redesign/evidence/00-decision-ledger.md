# Control Rod board: decision ledger (revision 2)

Date: 2026-11-06. Revision 2 applies the three adversarial reviews ([review/SYNTHESIS.md](review/SYNTHESIS.md)) and the owner's decisions, inside the scope set by [GOAL.md](GOAL.md). Revision 1 is in git history of this folder's copy in the spec packet.

Strength: **Strong** means several products converged and user demand or failure reports back it. **Moderate** means two or three products, or demand without convergence. **Weak** means one product or an inference. **Ours** means no market evidence; it follows from Control Rod's own rules. **Hypothesis** means an owner bet to be tested, not evidence.

## Owner decisions (fixed)

| # | Decision | Date |
|---|---|---|
| O1 | Users: the owner and his engineers; small teams or one engineer. Agents draft, people review. | 2026-11-05 |
| O2 | Output kinds: a real mix of code and documents. | 2026-11-05 |
| O3 | Review strictness per card: light review by default; independent check where the card asks for it. | 2026-11-05 |
| O4 | Build approach A: rebuild the web app around the board; kernel, sandbox, attestation and records stay. | 2026-11-05 |
| O5 | Keep the lenses: color by, filters, group by, density, look switch. | 2026-11-06 |
| O6 | Independent-check work with no eligible second person is blocked, and the card says so plainly. No solo path in this spec. | 2026-11-06 |
| O7 | Kind color stays as a gentle third signal beside the kind icon and word; hues chosen away from status hues. | 2026-11-06 |
| O8 | Strictness is set at creation and locked once work starts; the screen offers no change after that, and any change made another way is shown on the card. Kernel enforcement is parked. | 2026-11-06 |

## Strategy

| # | Decision | Default | Strength | Source |
|---|---|---|---|---|
| S1 | What we compete on | Owner hypothesis: small teams will choose a board where every result shows what ran, under what isolation, and who accepted it. Facts behind it: Vibe Kanban's company closed (the open project continues), Terragon closed, Conductor was acquired by Meta, Jules is folding into Antigravity, the Codex app moved into ChatGPT. Living parallel-agent tools (Cursor, Claude Code, Codex, Orca, OpenHands, Emdash) are the small-team competitive set. Test with K12 before relying on it. | Hypothesis | 03, reviews |
| S2 | Account requirement | No cloud account for local use. Local identity is the passkey membership Control Rod already has. | Moderate | 05 |
| S3 | Evidence the customer keeps | Parked: a verifiable export needs the ADR 0009 verifier. | Parked | reviews |

## The board

| # | Decision | Default | Strength | Source |
|---|---|---|---|---|
| B1 | Home screen | The board. "Needs you" is a filter over office items that already exist. Office stays as a secondary view. | Moderate | 01, 05, 06 |
| B2 | Columns | The kernel's real steps, named plainly: Ready, Drafting, Agent check, Person verifies, Needs signature, Accepted (current code says "Reached next rung"). Status is derived, never dragged (workbench spec P6). | Ours, Strong in the repo | ontology P6, `lib/board.ts` |
| B3 | Moving a card | Drag reorders within a column only. Moving across columns is a command from a Move to menu or the card's action button; a refusal shows the kernel's sentence. | Strong (menu), Ours (refusal) | 06, 07, P6 |
| B4 | Swimlanes | Group by kind, person or project. | Strong | 06 |
| B5 | Blocked | Shown when the system records a cause (waiting cause, hold, missing qualification, no eligible checker), always with its reason. Card dependencies are a later row. | Moderate | 01, 06 |
| B6 | Limits | The Drafting column shows running agents against the configured parallel limit. It is information, not an override; going past the limit is not offered. | Ours | reviews |
| B7 | Time in column | Shown as a plain duration; no aging colors yet. | Weak | 01, 06 |
| B8 | Board health | Later. | Weak | 01 |
| B9 | Other views | Calendar first, then list and table. Filters apply in every view. | Moderate | 06 |
| B10 | Default view | Can never hide cards waiting on an independent check or a signature. Saved views may filter; the default may not. | Ours | 01 pattern 17, reviews |

## Cards

| # | Decision | Default | Strength | Source |
|---|---|---|---|---|
| C1 | Quick add | Inline title-only add at the top of Ready; Enter chains; draft survives blur; pasted lines offer one card per line; a new card stays visible under a filter. | Moderate | 06 |
| C2 | Full create | Title, instructions, project, output kind, agent, review strictness (locked after start, O8). Code cards add repository and base branch. Import from an issue tracker is a first-class path. | Strong (fields, import), Ours (strictness) | 05 |
| C3 | Owner versus agent | A person owns the card; the agent works on it. | Strong | 02, 03 |
| C4 | Card face | Small fixed core: kind icon and word, title, state, grade, owner and agent, and the next thing a person must do (or why the card is waiting). Live detail lives in the card view. | Moderate | 06, reviews |
| C5 | Kind color | Gentle hue on the edge and label, never the only signal (O7). Code blue, documents teal; status hues are green (accepted), amber (needs you), magenta (independent check), red (failing). | Ours | O7, reviews |
| C6 | Meaning colors | Fixed and never reused by a lens; always with a word. | Ours | reviews |

## Running work

| # | Decision | Default | Strength | Source |
|---|---|---|---|---|
| R1 | Starting | Explicit Start (release) on the card. No auto start in this spec. | Strong | 05 |
| R2 | Plan first | The existing preparation and basis flow, shown as the card's Plan tab. | Ours | repo |
| R3 | While running | The card view shows the run's recorded events: actions, files, tests, and the sandbox attestation result. No in-run questions (ADR 0020). | Ours | ADR 0020 |
| R4 | Talking to the agent | A note attached to a follow-up run after the turn ends. No live steering (parked). | Ours | ADR 0020 |
| R5 | Stop | A stop request; the daemon ends the process group and the card shows the recorded outcome, including "outcome unknown". | Ours | `docs/daemon.md` |
| R6 | Usage | Show tokens and time when the run reported them; subscription cost shows "not reported". A minutes budget, where set, refuses the next dispatch. | Ours | `budgets.ts` |
| R7 | Retry with another agent | A new run on the same card, history kept, two-up compare later. | Weak | 05 |

## Review

| # | Decision | Default | Strength | Source |
|---|---|---|---|---|
| V1 | Code review | Diff with line comments batched into one follow-up run; "since last review" view; approve, open pull request, or return. Diff viewer chosen by spike (K13). | Strong (pattern) | 05, 03 |
| V2 | Document review | Markdown: comments anchored by source position. DOCX and PDF: open the retained file with its digest; comments in a side list keyed to file digest and page. Spike DOCX to PDF conversion on the server (K13). | Moderate | 07, reviews |
| V3 | Before acceptance | One checklist of what blocks the next step, taken from the kernel's own reasons. Signing is disabled while a required check, basis currency or deliverable integrity fails. Accept with findings appears only where the kernel allows it, collects the reason, and is labeled as such. | Ours | kernel, reviews |
| V4 | Who may verify | Everyone who originated the work (capture, edits, preparation) is excluded, as the server already enforces. When nobody eligible exists, the card says "needs a second qualified person" (O6). | Ours | `person-verification.ts` |
| V5 | What a signature binds | The sign panel states the decision, outcome, revision and subject digest in the API's own words (`subjectOf`), and nothing more. No "document digest", no "evidence exportable" until S3. | Ours | `work.ts`, reviews |
| V6 | Agent pre-review | Shown to the reviewer as advice, grouped by confidence; never replaces a person. | Moderate | 03 |
| V7 | Every gate shows its buttons | No human gate without its action in place. | Strong | 05 |

## Must not happen

A screen that promises what the record cannot show (steering, a dollar stop, a passed check that did not run, an attestation that was not observed); forced login; lost work after restart; stale status shown as current ("status unknown" instead); last-save-wins overwrites; a default view hiding signature or check work; color as the only signal; permanent delete.

## Building blocks (spikes before adoption)

| Need | Candidate | License | Gate |
|---|---|---|---|
| In-column reorder and keyboard move | @dnd-kit/core and sortable; Move to menu first | MIT | Spike with a long column |
| Primitives | Base UI with our tokens | MIT | Palette spike, screen reader pass |
| Code diff and comments | @pierre/diffs versus react-diff-view | Apache-2.0, MIT | Comment survives a follow-up revision |
| PDF | react-pdf on pdfjs-dist | MIT, Apache-2.0 | Side-list comments keyed to page |
| DOCX | Server-side conversion to PDF (LibreOffice or Pandoc) versus docx-preview | MPL-2.0 tool, not shipped code; Apache-2.0 | Representative calc and SOW files render faithfully |
| Markdown | react-markdown source positions (already in the app) | MIT | none |
| Virtual lists | @tanstack/react-virtual | MIT | Only if a column exceeds a few hundred cards |
| Motion | CSS and View Transitions; reduced motion honored | n/a | none |
| Toasts, icons | sonner, lucide-react | MIT, ISC | none |
| Fonts | Inter and JetBrains Mono, self-hosted; no font CDN | OFL | none |

## Design skills

Impeccable leads, on `apps/web/src/design/tokens.css` as the source of truth, hooks not installed, telemetry off. Vercel web-design-guidelines from a pinned local copy as critic. Emil Kowalski's skills for motion. Source 04.

## Parked (separate owner decisions)

Live steering and in-run questions (ADR 0020); per-card monetary cap; requester, strictness and downgrade rules in the kernel; non-waivable check categories; solo path for independent checks; verifiable evidence export (ADR 0009); in-file DOCX and PDF anchors; multi-repo cards and worktree retention; a paused run state.

## Validation before the spec is final

K12: one real code task and one real engineering-document task, run by the owner and an engineer on a clickable prototype; record where they stall and what they distrust.
