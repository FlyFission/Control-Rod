No blocker or major defects found in `74823ca..HEAD`.

- [subjects.ts:114](/home/flyfission/worktrees/control-rod-phase0/services/api/src/preparation/subjects.ts:114): Ordering is sound: signer lock, locked package/requirements, authority and hardware-key checks, stale-subject validation, then writes. The floor checks the actual signing credential under current policy, matching decisions and person verification.
- [inbox.ts:133](/home/flyfission/worktrees/control-rod-phase0/services/api/src/inbox.ts:133): Routing matches `packageActions`: qualified Safety/Material signers without an eligible key move to waiting-on-others. Options still return a challenge before credential eligibility is checked, consistent with existing signing flows; this cannot bypass server enforcement.
- [preparation-confirm.test.ts:223](/home/flyfission/worktrees/control-rod-phase0/services/api/test/preparation-confirm.test.ts:223): The isolated harness tests qualified Safety signing with a plain passkey, Inbox routing, floor refusal, and unchanged confirmation state. Material and eligible-key success cases remain untested.

API typecheck passed. Integration tests were inspected but could not run because their PostgreSQL harness requires writes unavailable in this read-only session.

MERGE