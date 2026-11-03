Three major findings remain in `2b64787`.

1. **[P1] Mixed-scope refusal still exports foreign subjects.** [seals.ts:235](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:235)

   The check searches only `object_owners`. Members, projects, workbench objects, authenticator records, and seals also have ownership stored directly in their tables. Their events can therefore pass this check and enter another organization’s downloaded bundle. Event actors and referenced objects are also unchecked. There is no effective-lane check.

   **Fix:** resolve organization and effective lane for every disclosed event, including its subject, actor, and referenced objects; refuse unresolved or unauthorized components. Add regressions for foreign members, comments, seals, credential records, and mixed lanes. The existing test covers only an enveloped capture.

2. **[P1] A forged run announcement still supplies “authenticated” package membership.** [seals.ts:205](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:205), [seals.ts:264](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:264)

   `packageRuns` unions every matching `run.queued` and `run.started` announcement without checking conflicting ownership. I reproduced a correctly linked, genuinely signed prefix containing `run.queued(RUN-A, WP-A)` followed by a forged `run.started(RUN-A, WP-B)`. Checking `WP-B` returned `ok: true, authenticated: true` and included both run events, despite having no direct package event for `WP-B`.

   A writer can append that announcement before an ordinary Member seals the chain. The seal authenticates the recorded bytes; it does not establish the claimed run ownership.

   **Fix:** commit immutable run-to-package ownership, validate announcements against it, and reject conflicting assignments. Carry the committed ownership evidence in the bundle and verify it independently. Add tests for conflicting announcements and nonexistent packages supported only by run announcements.

3. **[P2] Credential history checks require no enrollment and permit ambiguous signer lookup.** [seals.ts:122](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:122), [seals.ts:146](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:146)

   `signerKey` associates credentials with members using only `user_name`; member names are unique within an organization, not globally. It neither checks credential ownership against the seal’s organization nor requires a recorded enrollment for that member before the seal. The subsequent query checks only for recorded revocation. Using query doubles with the actual verifier, a correctly signed seal with no enrollment history returned `valid`.

   **Fix:** require a digest-verified enrollment event preceding the seal’s recording event, binding the credential, exact member, organization, and retained key. Resolve revocation against that binding. Add missing-enrollment, enrollment-after-seal, duplicate-name-across-organizations, and key-substitution tests.

Round 1 disposition:

| Finding | Verification |
|---|---|
| Disclosure | **Incomplete:** finding 1 |
| Seal signature | Signature reconstruction and WebAuthn verification implemented; tests cover changed purpose, signature, and missing evidence |
| Package identity/completeness | **Incomplete:** finding 2; genesis and missing-event checks are implemented |
| Key history | **Incomplete:** finding 3; ordinary revocation ordering works |
| Global-chain failure | Fixed in the response, endpoint, contract, and UI; regression test present |
| Consistent snapshot | Fixed: verification and proof reads use the same `readTx`; no concurrency regression test |
| Success head | Fixed: UI uses the returned seal’s head; advancing-head regression test present |

The recording-before-head probe returned `unrecorded`; revocation-before-recording returned `key-revoked`; later revocation preserved validity.

The UI now accurately qualifies signature verification against the bundled key and displays the actual sealed head. However, the blanket mixed-organization refusal claim in [api.tsp:620](/home/flyfission/worktrees/control-rod-p5records/spec/api.tsp:620) and the completed-task wording in the [execution ledger:116](/home/flyfission/worktrees/control-rod-p5records/docs/superpowers/execution/2026-10-29-workbench-buildout.md:116) exceed the remaining checks.

API typechecking passed. I executed the actual checker in memory with real signatures and query doubles; database and browser suites were inspected but not executed in this read-only environment.

REVISE