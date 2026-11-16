# ADR 0019: Build our own workbench; learn from Kandev through a clean room

- Status: Proposed
- Date: 2026-10-22

## Context
Kandev is an open workbench for running coding agents: a board of tasks, live agent sessions, review screens, executors, plugins and an experimental "Office" mode. It solves many problems Control Rod also faces, and Ben may want to use it for his own coding.

Several facts weigh on how Control Rod may use it.

1. **License.** Kandev, including its documentation, is AGPL-3.0. Our readers reported that no commercial license is offered and that the project has about 77 copyright holders. Under the clean-room rule below, the builder of this record did not re-check those facts in Kandev's repository; a lawyer should confirm them.
2. **Our license plan.** Control Rod's core is Apache-2.0 and its discipline packs live in a private FlyFission repository (ADR 0002). AGENTS rule 4 forbids copying code from AGPL and similar projects and says to port ideas from pattern notes instead.
3. **Missing controls.** Kandev does not have the controls that define Control Rod: a kernel that refuses illegal state changes, decisions signed with a passkey over a content digest, a hash-chained event log, an independent pre-check on a different runtime that never sees the author's transcript, and deliverables beyond code (calculations, drawings, reports, maps). In its Office mode agents record approvals and a person's approval is advice only, which is the opposite of our rule. Its documentation admits it has no complete security audit log and that, by default, accounts are off and the server binds to all interfaces.
4. **Size and pace.** The public documentation alone runs to more than 50 pages, five of them over a thousand lines, and tracks the main branch ahead of releases; large features sit behind flags while in progress. Following that pace from a fork would be a standing cost.
5. **Shape.** Kandev centres on long-lived conversations a person steers. Control Rod centres on one-shot runs against a frozen package revision. Many of Kandev's hardest parts manage a live chat we do not have.

## Decision
Control Rod builds its own workbench. We do not fork Kandev, embed it, link to it, ship it, or build Control Rod as a Kandev plugin or as a separate program driving Kandev's API. We learn from Kandev only through clean-room pattern notes (`docs/patterns/kandev.md`), and we write every line of Control Rod ourselves.

Ben may run an unmodified Kandev on his own machine for his own coding work. That use needs no integration: Control Rod does not call it, read its data, share its folders, or depend on it in any build or runtime path.

## Conditions
1. **Readers.** Readers study only Kandev's public documentation and its observable behaviour when run. They write notes in their own words describing behaviour, rules, states, failure modes and reasons. Notes contain no code, configuration, schemas, API path lists or copied sentences; short quoted phrases are allowed only for a UI label or feature name. Readers do not open Kandev's source code.
2. **Builders.** People and agents who write Control Rod's docs, specs and code work from the notes only. They never open Kandev's documentation or source. If a builder needs more detail, a reader answers in a new note.
3. **Independent wording check.** Before a pattern file merges, someone who did not write it, and who may read both, compares it with Kandev's public documentation for copied wording (for example by overlapping word sequences) and with the notes. Matches are rewritten. The check and its result are recorded in the change record.
4. **Provenance.** Every pattern file carries a header naming the source, its license, the date and the clean-room rule. Raw notes and observers' screenshots are working papers kept out of the repository.
5. **Nothing shipped from Kandev.** No Kandev code, assets, screenshots, text or generated output enters the repository or a release.
6. **Legal review.** The license reading in this record is ours, written by engineers. A lawyer confirms it before any commercial release of Control Rod, before any change to how Ben uses Kandev, and before any integration with Kandev is considered.
7. **Revisit triggers.** Revisit this decision if Kandev offers a commercial license, changes its license, or if a lawyer advises otherwise.

## Alternatives considered

| Option | What it would mean | Consequences | Outcome |
|---|---|---|---|
| Fork Kandev | Start from its code and add our controls. | The combined work would carry AGPL-3.0 terms, which conflict with an Apache-2.0 core and private packs offered over a network. Relicensing would need about 77 copyright holders, and no commercial license is offered. We would still build the kernel, signed decisions, event log, independent pre-check and engineering deliverables ourselves, on a base built for a different shape, and carry merges against a fast-moving upstream. | Rejected |
| Contribute upstream | Offer our controls to Kandev. | Our controls would live under AGPL in their tree, and their direction (agents recording approvals) runs against ours. It would not give us a product we can license our way. | Rejected |
| Separate program over Kandev's API or MCP | Run Kandev as its own process and drive it from Control Rod. | Whether this keeps the licenses apart is a legal question. Our gates would sit outside the place agents actually run, custody of runs and traces would live in Kandev, users would need to install AGPL software, and we would depend on an API that changes quickly. | Rejected for the product; Ben's personal use is allowed with no integration |
| Kandev plugin | Ship Control Rod as a plugin inside Kandev. | Whether a plugin is a derived work is a legal question. Kandev treats native plugins as fully trusted code in the same page, which conflicts with keeping the passkey DecisionBar apart from outside code. Our product would live inside theirs. | Rejected |
| Clean-room port of Kandev | Re-implement Kandev's features from specifications. | Avoids copied code but recreates a product shaped around live chat that does not fit our one-shot runs, and porting the whole surface raises the risk of reproducing its expression. | Rejected as a goal; we port selected ideas only |
| Own build informed by clean-room notes | Build Control Rod's workbench to our own design, taking ideas that fit. | Keeps our licenses and controls intact and lets us skip what does not fit. We carry the full build cost and must keep the clean-room procedure honest. | Chosen |

## Consequences
Easier: the Apache-2.0 core and private packs stay clean; Control Rod's defining controls stay central; we take only the ideas that fit our run model, and the pattern file records why each was adopted, adapted or skipped.

Harder: we build everything ourselves; the clean-room split costs reader and builder time; every new idea from Kandev must pass through notes and a wording check before it reaches our code.

## Evidence
- Pattern notes A to D (and E when it arrives) dated 2026-10-22, written from Kandev's public documentation; merged in `docs/patterns/kandev.md`.
- ADR 0002 and AGENTS rule 4 for our license plan.
- The license facts in Context item 1 as reported by the readers; not re-checked by the builder under condition 2.
- The build plan in `docs/patterns/kandev.md#11-build-plan`, which checks every claim the notes make about our code against the MVP branch at commit `87d0f79`.
- Change record `.nuclear/changes/own-workbench-clean-room/`.
