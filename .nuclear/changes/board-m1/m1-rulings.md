# M1 rulings (binding)

These are the controller's binding rulings for slice M1 of the board redesign, as given to the
implementers. They are committed here because the ledger they were first written in is not tracked;
a second developer reads the repository, not the ledger (ruling 15). Each ruling names what it
decides, why, and what it costs. Where a ruling names a path that later moved (for example the
contrast evidence, now under `.nuclear/changes/board-m1/evidence/`), the current path is in the
"M1 as built" section of `docs/superpowers/plans/2026-11-06-board-redesign.md`.

Rulings 1 to 15 are quoted from the M1 final review findings (dashes rewritten as semicolons).
Rulings 16 to 18 came from the controller after a Codex review of PRs #65 and #60, in the same fix wave.

- Ruling 1: Slice branches stack on board-redesign-spec, not main, because the plan, spec and change record exist only there until PR #60 merges; M1's PR targets board-redesign-spec and is retargeted to main after #60 merges; costs a rebase if #60 changes.
- Ruling 2: Task 1 adds apps/web/scripts/check-contrast.mjs that computes WCAG contrast from tokens.css for every look and writes .nuclear/changes/board-redesign/evidence/tokens-contrast-looks.txt, plus a Vitest test that fails under 4.5:1 for text pairs; AGENTS rule 5: ratios come from a script, never typed; costs one small script.
- Ruling 3: the route returns a new additive response model PersonVerificationEntry (PersonVerification fields plus package_revision: int32) joined through candidate_assignments, instead of changing the strict existing PersonVerification model; additive contracts only (GOAL, spec section 7); costs one extra model in spec/api.tsp; web code must use PersonVerificationEntry, so the plan's Task 3 'PersonVerification' consumption reads as PersonVerificationEntry (Task 2)
- Ruling 4: boardColumn's verified parameter is boolean | null; null means the caller cannot see person verifications (office AgentCard, legacy callers) and keeps the old mapping (in-verification with passed pre-check -> needs-signature) rather than guessing person-verifies; avoids mislabeling verified Safety work in the office view; costs one extra branch; verifications arrive as PersonVerificationEntry (Ruling 3) (Task 3)
- Ruling 5: a Person verifies card shows 'Waiting on a person verification' until Task 7 supplies verify standing; Task 7 extends NextInput with an optional verifyStanding so an eligible viewer sees 'Verify' as a needs line; the actions endpoint does not list Verify (builder check); costs one interim wait line in M1 to M3 (Task 3)
- Ruling 6: PackageView gains an additive optional field originators: string[] (actor ids from the server's existing originators() in person-verification.ts); the card owner is originators[0] and viewerIsOriginator = originators includes the session user; no readable model names a package's creator; costs one additive spec field; the board fetches GET /packages/:id per visible package (it needs pre_check and runs anyway) (Task 4)
- Ruling 7: session.user is a user name while hasOtherQualified takes a member id; Task 4 maps user name to member id through admin.members (user_name field); Task 3 treats viewer as member id; costs a lookup; a viewer with no member row counts as not qualified (Task 4)
- Ruling 8: owner order is computed in the package view handler only (earliest event per actor, capture.created first); the shared originators() used for verification exclusion stays unchanged; avoids touching verification semantics; costs one extra query in the view (Task 4)
- Ruling 9: cheap minors folded into fix round 1 because they are the same false-claim family or one-liners: initial stream status is "connecting" not "live"; ok word "Accepted" not "Done"; Playwright spec writes its own output path; places.ts Office purpose updated (Task 4)
- Ruling 10: looks apply only to the board container in M1 (data-look on the board root, not the document); the rest of the app stays look A until M8 tokenizes styles.css, office.css and floor.css; honest AA now without a full restyle; costs a look switch that only changes the board; --line added to the surface tokens
- Ruling 11: when a Safety or Material card's verifications are pending or failed, the column is Person verifies (verified false), never the legacy Needs signature; the column must not imply the step is cleared; costs a card possibly shown one column early
- Ruling 12: until Task 7 reads eligibility from the server, hasOtherQualified matches the server's rules as far as the web can see (verify role, discipline, latest qualification version, not revoked, active member, excluding every originator mapped to members); licence currency is not checkable on the web and is said in a code comment; the O6 line shows to every viewer, naming that originators are excluded; O6 says the card says so plainly; costs possible over-reporting when a licence has lapsed
- Ruling 13: the card follows spec 8: while the stream is unknown the card shows "Status unknown since <time>" instead of its last state; spec wins over the implementer's wording; costs less information on a stale card
- Ruling 14: GET /packages/:id is gated by the caller's organization like the new route, because it now returns originators; additive data must not widen a pre-existing scoping gap; costs one ownership check per request
- Ruling 15: interfaces as built (Rulings 3 to 14) are written into the committed plan as an "M1 as built" note and into a committed rulings file in the change packet, because the ledger is gitignored; a second developer reads the repo, not the ledger; costs a doc update
- Ruling 16: on a Safety or Material card without a passing verification for the current revision, the verification requirement outranks any allowed accept or accept-with-findings action in the next line, and the board offers no Accept for such a card; this is a UI block, and the code says it is screen-only until the kernel guard D-4 is signed. Later extended (finding D) to the shared decision bar, so the package page, the case view and direct navigation use one rule.
- Ruling 17: an implementation change record `.nuclear/changes/board-m1/` (basis, risk, plan, trace, verification, ship) holds slice M1: the M1 trace row, the M1 evidence, the E-05 verification rows and this rulings file. The `board-redesign` record goes back to design-only content and links to `board-m1` for implementation status. Both records validate with `ng.py validate --strict-custody`. The board-m1 ship record proposes merging PR #65 after review; the owner retains the merge decision.
- Ruling 18: a pass on the current revision may not cover the current work, since the author output or pre-check can change within a revision. `PersonVerificationEntry` gains an additive boolean `covers_current_subject`, computed on the server in `listPersonVerifications` by recomputing the verification subject digest for the package's current subject and comparing it with what the record bound. The acceptance block and the Person verifies column lift only for a pass with `covers_current_subject` true.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md).

## Exit criteria

Every ruling here is either reflected in the code and tests of PR #65 or, for rulings about process (1, 2, 15, 17), in this packet and the plan's "M1 as built" note.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
