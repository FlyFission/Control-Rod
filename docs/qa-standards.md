# Quality standards and Control Rod

This page is for anyone who works under a quality assurance program, such as nuclear, aerospace, medical devices, process plants or regulated software, and wants to know how Control Rod relates to the standards they already use.

**Read this first.** Control Rod is not a quality assurance program, and it is not certified, qualified or assessed against any standard. Nothing on this page claims compliance. The tables show where an assessor would look for the evidence a clause asks for, what Control Rod does at that spot today, and what is missing. Whether Control Rod's records can serve as quality records is decided by your QA program, for a specific deployment, under your controls. See [boundary.md](boundary.md).

Status words below mean:

| Status | Meaning |
| --- | --- |
| **Built** | On `main`, with tests. See [status.md](status.md). |
| **Partial** | Part of it is on `main`. The row says which part is missing. |
| **Decided** | An accepted decision record (ADR) or spec exists, but it is not built yet. |
| **Gap** | Nothing covers it yet. |
| **Yours** | Your organization owns it, and Control Rod does not try to. |

## Where the ideas came from, and where they did not

There are two kinds of reference here, and they are kept apart on purpose.

**Lineage** means a source that shaped how Control Rod and its Nuclear context pack work. Every lineage source is public, so anyone can read it without a login or a purchase. The main ones are:

- [10 CFR 50 Appendix B](https://www.ecfr.gov/current/title-10/chapter-I/part-50/appendix-Appendix%20B%20to%20Part%2050), the 18 quality criteria for US nuclear plants. This page uses it as the backbone.
- [10 CFR 830 Subpart A](https://www.ecfr.gov/current/title-10/chapter-III/part-830/subpart-A), the DOE quality rule. Its graded approach is where Control Rod's rigor tiers come from.
- [DOE-HDBK-1028-2009](https://www.energy.gov/ehss/articles/doe-hdbk-1028-2009), human performance tools such as self-checking, pausing when unsure, independent verification and turnover.
- [DOE-STD-1073-2016](https://www.energy.gov/ehss/articles/doe-std-1073-2016), configuration management.
- [10 CFR Part 21](https://www.ecfr.gov/current/title-10/chapter-I/part-21), the duty to evaluate and report defects in supplied items.
- [NIST SP 800-218 (SSDF)](https://csrc.nist.gov/publications/detail/sp/800-218/final) and [SLSA](https://slsa.dev/), for secure development and build provenance.

The complete list, with what each source was used for, is the Nuclear-grade source map: [source-map.md](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md). Each skill in [`packs/nuclear-grade/reference/`](../packs/nuclear-grade/reference/) ends with a source-lineage note that names its own sources.

**Orientation** means a standard that this page cites only by clause number, so that a reader who knows that standard can find their way around. These include ASME NQA-1, ISO 9001, ISO 19443, IEC 61508 and DO-178C. They are paywalled. Nothing in Control Rod was derived from them, none of their text is copied here, and Control Rod claims no lineage from them. This follows the Nuclear-grade [do-not-cite-directly](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/do-not-cite-directly.md) rule and [docs/sqa/](sqa/README.md), which says requirements cite clause numbers only. If a clause number is wrong for the edition you use, please open an issue.

Editions assumed for the orientation columns are ASME NQA-1 Part I Requirements 1 to 18 and Part II Subpart 2.7 (software), and ISO 9001:2015. ISO 19443:2018 uses ISO 9001's clause numbers and adds nuclear-specific requirements on top of them. Where it adds something relevant, the row says so.

## The quick view: seven themes

These are the controls most QA programs ask about first. Each theme is covered in more detail in the full table below.

| Theme | What Control Rod does | Status | App. B | NQA-1 | ISO 9001 |
| --- | --- | --- | --- | --- | --- |
| Document control | Each change has a change record under `.nuclear/changes/`, validated in CI. Work packages release at a pinned revision, and a claim against an old revision is refused. Contracts in `spec/` are the single source, and the generated code is checked for drift. | Built | VI | Req. 6 | 7.5.3 |
| Design control | Guided preparation turns a rough request into confirmed requirements, a design basis and acceptance criteria before any work is released. Decisions are recorded as ADRs. Capital Projects interfaces with deadbands are specified but not built. | Partial | III | Req. 3 | 8.3 |
| Verification | Acceptance is checked against each criterion. A pre-check by a second agent is required before anything can be accepted. Missing evidence can never be waived. CI runs the type checks, tests, licence gate and SBOM. | Built | III, XI | Req. 3, 11 | 8.3.4, 8.6 |
| Independent review | The kernel refuses a pre-check that comes from the author's own agent baseline or the author's own model provider, unless the owner signs a written override. Trust-surface files need a maintainer who did not author the change. | Built (agents); Partial (people, one maintainer today) | III | Req. 3 | 8.3.4 |
| Records | An append-only, hash-chained event log with seals and inclusion proofs. Any proof can be checked offline with `pnpm cr verify` ([auditing.md](auditing.md)). Run evidence, sandbox policy and signed daemon attestations are stored per run. A retention schedule and outside-witnessed timestamps are missing. | Partial | XVII | Req. 17 | 7.5.3 |
| Corrective action | Failed pre-checks, returns, rejections and acceptance with findings are recorded. SCRAM stops work with a signed reason. Issues and security advisories track problems. There is no corrective-action register with root cause and closure. | Partial | XVI | Req. 16 | 10.2 |
| Approvals | Only a person can release, accept, return or reject, and only with a passkey signature over the digest of exactly what they reviewed. Signer qualifications are versioned, and revoking one adds a new version. | Built | II, III, VI | Req. 2, 3, 6 | 5.3, 8.6 |

## The full crosswalk: Appendix B criteria

Appendix B is public, so its 18 criteria are the rows. "What it asks" is a short summary in our own words, not the regulation's text. Read the regulation itself for that.

| # | Criterion (what it asks) | What Control Rod does | Status | Gap | NQA-1 | ISO 9001 | Other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I | **Organization.** Clear authority, and enough independence for the people who check quality. | Roles and authorities live in signer qualifications (`spec/tenancy.tsp`). The kernel enforces human-only decisions. The CODEOWNERS file names the trust surfaces. | Partial | There is one maintainer, so independent human review relies on the [sole-maintainer sign-off](collaboration.md#sole-maintainer-sign-off). | Req. 1 | 5.3 | 830.122(a) |
| II | **Quality assurance program.** A documented program, graded by importance, with training for the people in it. | Rigor tiers (administrative, quick, standard, high-consequence) and QA overlays are project settings ([ADR 0015](adr/0015-modes-rigor-overlays.md)). Signer qualifications record licences, disciplines and grades. | Partial | Today the tiers only change how much context is loaded and the order of the inbox, not which gates apply. Overlays are free-text labels, because the Cedar floors in `policies/` are placeholders. There are no training records. Your QA program is **yours**. | Req. 2 | 4.4, 6.1, 7.2 | 830.122(a), (b); ISO 19443 graded approach |
| III | **Design control.** Controlled design inputs, checked by someone other than the designer, with changes under the same control. | Guided preparation sets the requirements and acceptance criteria before release ([guided-preparation.md](guided-preparation.md)). The kernel requires an independent pre-check. ADRs record design decisions. A change after release needs a new revision. | Partial | The Capital Projects interface and deadband engine ([ADR 0016](adr/0016-flows-and-typicals.md)) and alternate-calculation checks are not built. There is no design-verification report. | Req. 3 | 8.3.2 to 8.3.6 | 830.122(f) |
| IV | **Procurement document control.** Purchase documents carry the quality requirements. | The disclosure gate decides which providers may receive which data lane before a run ([ADR 0021](adr/0021-native-cli-sandboxes.md)). The licence gate in CI refuses non-permissive dependencies. | Partial | There are no supplier requirement documents for model providers. Purchasing is **yours**. | Req. 4 | 8.4.3 | 830.122(g) |
| V | **Instructions, procedures and drawings.** Work follows written instructions, with acceptance criteria. | Each work package carries its brief and acceptance criteria. Agents get a composed `BRIEF.md` (Light or Nuclear context). `AGENTS.md` holds the repository's rules. | Built | None beyond your own procedures. | Req. 5 | 8.1, 8.5.1 | 830.122(e) |
| VI | **Document control.** Documents are reviewed, approved and issued at the right revision, and changes go through the same control. | Change records, pinned releases, digests of what was reviewed, refusal of work against a superseded revision, checksum-locked database migrations, and generated contracts with a drift check. | Built | Control Rod never issues a deliverable for construction. A licensed person does that through your document control. | Req. 6 | 7.5.2, 7.5.3 | 830.122(d) |
| VII | **Control of purchased items and services.** Check what you buy before you rely on it. | Agent runtimes are pinned by the SHA-256 of the executable. Daemon keys are enrolled and retired by a signed command ([ADR 0022](adr/0022-run-attestation.md)). Role trials will test each model before it is cast ([ADR 0023](adr/0023-role-casting.md)). The `vetting-outside-code-and-models` skill covers acceptance of outside code. | Partial | Role trials are proposed, not built. Model providers are not qualified as suppliers. | Req. 7 | 8.4 | 830.122(g); ISO 19443 counterfeit and suspect items; 10 CFR Part 21 |
| VIII | **Identification and control of items.** Every item can be traced to its records. | Content digests on deliverables, runs, policies and configuration. Requirement IDs (`REQ-<AREA>-<NNN>`) in [`sqa/requirements.sdoc`](sqa/requirements.sdoc). | Partial | The traceability matrix that the SQA package promises is not generated yet. | Req. 8 | 8.5.2 | |
| IX | **Control of special processes.** Processes whose results can't be fully inspected afterwards are run by qualified people with qualified methods. | The closest equivalent is an agent run. Each run records its sandbox policy, runtime, model and permission mode, and the daemon signs an attestation over them. | Partial | Agent runs are not qualified as a process, and the in-run probe is `not-run` ([ADR 0022](adr/0022-run-attestation.md)). | Req. 9 | 8.5.1(f) | |
| X | **Inspection.** Someone other than the performer inspects the work against the criteria. | Criterion-by-criterion acceptance by a person, after an independent pre-check. | Built | | Req. 10 | 8.6 | 830.122(h) |
| XI | **Test control.** Tests are planned, run against acceptance limits and recorded. | CI runs the TypeScript, Rust, Go and Python tests, the contract-drift check, the licence gate, the SBOM and change-record validation. The red-team catalog lives in `tests/redteam/`. | Partial | The V&V plan (`sqa/vv-plan.md`) does not exist yet. The browser suite runs on Chromium only. | Req. 11 | 8.3.4, 8.6 | 830.122(h) |
| XII | **Control of measuring and test equipment.** The tools you measure with are calibrated. | The closest equivalent is pinned tool versions and checks with recorded inputs, outputs and digests (AGENTS.md rule 5: no engineering number is typed by a model). | Partial | Checkers are not formally qualified as tools. See [Tool qualification](#tool-qualification) below. | Req. 12 | 7.1.5 | |
| XIII | **Handling, storage and shipping.** Items are protected from damage and loss. | Data lanes control where data may go. Backup and restore are covered in [preparation-recovery.md](preparation-recovery.md). Quarantined output from a SCRAM is kept privately with its digests. | Partial | There is no egress proxy yet, so endpoint enforcement is recorded as `endpoint not enforced`. | Req. 13 | 8.5.4 | |
| XIV | **Inspection, test and operating status.** You can always tell whether something has been checked. | Each package has a status (draft, released, in work, in verification, accepted, closed) that only the kernel can change. | Built | | Req. 14 | 8.5.2 | |
| XV | **Nonconforming items.** Items that fail are identified, kept out of use and dispositioned. | A failed pre-check blocks plain acceptance. Accepting anyway needs a written reason. Return and reject are signed. Missing evidence can never be waived. | Built | Dispositions are not rolled up into one nonconformance report. | Req. 15 | 8.7 | |
| XVI | **Corrective action.** Find the cause of significant problems and stop them coming back. | Issues, security advisories, and the `tracking-deficiencies`, `learning-from-experience` and `reporting-shared-defects` skills. SCRAM can stop all work with a signed reason. | Partial | There is no corrective-action register with cause, action, owner and closure verification. | Req. 16 | 10.2 | 830.122(c); 10 CFR Part 21 |
| XVII | **Quality records.** Records are complete, identifiable, retrievable and kept. | An append-only event chain with hashes, seals and inclusion proofs. Evidence is stored per run, along with signed decisions, change records and git history. | Partial | There is no retention schedule. The outside-witnessed transparency log ([ADR 0009](adr/0009-evidence-format.md)) is decided but not built. | Req. 17 | 7.5.3 | 830.122(d); 21 CFR 11.10(c), (e) |
| XVIII | **Audits.** Planned, documented audits of the program, by people independent of the work. | Control Rod gives auditors what they need to check records: an [auditor's guide](auditing.md), a check of the whole chain, inclusion proofs for each package, and `pnpm cr verify`, which checks a proof offline with no database or sign-in. | Partial | Planning and running audits is **yours**. There is no export for a time window yet, and no audit record inside Control Rod. | Req. 18 | 9.2, 9.3 | 830.122(i), (j) |

## Software-specific controls

Control Rod is software that a QA program may want to qualify, so these frameworks matter too.

| Topic | What Control Rod does | Status | Reference |
| --- | --- | --- | --- |
| Software QA plan and requirements | [`sqa/README.md`](sqa/README.md) (draft) and `requirements.sdoc` with requirement IDs | Partial | NQA-1 Part II Subpart 2.7 |
| Configuration management | Git, change records, CODEOWNERS trust surfaces, pinned actions in CI | Built | NQA-1 Subpart 2.7; DOE-STD-1073; SSDF PS.1 |
| Graded rigor for software | The kernel is held to the highest rigor, then the control plane and daemon, then the people-facing interfaces ([`sqa/README.md`](sqa/README.md#grading)) | Decided | NQA-1 Subpart 2.7; 10 CFR 830 graded approach |
| Electronic signatures | A passkey assertion over the record digest, bound to one action, one person and one short-lived challenge | Built | 21 CFR 11.50, 11.70, 11.100 to 11.300 |
| Audit trail | An append-only, hash-chained event log recording who did what, when | Built | 21 CFR 11.10(e) |
| Access and authority checks | Passkey sign-in, tenancy, human-only actions in the kernel, and signer authority by grade | Built | 21 CFR 11.10(d), (g) |
| System validation | CI test suites. The V&V plan is planned. | Partial | 21 CFR 11.10(a) |
| Build integrity and provenance | SBOM in CI, licence gate, pinned dependencies. Signed releases and provenance are planned. | Partial | SSDF PS.2, PS.3; SLSA |
| Third-party code | Permissive licences only (AGENTS.md rule 4), clean-room pattern notes, originality check | Built | SSDF PW.4 |
| Code review and testing | Independent pre-check, human acceptance, CI tests | Built | SSDF PW.7, PW.8 |
| Responding to vulnerabilities | [SECURITY.md](../SECURITY.md) and security advisories | Partial | SSDF RV.1 to RV.3 |

## Tool qualification

Safety-software standards such as IEC 61508 (functional safety), DO-178C with DO-330 (airborne software tools), ISO 26262 (road vehicles) and IEC 62304 (medical device software) apply to the safety software itself. Control Rod is not safety software, and it does not target those standards. They matter when your team uses Control Rod's output as evidence for safety software, because then Control Rod is a tool whose output you rely on, and those standards expect you to qualify a tool in proportion to how much you rely on it.

What helps with that today: every run records the exact runtime digest, model, sandbox policy and permission mode, with a signed attestation; checks are deterministic scripts with recorded inputs and outputs; and the independent pre-check is enforced by the kernel. What is missing: a tool qualification plan, role trials (proposed in [ADR 0023](adr/0023-role-casting.md)), and the in-run probe. Until those exist, treat Control Rod output as unqualified tool output and verify it by other means.

## Gaps, in order of how much they would help a QA reviewer

1. **QA overlays that do something.** Write the Cedar floors in `policies/` so that an overlay such as "NQA-1" adds named gates, such as an extra independent check or a required record. Today an overlay is only a label. This is a trust-surface change and needs the owner's signature.
2. **Rigor tiers that change gates.** Make high-consequence work need more than standard work, not just more context.
3. **Traceability matrix and V&V plan.** These are the two missing items in the [SQA package](sqa/README.md).
4. **Corrective-action register.** Record cause, action, owner and closure check, linked to the findings that started it.
5. **Records retention and outside witness.** Write a retention schedule, and build the transparency log with an outside witness ([ADR 0009](adr/0009-evidence-format.md)).
6. **Audit export for a time window.** Checking a single package offline is already possible ([auditing.md](auditing.md)). What's missing is an export of the decisions, evidence and signatures for a period. It needs a new API contract in `spec/`.
7. **Supplier qualification for model providers, and role trials.**
8. **Training records** linked to signer qualifications.

## Using this page in an assessment

- Cite Control Rod features by file, ADR or requirement ID, not by this page.
- Check the status column against [status.md](status.md) and the code. This page can fall behind.
- Your QA program decides what counts as a quality record. Control Rod gives you the discipline and the evidence, and you decide whether they are enough.
