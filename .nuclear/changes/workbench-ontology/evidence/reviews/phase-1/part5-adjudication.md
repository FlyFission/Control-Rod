# Phase 1 part 5 review adjudication (PR #23)

Reviewer: Codex CLI, static read only review against `origin/buildout/controlled-preparation-20261023`.

## Self review before round 1 (commit 7bf7b3c)

- Editing a declassified draft without touching its lane raised it back. Fixed: only a lane the person changes is a raise. Test: markings "keeps a declassification when a draft is edited without touching its lane".
- Concurrent marking writers could collide on a version. Fixed: per object marking lock.

## Round 1 (part5-codex-round1.md): 13 findings, all accepted

| ID | Disposition | Fix and evidence |
|---|---|---|
| P5-01 | Fixed | An override now covers the exact input versions its approval saw; an input added later, or raised since, still counts (`MarkingOverride.covered`). Test: "lets an input added after a declassification raise the package again". |
| P5-02 | Fixed | Every preparation snapshot marks the package with its basis captures, attachments (as their capture) and packages; a preparation contract edit may raise the lane and refuses lowering. |
| P5-03 | Fixed | The claim takes the capture row (share) and the marking lock in the order classification and declassification take them, before reading the lane; the job is built in the same transaction, so a raise waits for it. |
| P5-04 | Fixed | Originators include enrolling, editing, resolving, refreshing and revising preparation. Test: "counts preparation authors as originators". |
| P5-05 | Fixed | Recording takes the administration lock, rechecks the signing credential and the membership (via `signingGaps`) inside it. |
| P5-06 | Fixed | The signed digest binds the decision subject (outputs and pre-check) and the author run. Test: "binds the signature to the author output it saw". |
| P5-07 | Fixed | Credentials record `attestation_verified`; signing evaluates the floor under the current policy (`currentFloor`). Legacy records can only lose eligibility. Test: "applies a policy that drops the key's format at once". |
| P5-08 | Fixed | An N/A basis cannot set aside a criterion with a mandatory check (E-1). Truth table rows added. |
| P5-09 | Fixed | `combine` keeps `inconclusive_present`; `answer` blocks on `mandatory_inconclusive`. Rows added. |
| P5-10 | Fixed | PersonVerification retains `subject_digest` and `challenge_nonce` (challenge is SHA-256 of digest, purpose and nonce). |
| P5-11 | Fixed | The trigger drops a classified dependency when its citation is removed. Test in dependencies migration case. |
| P5-12 | Fixed | Dependency changes take one advisory lock before the cycle check. |
| P5-13 | Fixed | Derived markings recompute in topological order, refusing a provenance cycle. Test: "recomputes a diamond in dependency order". |

## Round 2 (part5-codex-round2.md): closed P5-03 to P5-07 and P5-09 to P5-13; nine findings, all accepted

| ID | Disposition | Fix and evidence |
|---|---|---|
| P5-14 | Fixed | An unclassified source is refused (`unclassified-source`); objects classified before markings get version 1 from their recorded lane (`ensureMarking`), and plain document citations are not treated as objects. Test: "refuses an unclassified source". Preparation fixtures now classify their captures. |
| P5-15 | Fixed | One marking graph lock: commands that may change markings take it exclusively and the claim takes it shared, both first, through a `markings` flag on the command catalog read by the executor. A marking write outside such a command throws. Test: "refuses ... a marking change outside a marking command". |
| P5-16 | Fixed | An override covers exact input versions, and every new marking version propagates, even at the same lane. Test: "covers only the exact input versions a declassification approved". |
| P5-17 | Fixed | Decisions and the independence override take the administration lock and recheck the signing passkey first (`lockSigner`), as person verification does. Test: "refuses a decision signed with a passkey revoked after the prompt". |
| P5-18 | Fixed | An explicit dependency on a classified target promotes the row to explicit. Test in the dependencies migration case. |
| P5-19 | Fixed | By P5-15: one graph lock taken before any row lock, so no ordering among objects exists to invert. |
| P5-20 | Fixed | N/A also requires the grade's independence. Truth table row added. |
| P5-21 | Fixed | Credentials keep the attestation object and the SHA-256 of the trust anchor that verified it (`attestation_evidence`). Test asserts the anchor digest. |
| P5-22 | Fixed | Requirements confirmation needs the originator, approver or engineer in responsible charge role and the grade coverage, checked before the prompt and, after `lockSigner`, in the transaction. |

Lock order now, everywhere: marking graph lock (by the executor), administration lock, then rows.
