# Pattern notes: skill workflows (Superpowers, Matt Pocock's skills, and a hybrid)

> **Provenance.** Source-level reading on 2026-11-22 by the authoring agent of each repository's `SKILL.md` files and the Superpowers implementer and reviewer prompt templates, at the pins below. Both are MIT, so the clean-room split is not required (see [README.md](README.md)); this file still carries ideas only, in our own words. Short quoted names are skill names or labels. Nothing here is ported yet.

| Source | License | Pin | Skills read |
|---|---|---|---|
| obra/superpowers | MIT | `22f0b463e7a5e579904dd6211a520321035526f7` | all 15 under `skills/` |
| mattpocock/skills | MIT | `abeeaf95660ba9e8b7c753eb38f441ca707a8823` | the 27 under `skills/engineering/` and `skills/productivity/`; `in-progress/` and `misc/` skipped |

## The decision this note serves

The owner wants these two workflows available in Control Rod the way the Nuclear-grade pack is, and kept current with upstream. Settled with the owner on 2026-11-22:

- **One workflow per card, never stacked.** Their plan formats, review steps and test rules disagree, and stacked they exceed any brief budget.
- **A workflow is a different axis from the Nuclear-grade discipline.** Light or Nuclear says how much evidence and decision discipline a run carries; the workflow says how the work is sequenced. A card has one of each.
- **Separate workflows or a hybrid are both acceptable.** This note proposes all three: two faithful packs, and a hybrid that takes each stage from whichever upstream does it better.

## How each upstream sequences work

**Superpowers.** Brainstorm a design with the person until they approve it; write a plan of small tasks, each naming its files, signatures and tests; run a fresh implementer per task, then a task review (does it match the plan, is the code sound); one last pass over everything the branch changed; then decide how to integrate the branch. Test-first is mandatory throughout, with a strict rule that code written before its test is thrown away. Every completion claim needs fresh command output.

**Matt Pocock.** Interview the person relentlessly about the idea, writing the glossary and ADRs as answers settle; if the work spans sessions, write the discussion up as a spec and split that into thin end-to-end tickets that each name what blocks them; build each ticket test-first in thin vertical slices; review the diff on two axes, the repo's written standards and the spec it came from; shape the PR body; finish with a retro that improves the agents' environment rather than the code.

Both are clean chains in which each stage hands a file to the next. That is what makes them portable.

## What has to change to run them in Control Rod

| Conflict | Upstream does | Control Rod rule | Port |
|---|---|---|---|
| C1 | One session spawns its own implementer and reviewer sub-agents (Superpowers' per-task loop; Pocock's parallel `implement-spec`, and `code-review`'s two reviewers). | Specialists compose between runs in the control plane, never as sub-agents inside a counted run (ADR 0023, decision 5). | Each stage becomes its own role run, cast and recorded. The control plane does the dispatching the skill describes. This is what "one agent per section" means here. |
| C2 | The first stage is a live interview (Superpowers' brainstorming; Pocock's grilling, `grill-with-docs` and `wayfinder`). | Runs are one-shot print-mode runs; no one can answer mid-run (ADR 0020). | The interview moves into guided preparation, where the person answers in the web app. An agent run may draft questions; they become records the person answers (Kandev P06). |
| C3 | The agent makes or removes worktrees, merges or pushes the branch, and publishes specs and tickets to the tracker. | The daemon owns worktrees; a person accepts; a push is a recorded run, never an agent's own decision (G-04); only the controller publishes to GitHub. | Dropped. Accept and the planned "Open pull request" run take their place. |
| C4 | Reviewers are the same model in the same session as the controller. | The pre-check runs on an independent runtime and never sees the author's transcript. | Reviewer stages are cast as pre-check roles under the existing independence rules. |
| C5 | Skills load through a session-start hook and a "check for a skill before every reply" rule. | The brief (`BRIEF.md`) is the only instruction a run gets. | Skipped. The composer puts the right stage's cards in the brief; full skill files ship as inputs, as the Nuclear pack does. |

## Stage maps

Roles are those of `packs/software/roles/` and `packs/general/roles/`. Pull request #117 (open) already wires Nuclear-grade skills to the intake, author and pre-check roles in `services/api/src/brief.ts`; each workflow below uses that same per-role wiring rather than a second mechanism.

### Superpowers workflow

| Stage | Upstream skill | Control Rod home | Gate |
|---|---|---|---|
| S1 Design | brainstorming | Guided preparation (a person answers); output is the confirmed requirements, then a signed Release | none |
| S2 Plan | writing-plans | Intake role: the plan is the package's first deliverable, in the format two of Control Rod's own plans already use (the board redesign and overlay themes plans: Global Constraints, Review Focus, tasks with files and tests) | none |
| S3 Build | subagent-driven-development (implementer template), test-driven-development, systematic-debugging, verification-before-completion | Author role; each plan task is its own package, chained by `depends_on` where order matters, so each task gets its own author run; the four statuses (DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT) become the run's report; BLOCKED and NEEDS_CONTEXT become records for a person | none: intake already writes one package per draft with `depends_on`, and a package starts only once its dependencies are accepted |
| S4 Task review | subagent-driven-development (task reviewer template), requesting-code-review | Pre-check role per task, independent runtime | none |
| S5 Branch review | subagent-driven-development (final review) | A final package that depends on every task and lists each in `design_inputs`; its author run writes the whole-branch review as `REVIEW.md`, and its own pre-check reviews that | none |
| S6 Finish | finishing-a-development-branch | Accept, a person's act. Opening a pull request is **out of scope for this version**: no run role does it today (runs are `intake`, `author` and `pre-check`) | a new run role and command for G-04, with its own record |
| Skipped | using-superpowers, using-git-worktrees, executing-plans, dispatching-parallel-agents, writing-skills, diagnosing-superpowers, receiving-code-review | The brief, the daemon and the control plane already do these (executing-plans is the same plan run inline by one agent, which per-task runs replace); receiving-code-review is advice to the author on a Return and may become a card later | none |

### Pocock workflow

| Stage | Upstream skill | Control Rod home | Gate |
|---|---|---|---|
| P1 Interview | grill-with-docs (grilling plus domain-modeling) | Guided preparation; the glossary and ADR entries it settles become proposed deliverables | none |
| P2 Spec | to-spec | Intake role: the spec is the first deliverable | none |
| P3 Tickets | to-tickets | Intake role proposes several packages, each naming what blocks it in `depends_on` | none: `depends_on` exists, and a dependency clears only on acceptance |
| P4 Build | implement, tdd, diagnosing-bugs (bugfix playbook) | Author role, one run per ticket-package | none |
| P5 Review | code-review | Pre-check role with two axes: Standards (the repo's written standards and the smell baseline) and Spec (the package's criteria) | none |
| P6 PR body | pr | **Out of scope for this version**: it shapes the body of a pull request that no run opens yet | the G-04 run role and command, with its own record |
| P7 Retro | retro | A final package that depends on every ticket and lists each in `design_inputs`; its author run reads their outputs and writes proposals as `RETRO.md`; a person decides which to adopt. No post-Accept run is needed | none |
| Skipped | setup-matt-pocock-skills, ask-matt, handoff, wizard, triage, wayfinder, prototype, teach, wait-what, grill-me, to-questionnaire, research, codebase-design, improve-codebase-architecture, implement-spec, writing-for-agents | Setup and routing are the composer's job; handoff is unnecessary because every run starts fresh; `implement-spec`'s parallel frontier is the P3 dependency work; writing-for-agents is guidance for writing skills and instruction files, useful to whoever maintains the packs; the rest are later candidates, not part of the main flow | none |

### Hybrid workflow

The hybrid takes the Pocock stages at both ends and the Superpowers stages in the middle. Each pick is the stage that fits Control Rod's records best.

| Stage | Taken from | Why this one |
|---|---|---|
| H1 Interview | Pocock P1 | It leaves a glossary and ADRs behind, which Control Rod keeps anyway; brainstorming leaves only a design document. |
| H2 Slice | Pocock P3 | Thin end-to-end packages with named blockers match one-package-per-deliverable. |
| H3 Plan | Superpowers S2 | Exact files, signatures and tests per task make one-shot author runs reliable; two of the repo's own plans already use this shape. |
| H4 Build | Superpowers S3 with Pocock's `tdd` card | Superpowers' report statuses give the control plane something to act on; Pocock's vertical-slice test rule is the clearer of the two test rules. One test card only: the two disagree on throwing away code written before its test. |
| H5 Review | Pocock P5 per task, Superpowers S5 at the end | The Spec axis maps directly onto the package's acceptance criteria; a whole-revision pass still catches what per-task reviews miss. |
| H6 Finish | Superpowers S6 (Pocock P6 later, with G-04) | Accept stays the person's act; the pull request step waits for G-04, as in both parents. |
| H7 Retro | Pocock P7, in the same final package as S5 | Neither Superpowers stage covers this; one final package carries the whole-branch review and then the retro. |

**Display name.** "Pocock Superpowers" is the working name. Before it appears in the shipped UI, check with both authors: it names a person, and it could read as an endorsement they have not given. Their licence notices go in `THIRD_PARTY_NOTICES.md` either way.

## Keeping them current

1. **Pinned and generated.** Each workflow pack is generated from a pinned upstream checkout by its own script, with a `manifest.json` of file digests and a `--check` that fails on hand edits, as `scripts/generate-nuclear-pack.mjs` does. That generator cannot be reused unchanged: it compiles each skill's `## Decision contract` section, which neither upstream has. The stage-to-role mapping is a hand-written file per workflow, kept outside the generated tree, like `budgets.json`.
2. **Every two weeks.** A script bumps the pin, regenerates, re-measures brief budgets, and writes a report of skills added, removed, renamed or changed, and stages whose mapping no longer resolves. It opens a pull request with a change record. Upstream skills are instructions to our agents, so every bump is read by a person before merge, and none merges automatically. Matt Pocock's repository keeps skills in progress in their own folder and already has one skill (`grill-me`) that now only calls a newer one (`grilling`), so the rename report matters more there.
3. **Where the schedule runs.** A scheduled GitHub workflow is a trust surface (`.github/workflows/`) and needs the owner's signature. A scheduled local routine that opens the pull request avoids that.

## Build plan

**Status:** steps 1 to 8 are built in change record `skill-workflow-packs`; the hybrid's display name is still a working name.

Each step is its own change record. Steps 2 to 4 can run in parallel, one worker each.

1. **Contract** (needs the owner's signed yes for `spec/`): an optional per-card workflow field (`playbook`, `superpowers`, `pocock`, `hybrid`) with a project default, separate from `context_profile`. Safety and Material grade still lock Nuclear; every workflow's briefs are measured against the Nuclear budget too.
2. **Superpowers pack**: generator, manifest, `--check`, stage mapping, cards per role, budgets.
3. **Pocock pack**: the same.
4. **Interview stage in guided preparation**: grilling-style questions and a glossary or ADR proposal as the output, shared by the Superpowers, Pocock and hybrid workflows.
5. **Composer wiring**: each workflow's stage cards go into the intake, author and pre-check briefs, and the upstream skills a stage names ship as inputs. Tasks and tickets need no control-plane change: each is its own package, chained by `depends_on`. #117 reworks the same composer, so whichever merges second rebases onto the other.
6. **Board and project settings**: a per-card workflow switch beside the context switch, a project default, and the choice in New work.
7. **Hybrid**: a stage table that references the two packs' cards; it holds no copies of its own, so it follows both upstreams with no extra sync work.
8. **Biweekly sync script** and its routine.

## Not claimed

That either workflow works inside Control Rod: nothing is built. The brief sizes are not measured yet; the budgets in step 2 decide which cards go inline and which ship as inputs.
