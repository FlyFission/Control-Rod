# PR 5B (#37): adjudication of Codex round 1

Codex returned REVISE with seven findings. All are accepted; the proof design was reworked rather than patched.

| # | Finding | Disposition |
|---|---|---|
| P1 | Proof exports disclosed other organizations' event bodies | Fixed: a proof is refused (`mixed-scope`) while the part of the chain it would carry names any subject another organization owns. Within one organization the bundle carries the same event records every Member already reads on the Records page (`GET /events`); a proof format that hides other entries (a different digest scheme) is beyond this task and is stated in the refusal. Test: another organization's event in the chain refuses the proof |
| P1 | The self contained checker did not authenticate the seal | Fixed: the bundle carries the seal and `seal_evidence` (the signer's retained public key, relying party id and origins); `verifyInclusion` reconstructs the subject from the payload and the challenge from subject and nonce, and verifies the passkey assertion. Its result separates `ok` (links and coverage) from `authenticated` (a covering seal whose signature checks), and the page says the remaining limit: whether the key in the bundle is the signer's must be confirmed from outside it. Tests: a fabricated seal with a recomputed subject, a changed purpose, and a missing evidence block each fail |
| P1 | Package identity and completeness were unauthenticated | Fixed: the segment is the whole chain from its first event, so nothing earlier can be left out, and the checker derives the package's events itself (its own subject, and runs the chain announced for it in `run.queued` and `run.started`), never from a supplied list. Tests: renaming the package, dropping the first event, and dropping any event fail |
| P2 | Retained keys were accepted without their history | Fixed: `chain.sealed` carries the seal's digest, so a seal row no event records is `unrecorded`; and a seal recorded after the chain recorded a revoked version of its passkey is `key-revoked`, while seals recorded before stay valid. Test: a fresh, correctly signed seal written after revocation is refused; earlier seals remain valid |
| P2 | Package verification discarded a global chain failure | Fixed: the proof response carries `chain` and `check` and an overall `ok` that fails when the chain fails anywhere. Test: a break after the package's sealed stretch leaves `check.ok` true and the proof failed |
| P2 | Verification reads could describe different states | Fixed: verification and proofs run in one repeatable read, read only transaction (`readTx`, as preparation views do). No deterministic interleaving test is included; the guarantee is the transaction's isolation level |
| P2 | Success claimed coverage through the refreshed head | Fixed: the message uses the head the seal itself returns. Test: the head shown moves on after sealing and the message keeps the sealed head |

The Codex connector threads (relabelled bundles pass; global failures discarded) are findings 3 and 5 and are resolved with them.

# Round 2

Codex returned REVISE with three findings; the bots added threads, some on earlier commits.

| # | Finding | Disposition |
|---|---|---|
| P1 | Mixed scope refusal checked only ownership envelopes | Changed approach: organization ownership is spread over many tables, so per event mapping would be partial. Proof export is now refused on any installation with more than one organization, since they share one chain (migration 009 already refuses writes unless exactly one organization is active). Lanes: a bundle carries the same event records `GET /events` already shows every Member; lane filtering of the event log does not exist today for either, and is recorded as a limit rather than claimed |
| P1 | A forged run announcement supplied package membership | Fixed in part, limit stated: the first announcement binds a run and a later conflicting one fails the proof, and a package with no event of its own is refused. A seal authenticates the chain as recorded, not that what a writer appended before it was true; that is the interim chain's stated limit (specification 11.6), now said in the ledger. Tests: conflicting announcements, a runs only package |
| P2 | Credential binding by user name; no enrollment check | Fixed: the signer's key is found through the credential's own record (credential, member and organization), never a user name; the seal must follow a recorded usable version and precede any recorded revoked one (`not-enrolled`, `key-revoked`); and `chain.sealed` now records the key's digest, so a key substituted later reads `key-changed`, on the server and in the offline checker. Tests: a substituted key, and restoring it |

Bot threads on earlier commits, now resolved by design: the anchor and truncated prefix (the segment starts at the first event), the trusted events list (the checker derives events), the global failure (paired with the chain check), an unsealed truncated tail (the bundle states the head and the tail must match it), native ownership (single organization export), and resubmitting the same package (it is proven again).

Also strengthened: the offline checker's signature path is now tested against a forger who recomputes every digest in the bundle, since no secret protects them; only the passkey signature stops a fabricated seal.
