# Phase 3 part 2 (task 3.3, Inbox): Codex review adjudication

Reviewer: Codex CLI (read-only, ephemeral). Evidence: `inbox-codex-round1.md` and later rounds beside it.

## Round 1 (verdict BLOCK)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3B-01 | Accepted, fixed | The SCRAM item is routed by the viewer's own standing (`adminActions` for `scram.review` and `scram.restart`, `signingGaps` for reconcile). With nothing blocking, it reads "You may restart it when it is safe" only for someone who may restart; anyone else sees it under waiting on an administrator. Readiness and permission are stated separately. Test: `puts a SCRAM that needs a person above everything else` (second member). |
| P3B-02 | Accepted, fixed | A lost run with an unknown outcome is the viewer's only if they may reconcile it; otherwise it is waiting on someone who may, with the missing qualification named. Test: `routes a lost run with an unknown outcome to someone who may reconcile it`. |
| P3B-03 | Accepted, fixed | `packageActions` refuses release with `scram-stopped` while SCRAM holds the package, exactly as submission does, so the Inbox, the decision bar and the palette never offer it; the Inbox lists it waiting on a restart after SCRAM. Test: same SCRAM test. |
| P3B-04 | Accepted, fixed | A prepared draft whose requirements are ready but unconfirmed becomes a `confirm` item binding the requirements digest (the one the confirmation signs), routed to whoever may confirm, opening the preparation panel. Test: `asks the person who may confirm requirements to confirm them`. |
| P3B-05 | Accepted, fixed | The digest counts preparation edits as changes and every signed act by a person as a signature (decisions, requirements confirmations, reconciles, independence overrides, SCRAM pulls, reviews and restarts, person verifications), never an agent's. Test: digest test with these events. |
| P3B-06 | Accepted, fixed | Gate criteria are counted from each package's criteria: for prepared packages the snapshot's criteria minus those with an admitted passing result, otherwise all acceptance criteria until the pre-check passes. A missing result is never a pass. Test: `counts criteria as open until something shows them met`. |
| P3B-07 | Accepted, fixed | Inbox query keys and the badge include the signed-in person, the digest cursor is stored per person, and the query cache is cleared on sign in and sign out. The cursor is read for the current person on every render and the Inbox does not load until the person is known, so no cursor is ever used or written for anyone else. Test: `marks them seen, on this person's own cursor` (another person's cursor untouched). |
| Medium: artifact bytes | Fixed | Decision subjects read output names and digests only (`outputDigestsOf`); file bytes are loaded only to build jobs. |
| Medium: unbounded digest read | Fixed | The digest reads events up to the head it reports, so marking seen never skips or double counts. |
| Medium: binding scope | Fixed | The binding sentence names the confirmed requirements and preparation basis, and the checker's criterion results and evidence, when the signed subject includes them. |

Verification after round 1 fixes: API 505 passed, 1 skipped; web 121 passed.

## Round 2 (verdict BLOCK; P3B-02, 03, 04, 06, 07 closed)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3B-08 (and P3B-01) | Accepted, fixed | `scramAttention` returns each unknown-outcome run with its package; the SCRAM item is the viewer's only if they may review the stopped runs or may reconcile at least one of those runs judged against that run's own package needs. Test: `judges who may reconcile a SCRAM's unknown outcomes against each run's own package` (a Material grade run is not the General service founder's). |
| P3B-09 | Accepted, fixed | The unconditional fallback is gone. A dispute from a failed or stopped run is the viewer's when they have a decision or may requeue it, and requeueing counts only while SCRAM does not hold the work; otherwise it waits on a restart after SCRAM (or on who may decide). Lost runs without an unknown outcome and waiting agents follow the same SCRAM rule. Test: `never counts recovery work as yours when SCRAM holds it and you cannot settle it`. |
| Medium: signed administration (and P3B-05) | Fixed | Signed administrative commands (qualifications, passkeys, policy, pins) count as signatures, once each; SCRAM commands are counted only as their SCRAM step. Singular and plural forms are correct. Test: digest test. |
| Medium: prepared subjects read artifact bytes | Accepted, not changed | For prepared packages the decision subject must prove the deliverable and the checker's evidence are unchanged since they were checked, which needs their bytes hashed; skipping that would weaken the integrity the signature binds. The bytes no longer load for legacy subjects. Revisit with a stored, verified digest cache if the Inbox measures slow (performance budget Q-10 is checked in the Phase 3 exit review). |
| Medium: digest bound, binding scope | Closed in round 2 review. |

Verification after round 2 fixes: API 507 passed, 1 skipped; web 121 passed.

## Round 3 (verdict BLOCK; P3B-08, P3B-09 and the Mediums closed)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3B-10 | Accepted, fixed | A held run now records why it is held as a code (`Run.waiting_cause`: scram, lane, runtime-pin, independent-runtime, preparation), set wherever a claim holds a run and cleared when it starts or is overridden. The Inbox routes a waiting agent to whoever may resolve that cause: an independence hold to someone who may override independence (judged against the package's needs), a pin hold to an administrator, a lane hold to someone with lane authority, a SCRAM hold to someone who may restart; preparation holds and holds recorded before causes existed stay the owner's. Test: `goes to whoever may resolve what holds it`. |
| Medium: prepared artifact bytes | Accepted, performance checked at exit | Kept for integrity, as adjudicated in round 2; the Inbox's speed on the reference workload is measured in the Phase 3 exit review (Q-10). |

Verification after round 3 fixes: API 508 passed, 1 skipped; web 121 passed.

## Round 4 (verdict BLOCK; P3B-10 partial)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3B-11 | Accepted, fixed | Every hold is written through `holdRun`, which replaces the hold whenever its reason or cause differs, including the independence hold (no longer written only when no reason exists). A claim pass clears a hold whose cause has passed (SCRAM, preparation, lane, pin) before checking the next, so a stale reason never masks a newer one or routes it to the wrong person. Test: `replaces a stale hold with the one that now applies`. |
| P3B-12 | Accepted, fixed | A preparation hold is routed to someone who may return the package for revision, judged against the package's needs. Test: `goes to whoever may resolve what holds it`. |
| P3B-13 | Accepted, fixed | An independence hold on Safety or Material work is the viewer's only if they also hold an attested hardware key, as signing the override requires; otherwise it waits on a qualified signer with one. Test: `routes an independence hold on high consequence work only to a signer with an attested hardware key`. |

Verification after round 4 fixes: API 510 passed, 1 skipped; web 121 passed.

## Round 5 (verdict BLOCK; P3B-11 and P3B-13 closed)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3B-14 (and P3B-12) | Accepted, fixed | A preparation hold is routed by the viewer's own return descriptor from `packageActions`, which carries every floor the return would face (qualification and the hardware key for Safety and Material work); the reason shown is that descriptor's refusal. Test: the high consequence routing test now also holds the run for preparation. |
| P3B-15 | Accepted, fixed | Held intake runs (a capture with no package yet) are listed: titled from the capture, opening the roster for a pin hold or Packages otherwise, routed by the same cause rules and SCRAM hold as package work (`AttentionItem.capture_id` in the contract). Test: `lists a held intake run, which has a capture but no package yet`. |
| Medium: disputes line | Fixed | The digest counts every open dispute, whoever must settle it, so "No disputes are open" is said only when there are none. |

Verification after round 5 fixes: API 511 passed, 1 skipped; web 121 passed.
