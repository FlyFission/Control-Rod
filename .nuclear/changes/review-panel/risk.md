# Risk: review panel design spec

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-06 instruction to produce a review panel spec.
- Decision owner: Ben Huffer. No protected surface is touched by this record: no kernel decision function, policy, red-team fixture, workflow or spec major version. No product code changes. The later build does add reviewer profiles (an agent-authority surface), a migration and additive `spec/` models, each gated by its own record.
- Scope: `docs/superpowers/specs/2026-11-06-review-panel-design.md` and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A reviewer gets write access or runs with a permission bypass flag, and alters the code under review or the host. | Anti-goal in spec section 4; read-only snapshot copy, private home, no secrets, OS sandbox (ADR 0021); no `--dangerously-skip-permissions`, `--yolo` or `bypassPermissions`; Codex runs under Control Rod's permission profile launch and never with `-s` or `sandbox_mode` (ADR 0021: a set `sandbox_mode` makes Codex ignore the profile that denies the login files); write canary re-checks the snapshot digest and voids a seat that changed it. | Any profile or run that uses a bypass flag, or a seat that can write the snapshot. |
| R-02 | Content reaches a provider before the data lane is classified and admits that provider. | Lane must be classified and must admit each seat's runtime and provider before any seat starts; a refused seat records the reason; tested with a seat the lane does not admit. | Any seat started before lane classification, or for a provider the lane does not admit. |
| R-03 | Agreement is read as proof or approval, or the report is read as a pass or a person verification. | Agreement raises priority, not confidence; same-vendor seats count once; empty seats never count; quorum and vendor counts are reported separately and the single consultant line applies only when one vendor answered; the report never says "passed" and carries "Model review is not proof."; the card says the panel does not replace person verification on Safety or Material work. | Any screen, report or doc that shows a panel as passed, approved or verified. |
| R-04 | An unqualified CLI is enabled as a seat. | A runtime gets a seat only after the exact reviewer invocation passes the ADR 0021 suite, with credential reads and writes tested denied; Grok, Antigravity and Gemini are off until qualified (R7); a test fails if a runtime lacks a profile row. | A seat enabled for a runtime with no recorded qualification of that exact reviewer invocation (CLI version, platform, read-only grant). Evidence today is the author launch on WSL2 only (Claude Code 2.1.318, Codex 0.166.0); the full ADR 0021 suite and red team fixtures await the owner's signature. |
| R-05 | A reviewer profile change widens what an agent may do without the owner gate. | Profiles are an agent-authority surface; they change only through the same owner gate as other agent-authority changes (spec sections 6.2 and 7); each profile records flags and the last CLI version verified. | A profile change merged without the owner gate. |
| R-06 | A finding cites code that does not exist and is treated as real. | Mandatory Stage 1 gate: path exists, lines in range, quote appears at those lines; failures go to a collapsed "Unverifiable claims" list and never count; Stage 2 refutation is a later slice. | A finding shown or counted that failed Stage 1, or a fabricated finding that passes it. |
| R-07 | Scope creep into parked items (unattended panels, debate rounds, a severity-rewriting judge model, Gemini consumer sign-in). | Non-goals in spec section 4; one stand-alone pull request per slice; a slice that needs an open decision in spec section 10 stops and asks the owner. | A slice pull request that touches a non-goal or a protected surface. |
| R-08 | Design flaws remain after the one review run so far: two rounds of one Codex reviewer (E-03), coupled to the author through the brief, found fifteen issues, now fixed in the spec; it is not independent assurance. | E-03 is recorded as one model reviewer, coupled through the author's brief; verification and ship say so; the owner decides whether further review is wanted before approval. | The owner approves on the claim that the spec was independently reviewed. |
| R-09 | A secret (tracked `.env`, committed key, token in source, in a diff, in an unchanged part of a base file, or inside a tracked archive or binary) reaches storage or a provider, or an old confirmation authorizes different content, including a changed brief. | Content policy (spec 6.1a) on the head snapshot, base tree and diff before upload, with the confirmation bound to their post-policy digests, the policy result, lane and recipients: secret denylist exclusion for tracked and untracked files, scanner pass, person confirms the list; tests with a tracked `.env` and a tracked key. | Any seat started on content that skipped the policy, or a snapshot digest not computed after it. |
| R-10 | A finding about a deleted file, deleted lines or a document section is wrongly quarantined, or a fabricated one passes. | Typed locations (head lines, base lines, deleted file, section) each with a deterministic check; tests for deleted files and lines and for sections. | A valid removal or section finding shown as unverifiable, or an unchecked location type accepted. |
| R-11 | The card pre-check seat bypasses the existing baseline, runtime and independence checks, or a quorum line misstates the review. | The designated seat is created as an ordinary `pre-check` run through `queueRun` and completes through `finishPreCheck`; an existing active run is linked only as separate evidence and never counts toward quorum; a panel-queued run is pinned to the requested runtime with the complete pre-check inputs under the content policy, and is refused if the policy withholds a required input (a claim path change in R8); seat outcome is mapped separately from the verdict; quorum and vendor counts are computed separately and reported as actual counts. | A review run converted into a pre-check, or a report claiming a single consultant when more than one vendor answered. |

## Selected mode

- **Mode:** Standard
- Basis: the feature changes what agents may do (reviewer profiles are an agent-authority surface) and adds a database migration, though this record changes neither.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its research evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the review panel is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
