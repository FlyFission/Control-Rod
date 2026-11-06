# Adversarial review brief: Control Rod board redesign

You are an independent, adversarial reviewer. Your job is to find what is wrong, weak, overclaimed, missing or risky in the proposed redesign below, not to praise it. Be specific and cite files and lines. Read only: do not edit any file, run no build, install nothing.

## The product

Control Rod is a local-first multi-agent workbench. Small engineering teams (or one engineer) put work on a board; AI coding agents (Claude Code, Codex) run each card one shot inside an OS sandbox with a pre-run isolation attestation, under a policy kernel, with human review, passkey-signed decisions and an append-only evidence trail. Agents draft a real mix of code and engineering documents (statements of work, calculations, review memos). Repository rule: no engineering number may be typed by a model; values come from recorded tool runs with digests.

The current code lives at /home/flyfission/worktrees/control-rod-signin (read AGENTS.md, docs/, apps/web/src, services/api/src as needed). The owner found the current web UI ugly, the board read-only, and the product loop unclear. A redesign is proposed around the board.

## Owner decisions (fixed inputs)

1. Users: the owner and his engineers; small teams or solo users. Agents draft, people review.
2. Output kinds: a real mix of code and documents.
3. Review strictness is set per card: light review by default; cards marked "independent check" can only be approved by someone other than the requester, as a passkey-signed decision.
4. Build approach A: rebuild the web app around the board, keeping the kernel, sandbox, attestation and records underneath.
5. The owner likes the interactive color-by, filter and group-by lenses.

## What to review

- ../00-decision-ledger.md : the proposed decisions, each with an evidence strength.
- 01 to 07 in the same folder: the research behind the ledger.
- Mockups (open the HTML or view the screenshots in screens):
  - ../mockups/board-directions.html (three visual looks: screens dir-0, dir-1, dir-2)
  - ../mockups/board-v2-color-and-lenses.html (color by kind, filters, lenses: screens v2-*)
  - ../mockups/board-v3-card-and-review.html (card while running, code review, document review and sign: screens v3-*)

## Attack these questions

1. Strategy. Is "compete on proof, not parallelism" right for small teams, or is it an enterprise story wearing a small-team costume? Is the claim that standalone agent boards are dying supported by the cited sources? Check several citations yourself where you can.
2. Evidence integrity. Does each ledger row's strength match what the research files actually show? Find rows that overclaim, contradict a research file, or rest on one source. Find decisions the evidence supports that the ledger missed.
3. Governance logic. Hunt for holes: separation of duties (can a requester route around it, for example by reassigning ownership or using a second account?); signing while a check is failing; "steer now" versus one-shot runs and the frozen-run model in the repo; budget caps with pause and resume; who may change a card's review strictness after the fact; what the signature binds to (which digest) and whether the mockup's wording promises more than the kernel does.
4. UX. Where will a real engineer get confused or slowed down? Accessibility (color as the only signal, contrast in all three looks, keyboard paths, reduced motion). Does color by kind collide with other meanings? Is the card face overloaded? Is the document review realistic for DOCX and PDF engineering documents?
5. Feasibility against the actual repo. Which proposed features need kernel, spec or protected-surface changes (AGENTS.md rule 2) and therefore owner signatures? Which conflict with existing ADRs or the run model? Estimate which parts are cheap and which are deep.
6. Missing. What would the best competitor have that this lacks, and what would a regulated engineering firm reject on sight?
7. Building blocks. Challenge the picks in 07 (dnd-kit, Base UI, @pierre/diffs, react-pdf, ProseMirror, docx-preview) on license, maintenance and fit.

## Output

Write your review as Markdown. Start with a one-paragraph verdict, then numbered findings, each with: severity (critical, major, minor), the claim or design element, why it is wrong or risky, evidence (file and line, or URL), and a concrete fix. End with the three changes you would insist on before a spec is written. No em dashes or en dashes.
