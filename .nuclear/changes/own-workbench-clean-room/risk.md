# Risk: own workbench, clean-room Kandev patterns

**Purpose:** Sort the decision to build Control Rod's own workbench, and the clean-room pattern file that feeds it, by risk, and name the least evidence needed before it merges.

**Change slug:** `own-workbench-clean-room`
**Owner:** Ben Huffer, FlyFission Consulting Group
**Date:** 2026-10-22
**Lifecycle phase:** Review
**Status:** Ready for owner review on branch `docs/kandev-patterns`.

---

## Change identity

- **Slug:** `own-workbench-clean-room`
- **PR / issue:** pull request from `docs/kandev-patterns`, to be opened by the owner's decision
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Current lifecycle phase:** Review
- **Summary:** Adds ADR 0019 (build our own workbench; learn from Kandev only through a clean room), `docs/patterns/kandev.md` (merged clean-room pattern notes with a build plan whose code claims are checked against the MVP branch at `87d0f79`), `docs/patterns/README.md`, and one line in `docs/README.md`. No code, spec, policy or test changes.

## Mission anchor

- **Objective:** let Control Rod borrow useful ideas from Kandev without taking in AGPL code or wording, and give Ben a checked list of what to build before his first real run on his Mac.
- **Success criterion (done when):** ADR 0019 states the decision, the options, the clean-room procedure and the need for legal review; the pattern file covers every note file by Control Rod area with fit, effort, priority and source; every code claim in the build plan cites file and line and is marked confirmed, partly true or wrong; Now holds confirmed gaps only, each with files and a trust-surface flag; this packet validates with `--strict-custody`.
- **Non-goals:** no product code, spec, policy, workflow or red-team change; no legal opinion; no use of Kandev in any build or runtime path.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this change quietly get wrong? | Copied wording from AGPL docs could reach an Apache-2.0 repository through the notes. A build plan could rest on a false claim about our own code. The ADR could read as a legal conclusion. |
| What did checking find that we did not expect? | Codex runs as launched today cannot write `out/` (read-only default, and the run workspace is not a Git repository). An empty pre-check then makes `complete` refuse and roll back, which leaves the run "running" for good. Pre-check independence holds only by baseline name, so a one-runtime Mac runs the pre-check on the author's runtime. One note claim was wrong: decision challenges are already single use. |
| What is assumed and not yet shown? | That no copied wording remains (checked by E-006 after fixes; residual risk is paraphrase below the similarity threshold). The license facts reported by the readers (not re-checked under the clean-room rule). Codex's behaviour on Ben's Mac (read from OpenAI's docs; no run on the Mac yet). |

## Affected configuration items

| Item | Type | Why it matters | Link |
|---|---|---|---|
| ADR 0019 | Design record | Sets how Control Rod may use Kandev and its ideas. | `docs/adr/0019-own-workbench-clean-room.md` |
| Kandev pattern file | Design input | Feeds builders; carries the Now, Next and Later plan. | `docs/patterns/kandev.md` |
| Pattern notes README | Process doc | States the clean-room rule for every pattern file. | `docs/patterns/README.md` |
| Docs index | Doc | Points readers to `patterns/`. | `docs/README.md` |

## Threshold screen

| Dimension | Low / medium / high | Notes |
|---|---|---|
| Consequence | Medium | A license or wording mistake could taint the public core; a wrong code claim could misdirect the first build. |
| Reversibility | High | Docs on a branch; revert is one command. Copied wording, once published, is harder to undo, so the wording check comes before merge. |
| Detectability | Medium | Code claims are checkable by anyone at the cited lines; copied wording needs a deliberate comparison. |
| Exposure | Low | Pre-alpha repository; branch pushed for review as pull request #4. |
| Uncertainty | Medium | License facts and Codex behaviour come from secondary sources. |
| Dependency trust | Medium | The decision is about an outside AGPL project; no dependency is added. |
| AI authority | Medium | An AI agent wrote every file and checked the code claims; Ben holds merge. |
| Controllability | High | Ben reviews before merge; nothing merges without him. |

## HPI work-mode screen

| Factor | Rating | Notes |
|---|---|---|
| Familiarity | Medium | ADRs and change records are routine here; clean-room procedure is new. |
| Time pressure | Low | No deadline. |
| Complexity | Medium | Four large note files merged; 24 code claims checked. |
| Distraction risk | Medium | The fifth note file arrived mid-work; it was folded into section 10 in a follow-up commit and the wording check rerun. |

## Selected mode

- **Mode:** Standard
- **Why this mode:** the change records a lasting design decision about an outside AGPL project and makes claim-bearing statements about licensing and about our own code. The tool's guidance puts lasting design decisions and claim-bearing wording at Standard.
- **Why lighter mode is not enough:** Quick excludes lasting decisions and dependency or license trust calls.
- **Why heavier mode is not yet required:** no code, kernel, policy or release changes; the build plan only proposes work, and each Now item gets its own change record.

## Activated artifacts

| Artifact | Activated? | Reason | Owner |
|---|---|---|---|
| `basis.md` | yes | Protected outcomes for licensing and accuracy. | Ben Huffer |
| `plan.md` | yes | Work order and proof commands. | Ben Huffer |
| `trace.md` | yes | Claims tied to checks. | Ben Huffer |
| `verification.md` | yes | Results, custody and coupling. | Ben Huffer |
| `ship.md` | yes | Merge decision and residual risk. | Ben Huffer |
| Nuclear subset record | no | No kernel decision function changes. | Ben Huffer |

## Immediate evidence obligations

- **Least evidence before build:** the clean-room brief the readers followed, and the four note files.
- **Least evidence before merge:** every code claim cited to file and line; no code blocks or copied text in the pattern file; trust surfaces untouched; this packet validated; the independent wording check run and recorded; Ben's review.
- **Independent review needed?** Yes: the wording check by someone who did not write the pattern file, and Ben's review.

## Required links

- Packet: `.nuclear/changes/own-workbench-clean-room/`
- `basis.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- Decision record: `docs/adr/0019-own-workbench-clean-room.md`

## Exit criteria

- The mode is justified.
- The activated artifacts are named.
- Risks, assumptions and evidence duties live in this packet.

## Source-lineage note

Packet structure follows nuclear-grade context engineering, whose public source map is at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
