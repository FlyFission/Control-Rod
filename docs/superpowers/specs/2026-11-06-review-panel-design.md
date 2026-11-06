# Review panel: design

- **Date:** 2026-11-06
- **Owner:** Ben Huffer
- **Status:** Draft for owner review (revised 2026-11-06 after one Codex review, see the change record)
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

1. **folder**: tracked files of a local repository folder (untracked files only when listed). Selection alone is not a secret control; every target passes the content policy in 6.1a.
2. **branch**: `head` versus `base` of a local repository, as a detached snapshot plus `changes.diff`.
3. **pr**: resolved with `gh pr view --json baseRefOid,headRefOid` and fetched by commit, never by branch name, then treated as a branch target.
4. **card_revision**: a Control Rod package revision's retained outputs.

The terminal entry point is `controlrod review <path | branch | pr-number> [--base main] --seats codex,claude,grok,agy [--lane internal] [--pre-check codex]`. It builds the snapshot on the owner's machine, computes its digest, uploads it as a review subject, and prints the report link. The board entry point is a Request review action on a card (later slice).

### 6.1a Content policy (before any provider sees anything)

Tracking is not safety: a `.env` or a key can be committed, and a reviewer reads the snapshot itself, not only the brief. So the content policy runs on every artifact that is stored or that a seat can read: the head snapshot, the base tree retained for `base_lines` checks, and `changes.diff`. It runs on the owner's machine, before the upload and before any seat starts, for tracked and untracked files alike:

1. **Denylist exclusion.** Files whose names match a secret denylist are removed from the head snapshot, the base tree and the diff: `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_*` private keys (for example `id_rsa`, `id_ed25519`), `credentials*`, `.netrc`, `.git-credentials`, `*.kdbx`, and the credential stores ADR 0021 already denies. The list is data in the repository, not code, and a change to it goes through the same owner gate as profiles. An excluded file in a diff is replaced by a stub line that names the path and says it was withheld, so a reviewer cannot be misled into thinking it was empty. Excluded paths are listed to the person.
2. **Text only, fail closed.** The scanner inspects text, so anything it cannot classify as inspectable text is withheld. Binary files and archives (`.zip`, `.tar`, `.gz`, `.7z`, keystores, database files, images and the like, detected by content, not only by extension) are excluded from the head snapshot, the base tree and the diff by default and listed to the person as withheld. There is no in-archive inspection in the first release. Any file the policy cannot classify as inspectable text is withheld the same way. A person may include a specific binary only by naming it; it is then still listed in the confirmation and its digest is part of the confirmation digest.
3. **Scanner pass.** A secret scanner runs over all remaining text in the head snapshot, the whole base tree (a secret in an unchanged part of a base file is in scope, not only the changed hunks) and the diff (private key blocks, provider tokens, high entropy assignments). Findings are not auto-redacted into something that looks real; they are listed with path and line, and the matching file is excluded unless the person marks the finding as a false positive.
4. **Person confirms.** The terminal and the board show the person the exact list before anything is sent: files excluded and why, scanner findings, the seats and providers that will receive the content, and the lane. Nothing is uploaded or started until the person confirms. A non-interactive run refuses unless `--confirm-content <digest>` names a confirmation digest computed over the post-policy digests of the head snapshot, the base tree and the diff, the policy result (excluded paths, scanner version, findings and false-positive marks), the digest of the final brief, the lane, and the seat recipients (runtime and provider of each seat). Control Rod recomputes it just before upload and again at dispatch; a change to the intent, the precedents or any other part of the brief after confirmation changes the digest. If any input differs, the confirmation is rejected and the person must review again, so an earlier confirmation can never authorize different content.
5. **Record.** The excluded paths, the scanner version, the findings, the confirmation digest and its inputs are stored with the review subject. The snapshot digest is computed after the policy, so it describes exactly what the seats saw.

The final brief (target, intent, precedents, contract and prohibitions) is built from the post-policy snapshot before the person confirms, and is scanned by the same scanner, because it is provider-bound content too. Its digest is part of the confirmation digest below; the brief shown is the brief sent.

A **review subject** is a new record: target kind and reference, snapshot digest, lane, and who requested it. It is not a work package; it has no rung, release or acceptance. Its runs use a new run role **`review`**. Before any seat starts, the lane must be classified and must admit each seat's runtime and provider; a seat whose runtime the lane does not admit is refused with the reason.

### 6.2 Reviewer seats and profiles

Each seat is a one-shot print-mode run (ADR 0020) launched by the daemon in the OS sandbox (ADR 0021) with a fresh workspace holding a read-only copy of the snapshot, a private home, no secrets in its environment, and no network beyond its model endpoint.

How each CLI is invoked lives in a **reviewer profile** table with exactly one row per supported runtime (a test fails if a runtime lacks a row): invocation and flags, how the brief is passed (stdin or file, never argv), how the answer is read, timeout, known quirks, the last CLI version verified. Initial rows come from research D3 as adapted here: Codex (launched as Control Rod launches Codex today, see below), Claude Code (restricted read tools), Grok (no `--add-dir`, read-only command allowlist), Antigravity (snapshot or empty working directory, file tools only, empty output is a failure). Changing a profile changes what an agent may do, so profiles change only through the same owner gate as other agent-authority changes.

**Codex reviewer launch.** The reviewer profile for Codex reuses the daemon's own Codex launch (`CodexArgs` and `CodexPolicyArgs` in `daemon/internal/runner`): `exec --json --skip-git-repo-check -C <workspace>` with `--ignore-user-config --ignore-rules --ephemeral`, `-c default_permissions="control-rod"`, a `permissions.control-rod` filesystem table that denies the login folders and the credential set, network off, `approval_policy="never"`, web search disabled, and the disabled feature list. It never sets `sandbox_mode` and never passes `-s` or `--sandbox` (including `-s read-only`): ADR 0021 records that Codex ignores permission profiles whenever `sandbox_mode` is set, so `-s read-only` would drop the profile that denies the login files, and the preflight already refuses a config that sets it. The research invocation (`codex exec --ephemeral -s read-only`) is therefore not used. What differs for a reviewer is the filesystem grant: the writable workspace grant that the author profile extends is replaced by a read-only grant on the snapshot, with the answer written to a separate output location the daemon owns. The exact filesystem keys are chosen in R1 and are part of what is qualified, not assumed.

**Qualification, stated exactly.** Each reviewer profile is gated by the qualification of that exact invocation: the pinned CLI version, the platform, and the read-only filesystem grant as launched, not the author launch it is derived from. Today's evidence (`.nuclear/changes/workbench-ontology/evidence/phase6/`, `launch-qualification-wsl2.json` and `live-login-wsl2.json`) covers the author launch only, on WSL2 only, with Claude Code 2.1.318 and Codex 0.166.0. Its Codex leg runs `codex sandbox` with the daemon profile, and the live check adds one real `codex exec` session reading one decoy; neither exercised a read-only reviewer grant. Open gaps: the full ADR 0021 suite and the red team fixtures (plan task 6.4) await the owner's signature; every tool path, each new CLI version and each other platform are unqualified (macOS and native Linux are not); ADR 0021 is still Proposed and conditional. So no reviewer seat is enabled until R1 qualifies its reviewer invocation. The qualification tests for each reviewer profile show credential reads denied and writes denied (to the snapshot, the workspace and elsewhere), with a positive control and a deliberately weakened profile that leaks. Grok, Antigravity and Gemini each need their own qualification before their seats are enabled.

**Seat outcomes:** `ok`, `empty`, `timeout`, `quota`, `auth`, `error`, `malformed`, `wrote_files`. After each run the snapshot digest is checked again (write canary); a changed digest voids that seat and records a policy event.

### 6.3 Brief, findings and verification

The control plane builds one brief per request (research D4), stored with its digest: target, intent, the repository rule that no engineering number may be typed by a model, what each seat may read, the evidence rule (every finding quotes its lines and names how to falsify it), adjudicated false-positive precedents, the JSON output contract, and the prohibitions. The brief is built only from content that passed the content policy (6.1a); no secret material is in it.

Each seat must return JSON matching the **Finding** schema (research D5): severity, confidence, category, claim, location (path and lines, or section), quote, how to falsify, optional fix, and whether it read the file. Output that does not validate makes the seat `malformed`.

**Stage 1, deterministic and mandatory.** A finding's location has a declared type, and each type has its own check. A finding that fails is never shown as a finding; it goes to a collapsed "Unverifiable claims" list with its seat and the failed check.

| Location type | Fields | Deterministic check |
|---|---|---|
| `head_lines` | path, start, end | The path exists in the head snapshot, the range is within the file, and the quote appears at those lines after whitespace normalization. On a diff target it also records whether the range touches a changed hunk (a finding outside the change is shown as "outside the change", not dropped). |
| `base_lines` | path, start, end | Diff targets only. The path exists in the base tree, the range is within the base file, the quote appears at those base lines, and the range overlaps a removed or changed hunk in `changes.diff`. The base tree is retained with the subject, after the content policy, so this can be checked. |
| `deleted_file` | path | Diff targets only. `changes.diff` marks the path as deleted, the path exists in base and not in head, and any quote appears in the base file. |
| `section` | path, heading path, optional quote | The document at that path is parsed for headings; the heading path resolves to exactly one section in the head snapshot (or, for a deleted section, in base with the diff showing the removal); a quote, when given, appears inside that section. A section that matches zero or several headings fails as ambiguous. |

A finding names its side (head or base) explicitly; a missing or mismatched side fails the check. **Stage 2, optional:** a fresh run on a different runtime tries to refute the top anchored findings and answers upheld, refuted or inconclusive with a cited line (later slice).

### 6.4 The report

The control plane merges anchored findings by a key it computes (path, enclosing symbol or hunk, concern bucket), keeps the most specific claim, and badges agreement as "N of M seats, K vendors"; same-vendor seats count once, Antigravity and Gemini count as one vendor, empty seats are listed separately. A single-seat critical stays critical. Disagreements show both quotes with no automatic winner.

The control plane computes two independent facts and reports the actual counts of both. **Quorum:** seats that returned outcome `ok` versus the requested quorum, shown as "N of Q required seats answered" (met or not met). **Vendor count:** distinct vendors among the answered seats (same-vendor seats count once; Antigravity and Gemini are one vendor), shown as "K vendors answered". Neither is derived from the other. The line "single consultant review: no cross-vendor check happened" appears only when exactly one vendor answered, whatever the seat count or quorum; two seats on one vendor that meet a seat quorum still carry that line, and three seats requested with two different vendors answering says "quorum not met (2 of 3), 2 vendors answered" and does not claim a single consultant.

The report header states the target digest, seats requested versus answered, vendors, a quorum line, time, and usage ("not reported" when a CLI gives none). Each finding has three person actions: Accept (creates a card or a card note), Reject with reason (may become a precedent), Defer. The report never says "passed".

### 6.5 On a card

A Request review action on a card creates a request whose target is the card revision. One seat on a different provider from the author can be designated as the pre-check. That seat is created as an ordinary pre-check run: role `pre-check`, queued on the card's current revision and round through the existing `queueRun` path, so it is claimed, launched and completed like any agent pre-check. It is not a `review` run converted afterwards.

**Binding the pre-check to what the person confirmed.** `queueRun` queues a run with runtime `any` and returns an already active pre-check for the same revision and round instead of a second one, and the claim path picks an independent runtime from those offered (`pickChecker`), not the seat the panel requested. The existing pre-check job also carries package context and deliverables beyond the panel snapshot. So a panel that requests a pre-check seat does exactly one of two things. (a) **Link an existing active pre-check run as separate evidence.** The panel links it and reports that run's actual runtime, provider, model and inputs, never the requested ones; if they differ from the request, the person sees both ("requested codex, linked run uses claude"). A linked existing run is pre-check evidence only: it does not count toward panel quorum or vendor counts, because nothing shows it reviewed the panel's frozen snapshot, used the finding schema or passed Stage 1, and the confirmation for the other seats does not extend to it. (b) **Queue one pinned to the request.** Only a pre-check queued by the panel this way can count as a seat, and only when its inputs, output contract and Stage 1 validation match the request. The run is queued with the requested runtime and reviewer profile recorded on it and with the complete inputs of the existing pre-check contract as its job inputs: the package, the preparation inputs, the acceptance criteria, the schemas and the author deliverables, plus the post-policy snapshot and the confirmed brief. The content policy and the confirmation apply to all of these, and the confirmation digest covers them. If the policy withholds any required input (a deliverable or a criterion, say), the pre-check seat is refused before dispatch with the reason shown, because a verdict recorded against the full author outputs must not be issued by a checker that did not see them; the advisory seats may still run, and the claim must offer that run only to the requested runtime. The existing runtime pin mechanism (`pinnedOffer`) is a per-role pin; pinning one run to one runtime, and attaching the approved inputs to the job, is a change to the claim path and to job construction and is part of slice R8, with its own change record. Until R8 lands that change, the designated pre-check seat is available only in case (a), and the report says which case applied. If the claim cannot offer the pinned runtime, the run stays held with the reason shown and the panel does not report the seat as answered. The completion path accepts only `pre-check` runs for this (any other role is refused as an unsupported completion role), and `finishPreCheck` in `services/api/src/work.ts` binds the result to the card's package and revision, requires an outcome of `pass`, `fail` or `inconclusive`, runs the prepared-execution guard, and the kernel decision for `submit-pre-check` applies the baseline and runtime independence checks, so none of that is bypassed or reimplemented. To produce its outcome, the designated seat runs its reviewer profile in a pre-check mode that also returns the `verification.json` the existing path expects. The panel links a panel-queued run by id as one of its seats. The seat counts in the quorum and vendor counts by its seat outcome (table below), never by its verdict.

| Run completion status | Seat outcome | Pre-check verdict | Counts toward quorum and vendors |
|---|---|---|---|
| succeeded, `verification.json` accepted | `ok` | `pass`, `fail` or `inconclusive` as reported | yes, for all three verdicts |
| succeeded, no valid outcome (completion refused as invalid) | `malformed` | none | no |
| succeeded, empty output | `empty` | none | no |
| failed or stopped, by timeout | `timeout` | none | no |
| failed with quota or auth error | `quota` or `auth` | none | no |
| failed or quarantined, other | `error` | none | no |
| snapshot digest changed | `wrote_files` | none | no |

A completed pre-check that reports `fail` is therefore seat outcome `ok` with verdict `fail`: the seat answered, and the verdict is shown as a finding-level result, not hidden. The verdict is recorded by the existing pre-check path and never changes the seat outcome. The other seats are `review` runs, advisory evidence on the package. Verified critical findings change the sign-off text the way the board spec's sign panel already requires. The panel never substitutes for person verification on Safety or Material work, and the card says so.

### 6.6 Evidence

Each seat records runtime, CLI version, model as reported, profile flags used, brief digest, snapshot digest before and after, raw answer, validation result, outcome and duration. The report records its digest and every disposition. The report carries the line "Model review is not proof."

## 7. What changes where

| Area | Change | Gate |
|---|---|---|
| `spec/` | ReviewRequest, ReviewSubject, Finding, PanelReport models; run role `review`; review routes. Additive (minor version) | owner approves spec |
| API | review subject and panel tables (migration), routes, brief builder, Stage 1 gate, merge | Standard change record |
| Daemon | reviewer run mode, profile table, snapshot mount, outcomes, write canary | profile table is an agent-authority surface: owner gate |
| CLI | `controlrod review` | Standard |
| Qualification | Each reviewer invocation, Codex and Claude Code included, qualified per ADR 0021 before enabling; Grok, Antigravity, Gemini later | ADR 0021 suite; red team fixtures need the owner's signature |
| Web | report view, dispositions, Request review on a card | after board M5 |
| Kernel, policies, red team, workflows | none | n/a |

## 8. Slices (one pull request each)

| Slice | Delivers | Depends on |
|---|---|---|
| R1 Reviewer run | Daemon review run mode with Codex (permission profile launch, no `-s`) and Claude Code profiles, read-only snapshot, outcomes, write canary, fixture tests with fake CLIs, qualification of each reviewer invocation | none |
| R2 Review subject and brief | Review subject record and migration, folder and branch targets, content policy (6.1a), lane gate, brief builder, `controlrod review` for folder and branch | R1 |
| R3 Findings and Stage 1 | Finding schema and validator, Stage 1 anchoring, unverifiable list | R2 |
| R4 Report | Merge and agreement badges, quorum and empty seats, report record, terminal output of the report | R3 |
| R5 Report on the board | Report view with dispositions; Accept creates a card | R4, board M1 |
| R6 Pull requests | PR target by commit | R2 |
| R7 More seats | Grok, then Antigravity, then Gemini profiles, each after ADR 0021 qualification | R1 |
| R8 On a card | Request review on a card; pre-check seat through the existing path, including the claim path and job construction change that pins one run to one runtime with the approved inputs | R4, board M5 |
| R9 Refutation | Stage 2 refutation and the precedents store | R4 |

## 9. Testing

Fixture CLIs (fake `codex`, `claude`, `grok`, `agy` binaries) exercise every seat outcome, including exit 0 with empty output, malformed JSON, a timeout, and a seat that writes the snapshot. The Codex reviewer profile is tested to contain `default_permissions` and none of `-s`, `--sandbox` or `sandbox_mode`, and its live qualification shows a credential read denied and a write denied. The content policy is tested with a tracked `.env`, a tracked private key, a tracked `backup.zip` containing a key file (withheld), an unclassifiable file (withheld), a named binary (included and still listed), an untracked `.env`, a secret inside an ordinary source file (scanner), a secret inside a diff hunk, and a non-interactive run without the confirmation digest. Stage 1 is tested with findings whose path is missing, whose quote is off by a line, and whose lines are out of range, plus base line ranges, a deleted file, deleted lines, a section that resolves, a section that is missing, and an ambiguous section. Quorum is tested with 3 requested and 2 answered from 2 vendors (quorum not met, not single consultant) and 2 answered from 1 vendor (quorum met, single consultant). The card pre-check seat is tested to be created with role `pre-check` and to complete through `finishPreCheck`, including a refused same-runtime case; the existing-active-run case (the panel links it as separate pre-check evidence, reports that run's actual runtime and inputs, shows a mismatch, and the run cannot satisfy panel quorum or vendor counts); a withheld deliverable and a prepared package (the seat is refused before dispatch with the reason, and a prepared package receives its preparation inputs); changes to the intent and to the precedents after confirmation (dispatch is rejected); the pinned case (the run is offered only to the requested runtime and carries the approved inputs, and a held run is not reported as answered); and the status mapping table, including a succeeded pre-check with verdict `fail` counting as seat outcome `ok`. A secret in an unchanged part of a base file is tested to be excluded or flagged before upload, and a confirmation is tested to be rejected when any of the snapshot, base, diff, policy result, lane or recipients changes. Merge is tested for same-vendor double counting, empty seats, and a lone critical. The lane gate is tested with a seat whose provider the lane does not admit. Live qualification of each runtime follows ADR 0021.

## 10. Open owner decisions

1. Default seats and quorum for a request with none named (proposal: two seats on two vendors, quorum two).
2. Whether review subjects from outside repositories may use the public lane at all, or default to internal.
3. Whether Gemini is worth qualifying while Antigravity covers the same vendor.

## 11. Not claimed

A panel report is evidence that models reviewed the work. It is not proof, approval, certification or person verification.
