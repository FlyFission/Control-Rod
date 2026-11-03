No findings remain at any severity in `9562682`.

- **SCRAM provenance fixed.** Holds record `scram:<id>`; `scramOfHold` preserves provenance, including older holds without keys. Package and intake Inbox items carry `scram_id`, including SCRAM refusals. The [presenting guard](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:291) redacts independently of the later run read.
- **Unclassified intake identity fixed.** [work.ts:891](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:891) omits the shared key when no lane exists. The regression exercises two legacy queued intakes through the actual claim path.
- **Separate reads are acceptable for this confidentiality requirement.** Provenance travels with the sensitive text, so restart timing cannot remove its redaction marker. Mixed reads can still produce temporarily stale state. I found no alternative SCRAM-derived reason path into presenting responses.
- **Regression coverage matches the reported race.** [figures-race.test.ts:50](/home/flyfission/worktrees/control-rod-phase0/services/api/test/figures-race.test.ts:50) covers stale own/other Inbox items with cleared runs and checks the entire response for leakage.

API typechecking and in-memory projection checks passed; removing the provenance guard reproduced the leak. Integration tests could not start because PostgreSQL temporary-directory creation failed with `EROFS`; their reported passing results were not independently reproduced.

MERGE