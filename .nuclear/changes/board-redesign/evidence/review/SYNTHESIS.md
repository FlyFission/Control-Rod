# Review synthesis: board redesign

Three independent adversarial reviews: [codex.md](codex.md), [grok.md](grok.md), [agy.md](agy.md). Each finding is sorted by the filter in [GOAL.md](../GOAL.md): **Keep** (changes what the board shows, promises or lets a person do), **Park** (needs a kernel, spec major, policy, daemon or ADR change; separate owner decision), **Drop** (no screen consequence). Agreement counts how many reviewers raised it. Claims about the repo were checked against the code before acceptance (noted "verified").

## Keep: changes to the design before the spec

| # | Change | Agreement | Basis |
|---|---|---|---|
| K1 | Remove "Steer now", in-run questions with Answer buttons, and pause or resume from every screen. A running card offers **Stop**; after the turn ends, a note can be attached to a **follow-up run** against a newly frozen revision. | 3 of 3 | ADR 0020: one prompt, print mode, no ACP; "no record may say a run was ACP-gated" (verified) |
| K2 | No dollar cap promise. Show usage only when a run reported it; subscription cost shows "not reported", never $0. A hard limit is shown only as run minutes, and only where a budget is set. | 2 of 3 | `services/api/src/budgets.ts` header: USD tracked only, minutes the only cappable unit (verified) |
| K3 | Signing is disabled while any required check, basis currency or deliverable integrity fails. Accept with findings appears only where the kernel allows it, collects the reason, and is labeled as accepted with findings, not as passed. The button states what is signed in the words the API already uses (`subjectOf`), never "the document digest". | 3 of 3 | `kernel/src/transition.rs` basis rule; `work.ts` `subjectOf` (Grok, Codex cite lines) |
| K4 | **Status is derived, never dragged** (workbench spec principle P6). Columns follow kernel states in plain words (for example Draft, Running, Agent check, Person verifies, Needs signature, Accepted). Drag only reorders within a column. Moving across columns is a command through a Move to menu; a refusal shows the kernel's sentence. | 3 of 3 | Ontology design P6; current `apps/web/src/lib/board.ts` already projects kernel rungs |
| K5 | Independence wording matches what the server enforces: everyone who originated the work (capture, edits, preparation) is excluded from person verification, not only "the requester". Grade and lane show on the card. When no eligible second person exists, the card says so plainly ("needs a second qualified person") instead of offering a disabled button. | 3 of 3 | `person-verification.ts` `originators()` (verified) |
| K6 | Card face is a small fixed core: kind, title, state, grade, owner and agent, and the **next lawful human act**. Everything else lives in the card view or an optional face setting. | 2 of 3 | Research 06 card-face verdict; overloaded mock faces |
| K7 | Color: the owner asked for gentle kind color, so it stays, but only as a third channel next to the kind icon and word; kind hues are picked away from status hues (Antigravity found document green on Done green, code blue on an avatar). Meaning colors (needs you, blocked, independent check, signed) are fixed, always paired with a word or icon, and never reused by a lens. Lens palettes are chosen to avoid those hues. All text meets 4.5:1 in every look; visible focus ring; real buttons; keyboard paths. The default view can never hide unsigned independent-check cards. | 3 of 3 | Grok measured collisions and contrast failures in the mock CSS |
| K8 | Every evidence or sandbox claim on screen is derived from the run's record: requested versus achieved isolation, attestation result, and "not established" where the record cannot support a check mark. | 2 of 3 | ADR 0020 conditions; `docs/daemon.md` attestation status |
| K9 | Document review, first cut: Markdown deliverables anchored by source position. DOCX and PDF: open the retained file with its digest, comments in a side list keyed to the output digest and page. No in-file anchors promised yet. | 3 of 3 | Research 07 limits; anchors die on revision |
| K10 | Creation includes repository and base branch for code cards; import from an issue tracker is a first-class path. | 2 of 3 | Research 05 (18 to 26 reactions) |
| K11 | Visual system stays on `apps/web/src/design/tokens.css` and self-hosted fonts; no font CDN. The three looks become token themes. | 1 of 3, agreed | Research 07 font decision |
| K13 | Engineering documents for review: spike a server-side conversion of DOCX to PDF (LibreOffice or Pandoc) so one PDF viewer serves both, always with the original file one click away. Diff viewer: spike @pierre/diffs against react-diff-view before choosing. Drag library only reorders within a column. | 1 of 3, agreed | Antigravity; docx-preview unmaintained |
| K12 | Before the spec is final, run one real code task and one real engineering-document task with the owner and an engineer on a clickable prototype; record where they stall. | 1 of 3, agreed | Codex; tests the strategy instead of asserting it |

## Ledger corrections (Keep)

- S1 "compete on proof" becomes an owner hypothesis, not Strong evidence. Sourced facts stay facts (who shut down, was acquired or folded, and when); the reading of them is labeled judgment. Living parallel-agent tools (Cursor, Claude Code, Codex, Orca, OpenHands, Emdash) are named as the small-team competitive set.
- GitHub's requester-cannot-approve rule is narrower than stated, and as of 2026-10-28 Copilot review approvals can count toward required approvals; drop "unique in the market".
- Regrade: C1 to Moderate, B3 to Moderate (search summary), B7 to Weak, B9 calendar above list. R5 stop is a request plus process-group kill, not a runtime confirmation.
- Add rows: repository and branch at creation, tracker import, status unknown (not "stalled" by guess), grade and lane on the card, card dependencies.
- Open owner decisions are listed, not "none".

## Park: separate owner decisions, not in this spec

| Item | Raised by | Touches |
|---|---|---|
| Live steering, in-run questions, pause and resume | 3 of 3 | ADR 0020 amendment, daemon, ACP |
| Per-card monetary hard cap | 2 of 3 | budgets, policy or kernel; provider pricing |
| Requester, strictness and downgrade rules in the kernel; who may change review strictness | 3 of 3 | `kernel/src/transition.rs`, AGENTS rule 2 |
| Non-waivable check categories (which findings accept-with-findings may never waive) | 2 of 3 | kernel, policy |
| Solo practitioner path for independent-check work | 2 of 3 | owner policy decision |
| Offline evidence export a customer can verify | 2 of 3 | ADR 0009 verifier |
| In-file passage anchors for DOCX and PDF | 3 of 3 | spike that survives a second revision |
| Multi-repo cards, worktree retention and sweep | 2 of 3 | daemon, workspace model |
| Revert workspace to last checkpoint on stop | 1 of 3 | daemon |
| A `paused` run state for quota | 1 of 3 | spec, daemon |

## Drop

- Retitling the strategy to "without SaaS lock-in" (Antigravity): positioning copy, no screen consequence; covered by S1 becoming a hypothesis.
- Specific kernel code shapes proposed by reviewers (for example a `requester_id` field): parked as decisions; the design of the fix belongs to that packet.

## Open owner decisions (needed before the spec)

1. Independent-check work for a solo user: blocked until a second person exists (honest default), or a defined solo path (parked policy; Antigravity proposes a second agent from a different provider plus a recorded single-operator statement).
2. Kind color: keep it as a gentle third channel (owner's request), or drop it to monochrome chips as Antigravity argues.
3. Until the kernel carries strictness, the UI sets it only at creation and records every change as an event shown on the card. Acceptable as an interim?
