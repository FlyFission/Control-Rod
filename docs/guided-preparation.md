# Manual guided preparation

This branch adds a local manual preparation slice. Enable new enrollment with `CONTROLROD_GUIDED_PREPARATION=1` before starting the API. It defaults off. Existing enrolled packages remain controlled when enrollment is off; switching the flag cannot restore legacy release.

Intake enrolls every new draft package when enabled. Existing drafts have a **Start guided preparation** button. Review the captured problem, classify the request, edit requirements and criteria, record questions and their owners, and write the technical plan and verification mappings. Save before recording an answer; answers retain the authenticated human actor and rationale. Changes append revisions. A stale save keeps local work and requires explicit comparison/reload; the API never silently merges it.

Requirement and criterion identifiers are stable and cannot be reused after retirement. Criteria update the draft package atomically. Existing draft editing refuses enrolled packages so the package and companion cannot diverge. Historical snapshots remain readable with their original digests.

Cut A holds release for every enrolled package. Requirements confirmation, prepared release, execution and criterion-result admission are subsequent steps in the [execution plan](superpowers/plans/2026-10-23-platform-buildout.md). Mapping checks is not executed verification. Automated preparation and runtime confinement are not implemented by this manual slice.

The migration registry checks recorded SQL checksums and refuses unknown future migrations. Backup before upgrades. This is not a proven backup/restore or old-binary downgrade procedure; that rehearsal is a separate pilot gate. Source and built-server migrations use the same compiled SQL modules.
