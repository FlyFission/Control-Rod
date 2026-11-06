# Review panel: design

- **Date:** 2026-11-06
- **Owner:** Ben Huffer
- **Status:** Draft for owner review
- **Change record:** `.nuclear/changes/review-panel/`
- **Research:** `.nuclear/changes/review-panel/evidence/08-cross-model-review.md` (sections D1 to D12 hold the detailed mechanism this spec adopts)

## 1. Intent

The owner's most frequent workflow is having work produced in one coding tool reviewed by other models through their CLIs (Codex, Grok, Antigravity, Claude Code, Gemini), then reconciling what they say. Today that is manual: write a brief, start each CLI with its own headless quirks, collect the answers, check each claim against the code, merge. On 2026-11-06 it took three attempts to get Grok and Antigravity to run headless, and one reviewer cited files that do not exist.

Control Rod should do this as a first-class feature: point a **review panel** at any work, from any tool, and get back one reconciled report whose findings are checked against the code before they count.

## 2. Owner decisions (fixed)

| # | Decision | Date |
|---|---|---|
| P1 | The panel reviews work from any tool first (a branch, a pull request, a folder in any repository); Control Rod cards are one more target. | 2026-11-06 |
| P2 | Build it inside Control Rod, through the daemon, the sandbox and the evidence trail (approach A), not as a standalone CLI or a Claude Code plugin. | 2026-11-06 |

## 3. Goals

1. One request, from the terminal (`controlrod review`) or the board, runs several reviewer seats on different runtimes against one frozen snapshot.
2. Every seat runs headless, read only, sandboxed, one shot, from a per-CLI reviewer profile that encodes its quirks.
3. Findings come back in one strict schema; a deterministic gate checks each against the snapshot before it counts.
4. Duplicates merge with an agreement badge ("2 of 3 seats, 2 vendors"); empty seats never count as agreement.
5. A person disposes every finding (accept into a card, reject with reason, defer); the report and dispositions are evidence.
6. On a card, one seat on a different provider can serve as the existing agent pre-check, with no kernel change.

## 4. Non-goals and anti-goals

**Non-goals for the first release:** unattended panels on every pull request; debate rounds between reviewers; a judge model that rewrites severities; Gemini CLI with consumer sign-in (ended 2026-06-18).

**Anti-goals:**
- A panel shown as "passed", as an approval, or as a person verification.
- Any reviewer started with permission bypass flags (`--dangerously-skip-permissions`, `--yolo`, `bypassPermissions`), or able to write the snapshot.
- Content reaching a provider before its data lane is classified and admits that provider (workbench design M-0).
- Agreement presented as confidence. Agreement raises priority, not confidence.

## 5. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| A. Inside Control Rod, through the daemon | Most work; every review gets the same sandbox, attestation and evidence as agent runs | **Chosen** (P2) |
| B. Standalone CLI first, fold in later | Useful in days, but unsandboxed, no evidence, and the hard parts get built twice | Rejected |
| C. Claude Code skill or plugin | Fastest, but bound to one tool and none of Control Rod's guarantees | Rejected |

## 6. Design

### 6.1 Targets and requests

A **ReviewRequest** names a target, the seats, a quorum, an optional pre-check seat, a time budget per seat, and the data lane. Target kinds, in build order (P1):

1. **folder**: tracked files of a local repository folder (untracked files only when listed, so a stray `.env` is never sent).
2. **branch**: `head` versus `base` of a local repository, as a detached snapshot plus `changes.diff`.
3. **pr**: resolved with `gh pr view --json baseRefOid,headRefOid` and fetched by commit, never by branch name, then treated as a branch target.
4. **card_revision**: a Control Rod package revision's retained outputs.

The terminal entry point is `controlrod review <path | branch | pr-number> [--base main] --seats codex,claude,grok,agy [--lane internal] [--pre-check codex]`. It builds the snapshot on the owner's machine, computes its digest, uploads it as a review subject, and prints the report link. The board entry point is a Request review action on a card (later slice).

A **review subject** is a new record: target kind and reference, snapshot digest, lane, and who requested it. It is not a work package; it has no rung, release or acceptance. Its runs use a new run role **`review`**. Before any seat starts, the lane must be classified and must admit each seat's runtime and provider; a seat whose runtime the lane does not admit is refused with the reason.

### 6.2 Reviewer seats and profiles

Each seat is a one-shot print-mode run (ADR 0020) launched by the daemon in the OS sandbox (ADR 0021) with a fresh workspace holding a read-only copy of the snapshot, a private home, no secrets in its environment, and no network beyond its model endpoint.

How each CLI is invoked lives in a **reviewer profile** table with exactly one row per supported runtime (a test fails if a runtime lacks a row): invocation and flags, how the brief is passed (stdin or file, never argv), how the answer is read, timeout, known quirks, the last CLI version verified. Initial rows come from research D3: Codex (`exec --ephemeral -s read-only`), Claude Code (restricted read tools), Grok (no `--add-dir`, read-only command allowlist), Antigravity (snapshot or empty working directory, file tools only, empty output is a failure). Changing a profile changes what an agent may do, so profiles change only through the same owner gate as other agent-authority changes.

**Qualification:** a runtime gets a seat only after its pinned CLI version passes the ADR 0021 qualification suite. Codex and Claude Code are qualified today; Grok, Antigravity and Gemini each need their own qualification before their seats are enabled.

**Seat outcomes:** `ok`, `empty`, `timeout`, `quota`, `auth`, `error`, `malformed`, `wrote_files`. After each run the snapshot digest is checked again (write canary); a changed digest voids that seat and records a policy event.

### 6.3 Brief, findings and verification

The control plane builds one brief per request (research D4), stored with its digest: target, intent, the repository rule that no engineering number may be typed by a model, what each seat may read, the evidence rule (every finding quotes its lines and names how to falsify it), adjudicated false-positive precedents, the JSON output contract, and the prohibitions. Secrets and `.env` content are never in a brief.

Each seat must return JSON matching the **Finding** schema (research D5): severity, confidence, category, claim, location (path and lines, or section), quote, how to falsify, optional fix, and whether it read the file. Output that does not validate makes the seat `malformed`.

**Stage 1, deterministic and mandatory:** the path exists in the snapshot, the lines are in range, the quote appears at those lines after whitespace normalization, and for a diff target whether the location is inside the change. A finding that fails is never shown as a finding; it goes to a collapsed "Unverifiable claims" list with its seat. **Stage 2, optional:** a fresh run on a different runtime tries to refute the top anchored findings and answers upheld, refuted or inconclusive with a cited line (later slice).

### 6.4 The report

The control plane merges anchored findings by a key it computes (path, enclosing symbol or hunk, concern bucket), keeps the most specific claim, and badges agreement as "N of M seats, K vendors"; same-vendor seats count once, Antigravity and Gemini count as one vendor, empty seats are listed separately. A single-seat critical stays critical. Disagreements show both quotes with no automatic winner.

The report header states the target digest, seats requested versus answered, vendors, a quorum line ("single consultant review: no cross-vendor check happened" when fewer than the quorum answered), time, and usage ("not reported" when a CLI gives none). Each finding has three person actions: Accept (creates a card or a card note), Reject with reason (may become a precedent), Defer. The report never says "passed".

### 6.5 On a card

A Request review action on a card creates a request whose target is the card revision. One seat on a different provider from the author can be marked as the pre-check and is submitted through the existing pre-check path; the other seats are advisory evidence on the package. Verified critical findings change the sign-off text the way the board spec's sign panel already requires. The panel never substitutes for person verification on Safety or Material work, and the card says so.

### 6.6 Evidence

Each seat records runtime, CLI version, model as reported, profile flags used, brief digest, snapshot digest before and after, raw answer, validation result, outcome and duration. The report records its digest and every disposition. The report carries the line "Model review is not proof."

## 7. What changes where

| Area | Change | Gate |
|---|---|---|
| `spec/` | ReviewRequest, ReviewSubject, Finding, PanelReport models; run role `review`; review routes. Additive (minor version) | owner approves spec |
| API | review subject and panel tables (migration), routes, brief builder, Stage 1 gate, merge | Standard change record |
| Daemon | reviewer run mode, profile table, snapshot mount, outcomes, write canary | profile table is an agent-authority surface: owner gate |
| CLI | `controlrod review` | Standard |
| Qualification | Grok, Antigravity, Gemini rows qualified per ADR 0021 before enabling | ADR 0021 suite |
| Web | report view, dispositions, Request review on a card | after board M5 |
| Kernel, policies, red team, workflows | none | n/a |

## 8. Slices (one pull request each)

| Slice | Delivers | Depends on |
|---|---|---|
| R1 Reviewer run | Daemon review run mode with Codex and Claude Code profiles, read-only snapshot, outcomes, write canary, fixture tests with fake CLIs | none |
| R2 Review subject and brief | Review subject record and migration, folder and branch targets, lane gate, brief builder, `controlrod review` for folder and branch | R1 |
| R3 Findings and Stage 1 | Finding schema and validator, Stage 1 anchoring, unverifiable list | R2 |
| R4 Report | Merge and agreement badges, quorum and empty seats, report record, terminal output of the report | R3 |
| R5 Report on the board | Report view with dispositions; Accept creates a card | R4, board M1 |
| R6 Pull requests | PR target by commit | R2 |
| R7 More seats | Grok, then Antigravity, then Gemini profiles, each after ADR 0021 qualification | R1 |
| R8 On a card | Request review on a card; pre-check seat through the existing path | R4, board M5 |
| R9 Refutation | Stage 2 refutation and the precedents store | R4 |

## 9. Testing

Fixture CLIs (fake `codex`, `claude`, `grok`, `agy` binaries) exercise every seat outcome, including exit 0 with empty output, malformed JSON, a timeout, and a seat that writes the snapshot. Stage 1 is tested with findings whose path is missing, whose quote is off by a line, and whose lines are out of range. Merge is tested for same-vendor double counting, empty seats, and a lone critical. The lane gate is tested with a seat whose provider the lane does not admit. Live qualification of each runtime follows ADR 0021.

## 10. Open owner decisions

1. Default seats and quorum for a request with none named (proposal: two seats on two vendors, quorum two).
2. Whether review subjects from outside repositories may use the public lane at all, or default to internal.
3. Whether Gemini is worth qualifying while Antigravity covers the same vendor.

## 11. Not claimed

A panel report is evidence that models reviewed the work. It is not proof, approval, certification or person verification.
