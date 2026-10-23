# Manual guided preparation

This branch adds a local manual preparation slice. Enable new enrollment with `CONTROLROD_GUIDED_PREPARATION=1` before starting the API. It defaults off. Existing enrolled packages remain controlled when enrollment is off; switching the flag cannot restore legacy release.

Intake enrolls every new draft package when enabled. Existing drafts have a **Start guided preparation** button. Review the captured problem, classify the request, edit requirements and criteria, record questions and their owners, and write the technical plan and verification mappings. Save before recording an answer; answers retain the authenticated human actor and rationale. Changes append revisions. A stale save keeps local work and requires explicit comparison/reload; the API never silently merges it.

Requirement and criterion identifiers are stable and cannot be reused after retirement. Criteria update the draft package atomically. Existing draft editing refuses enrolled packages so the package and companion cannot diverge. Historical snapshots remain readable with their original digests.

Requirements can now be confirmed as a separate passkey action after their blockers are resolved; this does not release work. Release remains held for every enrolled package. Prepared release, execution and criterion-result admission are subsequent steps in the [execution plan](superpowers/plans/2026-10-23-platform-buildout.md). Mapping checks is not executed verification. Automated preparation and runtime confinement are not implemented by this manual slice.

The migration registry checks recorded SQL checksums and refuses unknown future migrations. Backup before upgrades. This is not a proven backup/restore or old-binary downgrade procedure; that rehearsal is a separate pilot gate. Source and built-server migrations use the same compiled SQL modules.

The manifest-release slice has a separate `CONTROLROD_PREPARED_RELEASE=1` flag, also off by default. It binds the current package, preparation snapshot, requirements confirmation and ordered controlled basis through the existing passkey release decision. Prepared run claims/completions now recheck the manifest and current sources; criterion-result acceptance is the next gate. Sources are retained as immutable inputs at release. A changed package, document, repository HEAD/blob, missing source or unsupported lane holds execution. Late/stopped/stale prepared output is retained privately and never served as a deliverable. Signed return creates an unconfirmed companion for the new package revision.

## Source providers

The default repository reference `repository:control-rod` reads tracked blobs from the configured server repository root; it grants no agent repository access. Other repositories and document/policy references require an owner-managed JSON file via `CONTROLROD_PREPARATION_CONFIG`. For example, `{"repositories":{"repository:project":"/controlled/project"},"sources":{"document:brief":{"kind":"document","revision":"A","path":"/controlled/brief.md"}}}`. Unknown fields, ambiguous JSON and non-string revisions refuse startup.

Repository refs pin full HEAD commit, relative path and SHA-256 of the blob; current working bytes must match the pinned blob. Document/policy refs pin configured revision and raw-file SHA-256. Package refs pin the current revision and canonical stored body. Capture refs hash only original identity/text/source/time, excluding intake routing fields; attachment refs hash their original bytes. Source reads are bounded to 5 MiB each and 25 MiB total. These are resource budgets, not engineering values.

Prepared execution currently supports public/internal lanes. Other lanes require an approved confined runtime. Source checking is provenance validation, not runtime confinement, policy certification or engineering acceptance. External file changes are observed at release, claim, completion and acceptance; execution receives the retained pinned inputs. The PostgreSQL chain/immutable tables remain owner-local records, not an independent external trust anchor.

## Criterion result admission

An enrolled checker writes `criterion-results.json` using the generated `CriterionResultSubmission` schema supplied with the job. Submission binds package/revision/release-manifest and records every criterion and mapped check. The controller adds the canonical digest of the actual normalized verification record when storing `CriterionResultSet`; a checker does not guess server-owned metadata. Executed outcomes reference retained current-checker artifacts as `checker:<relative name>`. Claim JSON itself is not decisive evidence.

Normal acceptance requires passing results and complete required verification. Acceptance with findings needs a signed reason and can accept completed failed checks; it cannot waive missing/open/deferred/inconclusive mandatory checks, stale inputs, invalid signatures or wrong revisions. Results are checker reports with retained artifacts, not a certification that the method is sound. Human review remains required.

The workbench shows per-criterion reports and links only to admitted checker evidence. The server verifies retained bytes against the verification record's bound artifact digests at review/acceptance and on evidence reads. Altered evidence blocks acceptance while the owner can still return/reject the package with a controlled history.
