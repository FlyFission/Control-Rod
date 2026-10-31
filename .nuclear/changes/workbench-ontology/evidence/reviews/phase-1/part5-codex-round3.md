Static review of `ee41d98` against the requested base; no files modified or tests executed.

Round 2 verification:

- **P5-14: Partial.** Unclassified direct preparation sources now refuse; legacy provenance remains incomplete (P5-23).
- **P5-15: Closed.** Active marking writers declare the write flag; the executor acquires the graph lock before callbacks.
- **P5-16: Partial.** Exact marking versions and same-lane propagation are fixed, but content and output changes can retain the approved version (P5-24).
- **P5-17: Closed.** Decisions and independence overrides recheck credentials and authority under the administration lock.
- **P5-18: Closed.** Conflicting classified dependency rows become explicit.
- **P5-19: Closed.** The exclusive graph lock serializes marking recomputation before row locks.
- **P5-20: Closed.** Approved N/A enforces required independence.
- **P5-21: Closed.** Enrollment retains the attestation object, including its certificate chain, and verifying anchor digest.
- **P5-22: Closed.** Confirmation checks qualification before prompting and again under the administration lock when recording.

No additional High/Critical command-flag or lock-order defect found.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P5-23 | High | **Legacy jobs still bypass source classification and provenance.** An upgraded internal package without markings is admitted using its stored lane, while its job includes live capture text, attachments and dependency outputs. An unclassified capture or restricted dependency therefore reaches Claude/Codex. Lazy materialization also creates a package marking without reconstructing its provenance edges. | [markings.ts:113](/home/flyfission/worktrees/control-rod-phase0/services/api/src/markings.ts:113), [work.ts:682](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:682), [work.ts:583](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:583), [work.ts:585](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:585) | Materialize complete legacy provenance under the write lock, refusing unclassified sources. Dispatch must validate every transmitted source rather than trust a package-lane fallback. |
| P5-24 | High | **Declassification still covers unapproved content and outputs.** Approve A’s declassification over restricted draft B, then edit, run and accept B without changing its lane or input identities. B’s marking version remains unchanged, so A’s override still covers it. A’s legacy job then transmits B’s newly produced outputs to subscription runtimes although the approval never covered those bytes. | [markings.ts:156](/home/flyfission/worktrees/control-rod-phase0/services/api/src/markings.ts:156), [work.ts:312](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:312), [work.ts:1153](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:1153), [work.ts:581](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:581) | Bind coverage to source content revisions and exact artifact digests. Invalidate and propagate coverage when either changes; verify those bindings during dispatch. |

BLOCK