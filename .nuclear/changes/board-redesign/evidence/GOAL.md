# Goal anchor: board redesign

**Mode:** Standard. The one fact: this changes what users see and what the screen claims about signatures, checks and evidence.

## The question this work answers

What should Control Rod's board-centered web app look like and do, so a small team (or one engineer) can add work, watch agents draft code and documents, and review and approve the results, using only what the kernel, daemon and API can honestly do today?

## In scope

- The web app (`apps/web`): board as home, card view, code review screen, document review screen, lenses (color by, filters, group by, density, saved views), look and feel.
- Small additive API reads or commands that call existing kernel decisions unchanged.
- Making every on-screen claim match what the system records (wording, checks, signature text, refusals).

## Out of scope (parking lot, each a separate owner decision and packet)

| Item | Why parked | Touches |
|---|---|---|
| Steering a running agent, mid-run questions, pause and resume | Runs are one-shot print mode | ADR 0020, daemon |
| A per-card dollar cap that stops a run | No runtime reports cost; only minutes can be capped | budgets, policies or kernel |
| New separation-of-duty rules (strictness, downgrade, requester in the kernel) | Kernel decision functions | kernel, AGENTS rule 2 |
| Offline evidence export a customer can verify | Verifier not designed | ADR 0009 |
| In-file passage anchors on DOCX and PDF | Needs a spike that survives a second revision | spike first |
| Multi-repo cards, worktree retention | Run and workspace model | daemon |

## Filter for review findings

- **Keep** a finding if it changes what the board shows, promises, or lets a person do.
- **Park** a finding if fixing it needs a kernel, spec major version, policy, daemon or ADR change. It goes to the parking lot with its reviewer and evidence, not into this spec.
- **Drop** a finding that is out of both (general strategy debate with no screen consequence), noting why.

## Not claimed

No compliance, certification, safety or formal verification claim. A signature binds what the kernel binds (`subjectOf`), nothing more.
