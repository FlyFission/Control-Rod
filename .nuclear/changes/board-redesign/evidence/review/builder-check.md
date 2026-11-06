# Builder check of the spec (2026-11-06)

A Sonnet subagent read the spec as its builder and checked every concrete claim against the code (read only). Four claims were corrected in the spec:

1. Return does not start a run: it closes the revision and opens revision N+1 as a draft; a second signed Release starts the run (`services/api/src/work.ts` Return and Release paths).
2. A `/board` route and `pages/Board.tsx` already existed; M1 is a rework.
3. The actions endpoint lists release, accept, accept with findings, return and reject only; Verify standing comes from the person-verification options call.
4. Run usage events carry tokens, not cost; per-card usage is summed from run events because `/usage` is organization wide.

Gaps resolved in the spec: a read route for a package's person verifications (M1) and for a previous revision's outputs (M6), both additive; failed pre-check stays in Agent check with the dispute line; grade locked in the UI after the first revision (O8, UI only until the parked kernel rule); captures can yield several packages (`package_ids`); Stop shows "Stopping" until the outcome arrives; code review diffs a patch output or lists files.

Owner questions it raised were answered by existing owner decisions: O6 (solo blocked), O8 (grade fixed once work starts), GOAL scope (small additive reads allowed).
