# PR D (#35): adjudication of Codex round 1

Codex returned MERGE with two nonblocking findings. Both are fixed rather than deferred.

| # | Finding | Disposition |
|---|---|---|
| P2 | The theme preference was one origin wide key, so a second member on the same browser inherited the first member's choice | Fixed: the key is scoped to the signed in member (`controlrod.office.theme.<member>`), a choice made in a visit holds only for the member who made it, and the picker is disabled until the session says who is signed in. `office-view.test.tsx` switches members on one browser and asserts the second gets the default, not the first member's world |
| P3 | The ledger said every world passes 4.3 without the reference machine qualification | Fixed: the ledger now says the harness pass is a local run on the WSL2 development machine, the Q-10 reference check stays pending, and the measurements for all seventeen themes are retained in `.nuclear/changes/workbench-ontology/evidence/phase4/office-harness-local.json` (regenerated from a full 138 test run) |

CI on the first push: every check passed, no review threads.
