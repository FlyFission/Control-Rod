# Board Redesign MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the board the home of Control Rod, so a small team adds work, follows agents, and reviews, verifies and signs code and documents from it, with every on-screen claim backed by a record.

**Architecture:** A web-app rework (`apps/web`) over the existing API. Pure functions in `src/lib/` derive everything a card shows (column, kind, next line, lens filtering) from API data and are unit tested; components in `src/features/board/` and `src/features/review/` render them. Two additive read routes in `services/api` and `spec/api.tsp` supply what the web app cannot read today. No kernel, policy, workflow or spec major change.

**Tech Stack:** React 19, TanStack Router and Query, plain CSS on `src/design/tokens.css`, Vitest 5 with MSW 3 and Testing Library, Playwright 1.64 with @axe-core/playwright; Fastify, TypeSpec (`spec/`), Postgres on the API side.

**Spec:** `docs/superpowers/specs/2026-11-06-board-redesign-design.md` (approved by the owner 2026-11-06; the owner then chose subagent-driven execution, implementation is authorized per slice by the owner's instruction, and each slice opens its own change record). Decision record and evidence: `.nuclear/changes/board-redesign/`. Target mockup: `.nuclear/changes/board-redesign/evidence/mockups/board-v4-after-review.html`.

## Global Constraints

- One slice (M1 to M8) is one pull request; a slice starts only when the slices it depends on are merged.
- Slice dependencies: M1 none; M2, M3, M4 depend on M1; M5 on M1 and M3 (it uses `menuItems`); M6 on M5; M7 on M5 and M6 (it uses `ReviewComment`, `returnReason` and `SignPanel`); M8 on M1 to M7.
- Safety and Material work without a passing person verification for the current revision is never offered Accept or Accept with findings on any screen (board next line, Move to, card header, Review tab); this is a screen rule until the kernel guard D-4 is signed, and other API clients can still accept.
- AGENTS.md rule 2: do not edit `policies/`, `tests/redteam/`, `.github/workflows/`, a `spec/` major version, or kernel decision functions. If a task seems to need one, stop and ask the owner.
- `spec/` is the source of truth; after any `spec/` change run `pnpm spec` then `pnpm -C apps/web gen:api`; never hand-edit `src/api/schema.d.ts` or `spec/generated/`.
- Shipped dependencies: MIT, Apache-2.0, BSD or ISC only, versions pinned; nothing loaded from a third-party host at runtime (fonts stay self-hosted).
- UI copy: no em dashes or en dashes; plain words; never say a run was steered, gated, capped, attested or verified unless the record shows it (spec section 3). Cost always reads "cost not reported".
- Status is derived, never dragged: no cross-column drag anywhere.
- Meaning colors and symbols are fixed and never reused by a lens: needs you amber ▲ (`--needs`), independent check magenta ◆ (`--check`, new), blocked or refused red ✕ (`--stuck`), accepted green ✓ (`--done`); each always with its word. Kind hues: code `--kind-code`, documents `--kind-doc` (new).
- WCAG 2.2 AA: every text style at least 4.5:1 in every look; visible focus; real buttons and inputs; reduced motion honored.
- Each slice adds its row to `.nuclear/changes/board-redesign/trace.md` (disposition "implemented and tested") and its evidence under `evidence/`, and passes `python3 -I <nuclear-grade>/tools/ng.py validate --strict-custody .nuclear/changes/board-redesign`.

## Review Focus

- The event stream drops or goes stale: cards must read "status unknown since <time>" with a Reconnect button, never show their last state as current (Task 4).
- An action is refused because someone else acted first (409 or ETag conflict): the refusal shows on the card and the card stays put until the stream confirms a new state (Task 7).
- A capture's intake fails, or one capture yields several packages: the capture card shows the intake error, or is replaced by every package listed in `package_ids` (Task 8).
- A filter would hide every card waiting on a verification or signature: the board shows "N waiting on a signature are hidden by this view" with a Show control (Task 5).
- A retained output fails its digest re-check (409 `output-changed`): the review tab shows that refusal sentence, not an empty viewer (Tasks 11 and 12).

---

## M1 Board home

### Task 1: Kind, meaning tokens and looks

**Files:**
- Create: `apps/web/src/lib/kind.ts`
- Modify: `apps/web/src/design/tokens.css` (add tokens and `[data-look]` blocks)
- Modify: `apps/web/src/lib/storage.ts` (look preference)
- Test: `apps/web/src/lib/kind.test.ts`

**Interfaces:**
- Produces: `type Kind = "code" | "doc"`; `CODE_DELIVERABLE_TYPES: readonly string[]` = `["code", "patch", "pull-request", "change"]`; `kindsOf(pkg: WorkPackage): Kind[]` (one or both, code first, never empty); `type Look = "a" | "b" | "c"`; `loadLook(): Look`, `saveLook(l: Look): void` (default `"a"`, storage errors fall back to `"a"`).
- Produces (CSS): `--check`, `--kind-code`, `--kind-doc` on `:root`; `[data-look="b"]` and `[data-look="c"]` override the surface, text and accent tokens; look A is the existing palette.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads code from a code deliverable type, case and spacing ignored", () => {
  expect(kindsOf(pkg({ deliverables: [{ id: "D1", type: " Patch " }] }))).toEqual(["code"]);
});
it("treats any other deliverable as a document", () => {
  expect(kindsOf(pkg({ deliverables: [{ id: "D1", type: "concept site plan" }] }))).toEqual(["doc"]);
});
it("shows both for a mixed package, code first", () => {
  expect(kindsOf(pkg({ deliverables: [{ id: "D1", type: "report" }, { id: "D2", type: "code" }] }))).toEqual(["code", "doc"]);
});
it("defaults a package with no deliverables to a document", () => {
  expect(kindsOf(pkg({ deliverables: [] }))).toEqual(["doc"]);
});
it("falls back to look a when storage throws", () => { /* stub localStorage.getItem to throw */ expect(loadLook()).toBe("a"); });
```

- [ ] **Step 2: Run** `pnpm -C apps/web exec vitest run src/lib/kind.test.ts`. Expected: FAIL, `kindsOf` not defined.
- [ ] **Step 3: Implement** `kindsOf`, `loadLook`, `saveLook`; add the tokens. Pick `--check`, `--kind-code`, `--kind-doc` and the look B and C palettes from the mockup's token values, then compute their contrast against every surface with the existing contrast script and record it in `.nuclear/changes/workbench-ontology/evidence/phase0/tokens-contrast.txt` style under `.nuclear/changes/board-redesign/evidence/tokens-contrast-looks.txt`. Any pair under 4.5:1 for text is adjusted before commit.
- [ ] **Step 4: Run** the test again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): card kind, meaning tokens and looks`.

### Task 2: Read route for a package's person verifications

**Files:**
- Modify: `spec/api.tsp` (inside the `/packages` interface, next to `actions`)
- Modify: `services/api/src/person-verification.ts` (export a reader)
- Modify: `services/api/src/app.ts` (route beside `/packages/:id/proof`)
- Test: `services/api/test/person-verification.test.ts` (new `describe`)

**Interfaces:**
- Produces (HTTP): `GET /packages/{id}/person-verifications` returns `PersonVerificationEntry[]`, every revision, oldest recorded first, scoped to the caller's organization; 404 `not-found` for an unknown package or another organization's package. `PersonVerification` (`spec/workbench.tsp`) carries `candidate_id` but no package or revision, so a new TypeSpec model `PersonVerificationEntry` is all the `PersonVerification` fields plus `package_revision: int32`, taken from the verification's `candidate_assignments` row (`CandidateAssignment.package_id` and `package_revision`).
- Produces (TS): `listPersonVerifications(db: Db, orgId: string, packageId: string): Promise<PersonVerificationEntry[]>`; the query joins `person_verifications` to `candidate_assignments` on `candidate_id`, filters on the assignment's `org_id` and `package_id`, and orders by recorded time.
- Produces (web): `api.personVerifications(id: string): Promise<PersonVerificationEntry[]>` in `apps/web/src/api/client.ts`.
- `PersonVerificationEntry` also carries `covers_current_subject: boolean`, computed on the server: true only when the entry's `package_revision` equals the package's current revision and recomputing the verification digest (`digest({ act: "person-verification", package_id, package_revision, subject_digest: subjectOf(pkg).digest, author_run: latestAuthorRun(pkg).id, criteria, outcome })`, as `admissible` in `services/api/src/person-verification.ts` does) over the package's current subject equals the entry's recorded `subject_digest`. The stored `subject_digest` is that composite, not the decision subject digest, so the board never compares it itself. Additive field, no spec major change.

- [ ] **Step 1: Write the failing tests** in the existing harness: one verification recorded through the existing flow is returned with its `package_revision` and `outcome`; `covers_current_subject` is true for a pass on the current revision and subject, and false after the author output or the pre-check changes on the same revision and for a pass on an earlier revision; two packages in one organization each get only their own verifications; one package with verifications on revisions 1 and 2 returns both with the right `package_revision`; a second organization's member gets 404; an unknown package gets 404; a package with none returns `[]`.
- [ ] **Step 2: Run** `pnpm -C services/api exec vitest run test/person-verification.test.ts`. Expected: the new tests FAIL with 404 route not found.
- [ ] **Step 3: Implement** the reader over the `person_verification` objects written by `recordObject` (filter by org and package; order by recorded time), the route, and the TypeSpec op `@route("/{id}/person-verifications") @get op personVerifications(@path id: string): PersonVerificationEntry[] | Refused;`. Add the `PersonVerificationEntry` model beside `PersonVerification`. Run `pnpm spec` at the repository root, then `pnpm -C apps/web gen:api`, and assert in a web type test that the generated `api.personVerifications` result type has `package_revision` and `covers_current_subject` (a `// @ts-expect-error` line on a field the model lacks keeps the test honest). Add the client method.
- [ ] **Step 4: Run** the API tests and `pnpm -C apps/web typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): read a package's person verifications`.

### Task 3: Column and next line

**Files:**
- Modify: `apps/web/src/lib/board.ts`
- Create: `apps/web/src/lib/next.ts`
- Test: `apps/web/src/lib/board.test.ts`, `apps/web/src/lib/next.test.ts`

**Interfaces:**
- Consumes: `kindsOf` (Task 1), `PersonVerificationEntry` (Task 2), existing `ActionDescriptor`, `OfficeItem`, `WorkPackage`, `AdminView`.
- Produces: `ColumnId` unchanged ids; `COLUMNS` titles become `Ready, Drafting, Agent check, Person verifies, Needs signature, Accepted`; `boardColumn(pkg: WorkPackage, preCheck: "none" | "passed" | "disputed", verified: boolean): ColumnId | null`; `needsIndependentCheck(pkg: WorkPackage): boolean` (grade `safety` or `material`); `type NextLine = { tone: "needs" | "wait" | "block" | "ok"; text: string; command?: string }`; `nextLine(i: NextInput): NextLine` with `NextInput = { pkg: WorkPackage; actions: ActionDescriptor[]; office: OfficeItem[]; verifications: PersonVerificationEntry[]; viewerIsOriginator: boolean; otherQualifiedVerifier: boolean; runActive: boolean }`; `hasOtherQualified(admin: AdminView, viewer: string, grade: string): boolean`; `acceptBlock(pkg: WorkPackage, verifications: PersonVerificationEntry[]): string | null` (for Safety or Material work with no `pass` entry whose `covers_current_subject` is true, the sentence "Independent check required: a person verification must pass for this revision before it can be accepted. This is a screen rule until the kernel enforces it."; otherwise `null`). `nextLine` never names Accept or Accept with findings while `acceptBlock` is set, and instead returns the verification requirement (tone `needs`, or `block` with "Needs a second qualified person" when nobody else is qualified).

- [ ] **Step 1: Write the failing tests**

```ts
it("puts Safety work with a passed pre-check and no verification in Person verifies", () => {
  expect(boardColumn(pkg({ status: "in-verification", grade: "safety" }), "passed", false)).toBe("person-verifies");
});
it("sends General service work with a passed pre-check straight to Needs signature", () => {
  expect(boardColumn(pkg({ status: "in-verification", grade: "general-service" }), "passed", false)).toBe("needs-signature");
});
it("keeps a disputed pre-check in Agent check", () => {
  expect(boardColumn(pkg({ status: "in-verification" }), "disputed", false)).toBe("agent-check");
});
it("names the first allowed decision as the next line", () => {
  expect(nextLine(input({ actions: [refused("accept"), allowed("release", "Release")] }))).toEqual({ tone: "needs", text: "Release", command: "release" });
});
it("says who is missing when the viewer originated Safety work and nobody else is qualified", () => {
  expect(nextLine(input({ grade: "safety", column: "person-verifies", viewerIsOriginator: true, otherQualifiedVerifier: false })))
    .toEqual({ tone: "block", text: "Needs a second qualified person" });
});
it("waits with the refusal reason when nothing is allowed", () => {
  expect(nextLine(input({ actions: [refused("accept", "The agent pre-check has not finished")] }))).toEqual({ tone: "wait", text: "The agent pre-check has not finished" });
});
it("reads accepted packages as ok", () => { expect(nextLine(input({ status: "accepted" })).tone).toBe("ok"); });
it("offers no Accept on Safety work without a passing verification for the current revision", () => {
  const n = nextLine(input({ grade: "safety", revision: 2, actions: [allowed("accept", "Accept")], verifications: [ver({ package_revision: 1, outcome: "pass", covers_current_subject: false })] }));
  expect(n.command).not.toBe("accept");
  expect(n.text).toMatch(/person verification/i);
});
it("acceptBlock lifts when a pass exists for the current revision, and ignores fail, inconclusive, other revisions and a pass on the current revision whose `covers_current_subject` is false", () => { /* safety and material blocked; pass on the current revision gives null; general-service always null */ });
```

- [ ] **Step 2: Run** `pnpm -C apps/web exec vitest run src/lib/board.test.ts src/lib/next.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `preCheck` comes from office items (`accept` means passed, `dispute` means disputed) as `preCheckDone` does today; `verified` is any verification with outcome `pass` and `covers_current_subject` true. Update `groupBoard` and its callers to the new signature.
- [ ] **Step 4: Run** the tests and the whole web suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): board columns with person verifies, and the card next line`.

### Task 4: Card and board page as home

**Files:**
- Create: `apps/web/src/features/board/Card.tsx`, `apps/web/src/features/board/BoardView.tsx`, `apps/web/src/features/board/useBoardData.ts`, `apps/web/src/features/board/board.css`, `apps/web/src/features/board/board.test.tsx`
- Modify: `apps/web/src/components/DecisionBar.tsx` (take an `acceptBlock` prop and render Accept and Accept with findings disabled with its sentence); `apps/web/src/pages/PackagePage.tsx` and `apps/web/src/features/case/CasePage.tsx` (its two callers load the verifications and pass the block); `apps/web/src/pages/Board.tsx` (render `BoardView`), `apps/web/src/router.tsx` (`/` renders the board; `/board` redirects to `/`; `/inbox` stays), `apps/web/src/components/Shell.tsx` (look switch writes `data-look` on `<html>` via `saveLook`)
- Test: `apps/web/e2e/board-looks.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3; existing `useLiveEvents`, `api.packages`, `api.office`, `api.packageActions`, `api.admin`.
- Produces: `<Card pkg kinds next column onOpen />` (renders `article` with kind icon and word, title button, owner and agent avatars, grade chip, "Independent check" tag when `needsIndependentCheck`, next line with its symbol); `<BoardView />`; `useBoardData(): { cards: BoardCard[]; status: "live" | "unknown"; unknownSince?: string; reconnect(): void }` with `BoardCard = { pkg: WorkPackage; kinds: Kind[]; column: ColumnId; next: NextLine }`.

- [ ] **Step 1: Write the failing tests** (MSW): the six column headings render in order; a Safety package shows "Independent check" and its next line; a General service package does not show the tag; the card title is a button that navigates to `/packages/:id`; with the stream errored the header shows "status unknown since" and a Reconnect button and no card shows a live symbol; an empty board shows "Add your first card" guidance; a Safety card without a passing verification for its current revision offers no Accept in its next line; the header shows the Needs you count (cards whose next line tone is `needs` or `block`, and clicking it turns on the Needs you lens once M2 lands) and "N agents running" counted from active runs, with no limit shown because the API does not report the daemon's parallel limit; tests for the package page and for the `/packages/$id/case` route, each reached by direct navigation, show Accept and Accept with findings disabled with the independent check sentence for Safety work whose pass no longer covers the current subject (`covers_current_subject` false), and enabled for General service work when the server allows it; Playwright `board-looks.spec.ts` runs axe (WCAG 2.2 A and AA) on `/` in looks a, b and c with zero violations.
- [ ] **Step 2: Run** `pnpm -C apps/web exec vitest run src/features/board` and `pnpm -C apps/web exec playwright test e2e/board-looks.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Fetch actions per visible package with `useQueries`; the card face matches the mockup's small core (spec 6.2). No drag. Remove the Board tab from `OfficePlace` only if it now duplicates `/`; keep Office and Floor.
- [ ] **Step 4: Run** both. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): the board is home`, then open the M1 pull request with the trace row and evidence (axe output).

## M2 Lenses

### Task 5: Lens state and the default-view guard

**Files:**
- Create: `apps/web/src/lib/lenses.ts`
- Test: `apps/web/src/lib/lenses.test.ts`

**Interfaces:**
- Consumes: `BoardCard` (Task 4).
- Produces: `type Lens = { kind: "all" | Kind; needs: boolean; mine: boolean; colorBy: "kind" | "state" | "agent" | "person" | "none"; groupBy: "none" | "kind" | "person" | "project"; density: "comfortable" | "compact" }`; `DEFAULT_LENS: Lens` (`all, false, false, "kind", "none", "comfortable"`); `parseLens(q: URLSearchParams): Lens` (unknown values fall back to defaults); `lensToQuery(l: Lens): string` (omits defaults); `applyLens(cards: BoardCard[], l: Lens, me: string): { shown: BoardCard[]; hiddenProtected: number }`; `isProtected(c: BoardCard): boolean` (column `person-verifies` or `needs-signature`); `revealHidden(l: Lens): Lens` (the lens with `kind` set to `"all"`, `needs` and `mine` set to false, and the presentation fields unchanged; a saved view is a `Lens`, so its filters are these same three); `edgeColor(c: BoardCard, l: Lens): string` (a CSS var or palette value, never a meaning token).

- [ ] **Step 1: Write the failing tests:** round trip `parseLens(new URLSearchParams(lensToQuery(l)))` equals `l` for three lenses; `?kind=banana` parses to `"all"`; filtering to code with one document waiting on a signature returns `hiddenProtected: 1`; `applyLens(cards, revealHidden(l), me).hiddenProtected` is 0 for a lens with kind, Needs you, Mine, or all three set; `needs` keeps `tone` `needs` and `block` cards only; `edgeColor` never returns `var(--needs)`, `var(--check)`, `var(--stuck)` or `var(--done)` for any lens (loop over every colorBy).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Person and agent palettes are fixed lists chosen away from the meaning hues; document the choice in a comment with the contrast file from Task 1.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): board lenses and the default-view guard`.

### Task 6: Lens bar, swimlanes and saved views

**Files:**
- Create: `apps/web/src/features/board/LensBar.tsx`, `apps/web/src/features/board/savedViews.ts`
- Modify: `apps/web/src/features/board/BoardView.tsx`, `apps/web/src/features/board/board.test.tsx`

**Interfaces:**
- Consumes: Task 5.
- Produces: `type SavedView = { name: string; lens: Lens }`; `loadViews(): SavedView[]`, `saveView(v: SavedView): void`, `deleteView(name: string): void` (browser storage, per signed-in member key `cr.views.<user>`, errors fall back to `[]`).

- [ ] **Step 1: Write the failing tests:** the kind toggle shows counts and filters; the URL updates on every change and a reload with that URL restores it; group by person renders one lane per owner with its count; the legend names the active color lens; with a filter hiding a protected card the board shows "1 waiting on a signature is hidden by this view" and its Show button clears every active filter that hides an affected card (kind, Needs you, Mine, and the filters of an applied saved view) and leaves the color, group and density lenses alone, with one test per filter and one with kind, Needs you and Mine active together; the notice is gone afterwards and the cards are visible; saving a view lists it and selecting it applies its lens; compact density hides avatars and chips but never the next line.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with real `button` and `select` elements and `aria-pressed`.
- [ ] **Step 4: Run** the suite and the axe spec. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): lens bar, swimlanes and saved views`; open the M2 pull request.

## M3 Move to and actions

### Task 7: Card actions and the Move to menu

**Files:**
- Create: `apps/web/src/features/board/MoveMenu.tsx`, `apps/web/src/features/board/actions.ts`
- Modify: `apps/web/src/features/board/Card.tsx`
- Test: `apps/web/src/features/board/move.test.tsx`

**Interfaces:**
- Consumes: `ActionDescriptor[]`, `api.decisionOptions`, `api.decide`, `api.stopRun`, existing passkey helpers in `lib/decide.ts`.
- Produces: `menuItems(actions: ActionDescriptor[], runActive: boolean, verifyStanding: "allowed" | { reason: string } | "not-applicable", acceptBlock: string | null): MenuItem[]` (Accept and Accept with findings are listed disabled with the `acceptBlock` sentence as their reason when it is set; the other decisions are unaffected) with `MenuItem = { id: string; label: string; enabled: boolean; reason?: string; change?: string }`; `<MoveMenu items onChoose />` (a `menu` with `menuitem` buttons, opened by the card's Move to button, Escape closes and returns focus).

- [ ] **Step 1: Write the failing tests:** items are decision labels, never column names; a refused item is listed disabled with its reason; choosing Accept on a package the server refuses (409 with `reason` and `change`) shows both sentences in the card's alert region and the card does not change column; a successful decision leaves the card in place until the next `/packages` refetch moves it; the menu is fully usable with keyboard only (open with Enter, arrows, Escape returns focus to Move to); Stop appears only while a run is active; for Safety work without a passing verification for the current revision, Accept and Accept with findings are listed disabled with the independent check sentence even when the actions endpoint allows them, and choosing one does nothing and sends no request (a screen rule; other API clients can still accept until D-4 is signed).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Decisions that need a reason (return, reject, accept with findings) open a small reason field before the passkey prompt, as the kernel requires a non-empty reason.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): card actions and Move to`; open the M3 pull request.

## M4 Quick add

### Task 8: Inline add and the capture card

**Files:**
- Create: `apps/web/src/features/board/QuickAdd.tsx`, `apps/web/src/features/board/CaptureCard.tsx`
- Modify: `apps/web/src/features/board/BoardView.tsx`, `apps/web/src/features/board/useBoardData.ts` (include captures)
- Test: `apps/web/src/features/board/quick-add.test.tsx`

**Interfaces:**
- Consumes: `api.capture`, `api.classifyCapture`, `api.captures` (`CaptureView` with `lane`, `intake {run_id,status,error}`, `package_ids`), existing `LanePicker`.
- Produces: `splitPaste(text: string): string[]` (trimmed non-empty lines); `<QuickAdd />` (opened by "+ Add a card" or the `c` key when focus is not in a field); `<CaptureCard capture />`.

- [ ] **Step 1: Write the failing tests:** typing a title and Enter posts one capture and leaves a fresh empty field focused; Escape closes; a draft survives blur; pasting three lines offers "Add 3 cards" and posts three; a new capture card reads "Classify the data lane" with the lane choices inline, and classifying posts `/classify`; with `intake.status` running it reads "Intake drafting"; with `intake.error` it shows the error; when `package_ids` lists two packages the capture card is replaced by both package cards; `c` typed inside an input does not open quick add.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Captures render at the top of Ready; refetch captures on the event stream as packages are.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): quick add from the board`; open the M4 pull request.

## M5 Card view: Activity

### Task 9: Activity tab

**Files:**
- Create: `apps/web/src/features/card/CardView.tsx`, `apps/web/src/features/card/Activity.tsx`, `apps/web/src/lib/usage.ts`, `apps/web/src/features/card/card.test.tsx`
- Modify: `apps/web/src/router.tsx` (`/packages/$id` renders `CardView`; the old `PackagePage` content moves under its Plan and Evidence tabs unchanged)

**Interfaces:**
- Consumes: `api.packageView`, `api.runEvents`, `api.stopRun`, the event stream, `menuItems` (Task 7).
- Produces: `sumUsage(events: NormalizedEvent[]): { input?: number; output?: number; cached?: number; reported: boolean; withheld?: string }`, which reuses the API's settlement semantics in `recordReportedUsage` (`services/api/src/budgets.ts`): when any usage event has `cumulative: true`, only the last cumulative event counts and the steps are not added to it; otherwise the steps are summed; a token field is shown only when every counted event carried it, and a total is withheld, labeled "usage incomplete: events were not kept", when any `dropped` event is present or the event feed is truncated at `MAX_RUN_EVENTS` (`services/api/src/work.ts`). The events must be read completely first: `GET /packages/:id/runs/:runId/events?after=<seq>` returns at most 2000 events per call (`runEvents` in `services/api/src/work.ts`), so the card fetches page after page, passing the last `seq` as `after`, until a page returns fewer than 2000, and reports no totals ("usage unavailable: events could not be loaded") if any page fails; `attestationLines(run: Run): { claim: string; result: "observed" | "refuted" | "not established" }[]`; tabs Activity, Plan and basis, Review, Evidence.

- [ ] **Step 1: Write the failing tests:** `sumUsage` sums step events when none is cumulative; with steps of 10 and 20 input tokens plus a cumulative event of 25, the total is 25, not 55; of two cumulative events only the last counts; when one counted event lacks `cached_tokens` the cached figure is omitted and labeled not reported while input and output still show; a run of 4500 events whose usage events sit on the second and third pages is totalled across all three requests, and the same run with the third request failing shows no totals; with a `dropped` event in the feed no totals are shown and the card reads "usage incomplete: events were not kept"; the card reads "cost not reported"; a run with no usage events reads "usage not reported"; each attestation claim shows its result word, and a run without an attestation shows "not established" for every claim; Stop shows "Stopping" from `stop_requested_at` until a terminal event arrives, then the recorded outcome, including "outcome unknown"; the note box says the run cannot be steered and keeps its text in the card's draft note (`sessionStorage`, key `cr.note.<package>.<revision>`), which Task 11 and 12 prefill into a Return reason; the header lists lawful actions as buttons; on the Plan and basis tab the grade field is read only on any revision after the first, with the note "Grade is fixed once work has started. This is a screen rule until the kernel enforces it." (O8).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and an axe pass on `/packages/:id` in three looks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): card view with an honest activity tab`; open the M5 pull request.

## Spikes before M6 and M7

Each spike is a throwaway branch with a short result note committed to `.nuclear/changes/board-redesign/evidence/spikes/<name>.md`: what was tried, what passed, the pick.

- **S1 Diff viewer:** `@pierre/diffs` versus `react-diff-view` on a real patch output: bundle size after lazy load, keyboard line selection, and whether a comment's anchor (file, side, line, line text) can be re-found in the next revision's patch.
- **S2 PDF comments:** `react-pdf` on `pdfjs-dist`: page rendering, page-keyed side comments, a scanned page with no text layer.
- **S3 DOCX conversion:** server-side LibreOffice and Pandoc conversion of a real SOW and a real calculation to PDF; fidelity of tables, equations and page breaks; whether the converter can run inside the existing sandbox policy. If neither is faithful, DOCX stays download-only in M7.

## M6 Code review

### Task 10: Read route for a previous revision's outputs

**Files:**
- Modify: `spec/api.tsp`, `services/api/src/work.ts` (`packageOutputAt`), `services/api/src/app.ts` (the new route and the existing `/packages/:id/outputs/*` route)
- Test: `services/api/test/app.test.ts` (new `describe`) or a new `services/api/test/outputs-by-revision.test.ts`

**Interfaces:**
- Produces (HTTP): `GET /packages/{id}/revisions/{revision}/outputs/*` (a wildcard path like the current route, so nested names such as `src/change.patch` work; in TypeSpec a `@path(#{allowReserved: true}) name: string` segment) with the same headers, lane and digest re-check as the current route; 404 when the revision or output does not exist; 409 `output-changed` on a digest mismatch.
- Ownership: both this route and the existing `/packages/:id/outputs/*` route check, before reading any bytes, that the package belongs to the caller's organization (`callerFor(db, user).orgId` against `object_owners` for `package`, the table `services/api/src/work.ts` already reads for run policy); another organization's package gets 404 `not-found`. Today the current route only calls `person(req)` in `services/api/src/app.ts` and `packageOutput` does no ownership check, so Task 10 closes that gap for the existing route too.
- Produces (TS): `packageOutputAt(db: Db, orgId: string, id: string, revision: number, name: string): Promise<Buffer>`; the current `packageOutput` gains `orgId` and calls it with the current revision.
- Produces (web): `api.outputAtUrl(id: string, revision: number, path: string): string`.

- [ ] **Step 1: Write the failing tests:** returned revision 1's output after a Return created revision 2; 404 for revision 9; 409 when the stored bytes no longer match; a nested output name (`src/change.patch`) is returned by both the previous-revision route and the current route; a member of a second organization gets 404 from both routes for the first organization's package and output names, and no bytes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, regenerate the spec and web types.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): read outputs of a previous revision`.

### Task 11: Code review tab

**Files:**
- Create: `apps/web/src/features/review/CodeReview.tsx`, `apps/web/src/features/review/comments.ts`, `apps/web/src/features/review/SignPanel.tsx`, `apps/web/src/features/review/code-review.test.tsx`
- Modify: `apps/web/src/features/card/CardView.tsx`

**Interfaces:**
- Consumes: Task 10, the S1 pick, `menuItems` and decision helpers (Task 7), draft note (Task 9).
- Produces: `type ReviewComment = { anchor: { file: string; digest?: string; page?: number; line?: number; text?: string }; body: string }` (`digest` is the sha256 hex of the output the comment was made on, set by the review tab from the retained output's recorded digest; required for every document comment (Markdown, PDF and DOCX), absent for code); `returnReason(note: string, comments: ReviewComment[], limit = 4000): string` (note first, then one line per comment; a code comment reads `file:line: body`; a document comment, which has a `page`, reads `<file> (sha256:<first 12 hex of anchor.digest>) p.<page>: body`, for example `sow.pdf (sha256:3fa9c1d20b7e) p.4: body`; a Markdown comment is a document comment too and reads `<file> (sha256:<first 12 hex of anchor.digest>) L<line>: body`; a code comment keeps `file:line: body` because the diff it was made on identifies the version, and the follow-up run's patch is a different diff). The API stores at most 4000 characters of a decision reason (`reason.slice(0, 4000)` in `services/api/src/work.ts`), so `returnReason` throws a `ReasonTooLong` error carrying the length and the limit rather than letting the server truncate silently; `<SignPanel decision pkg subjectDigest outputs />` that states what is bound in the API's words and the sentence "Signing records that you accepted this revision. It does not certify that it is correct."

- [ ] **Step 1: Write the failing tests:** `returnReason` of a note and a code comment is exactly `"<note>\nsrc/a.ts:12: rename this"`; for a PDF comment on page 4 it is exactly `"<note>\nsow.pdf (sha256:3fa9c1d20b7e) p.4: units missing"`; two comments on line 12 of two versions of the same Markdown file serialize as `notes.md (sha256:<12 hex>) L12: body` with their own digests; two comments on page 4 of two versions of `sow.pdf` (digests starting `3fa9c1d20b7e` and `9c04aa17d5e2`) serialize with their own digest prefixes; for a DOCX comment on page 2 it is exactly `"<note>\ncalc.docx (sha256:77be01aa93c4) p.2: wrong constant"`; a review whose serialized reason is over 4000 characters does not submit: the tab shows "This review is N characters; a return reason holds at most 4000. Shorten or remove comments." in an alert region, keeps every draft comment and the note, sends no request, and submits normally once back under the limit; a `*.patch` or `*.diff` output renders as a diff, and without one the tab lists the output files; selecting a line adds a draft comment; Return sends `returnReason` as the reason and the card then reads "Returned: release revision N+1 to start the follow-up run" with a Release button; "Since your last review" fetches the previous revision's patch through Task 10 and shows only what changed; a 409 `output-changed` shows its sentence; the agent pre-check renders under "Advice" and never as a check mark; Accept is disabled with the server's reason while any action refusal applies.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, lazy-loading the diff library.
- [ ] **Step 4: Run** the suite and axe on the tab in three looks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): code review with batched comments`; open the M6 pull request.

## M7 Document review

### Task 12: Document review tab

**Files:**
- Create: `apps/web/src/features/review/DocumentReview.tsx`, `apps/web/src/features/review/document-review.test.tsx`
- Modify: `apps/web/src/features/card/CardView.tsx`

**Interfaces:**
- Consumes: `ReviewComment`, `returnReason` (Task 11), the S2 and S3 results, existing `OutputPreview` and react-markdown.
- Produces: `<DocumentReview pkg outputs />`; Markdown comments anchored by source position (`line`), PDF comments by `page`, DOCX by `page` of the rendition when S3 succeeded, otherwise download only.

- [ ] **Step 1: Write the failing tests:** every document shows its file name, digest and a Download original button; Markdown renders and a comment records its source line and the file's digest; a PDF comment records its page; a DOCX without a rendition shows "Download to review; no in-app rendition" and still accepts page comments typed by number; a rendition is labeled "Rendition, not the original"; Return sends the batched reason exactly as for code (file name, digest prefix and page in each line, and the same over-limit error that keeps the drafts); a 409 `output-changed` shows its sentence.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): document review`.

### Task 13: Verify and accept panels

**Files:**
- Create: `apps/web/src/features/review/VerifyPanel.tsx`, `apps/web/src/features/review/verify.test.tsx`
- Modify: `apps/web/src/features/review/DocumentReview.tsx`, `apps/web/src/features/review/CodeReview.tsx`, `apps/web/src/api/client.ts` (person verification options and record, if not present)

**Interfaces:**
- Consumes: `/packages/:id/person-verifications/options` and `/person-verifications`, `hasOtherQualified` (Task 3), `SignPanel` (Task 11), `AdminView.hardware_formats_in_force` and the viewer's credentials.
- Produces: `<VerifyPanel pkg criteria />`.

- [ ] **Step 1: Write the failing tests:** for Safety or Material work the panel lists the criteria and states the bound subject, and a pass with `covers_current_subject` false (a changed output or pre-check on the same revision) is not treated as verified, and the panel says the verification must be redone; on every acceptance entry point (card header buttons, the Review tab Accept, and Accept with findings) Safety work without a passing verification for the current revision shows no enabled Accept and states the independent check requirement, with the note that the block is a screen rule and other API clients can still accept until D-4 is signed; options refused with `verifier-is-originator` shows "You originated this work, so you cannot verify it"; with no other qualified member it shows "Needs a second qualified person"; `qualification-missing` shows the server sentence; Verify and Accept are disabled while any action reports a failing required check, basis currency or deliverable integrity, with that reason; accept with findings appears only when the actions list allows it, requires a reason, and the result reads "Accepted with findings"; a grade needing a hardware key shows whether the viewer's key qualifies; for General service work the verify panel is not shown.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and axe in three looks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): verify and accept panels`; open the M7 pull request.

### Task 14: Owner validation

- [ ] **Step 1:** With M1 to M7 merged, run `pnpm cr start`; the owner and one engineer each take one real code task and one real engineering-document task from quick add to acceptance.
- [ ] **Step 2:** Record where each stalled, what they distrusted, and what they asked for in `.nuclear/changes/board-redesign/evidence/validation-1.md` (verification row E-04).
- [ ] **Step 3:** Turn each finding into an issue, sorted into M8 polish, a fix before M8, or a parked owner decision.

## M8 Visual pass

### Task 15: Refinement and critique

**Files:**
- Modify: `apps/web/src/design/tokens.css`, `apps/web/src/features/board/board.css`, review and card styles as the pass directs
- Create: `PRODUCT.md` and `DESIGN.md` at `apps/web/` (Impeccable's context files)

- [ ] **Step 1:** Install the design skills per `.nuclear/changes/board-redesign/evidence/04-design-skills-vetting.md`: Impeccable at project scope with hooks declined and telemetry off; Vercel web-design-guidelines from a pinned, reviewed local copy. Record versions in the change record.
- [ ] **Step 2:** Run Impeccable in refinement mode on the board, card view and both review tabs, tokens as the source of truth; apply its fixes.
- [ ] **Step 3:** Run the Vercel guidelines critique and Impeccable audit; fix what they find or record why not.
- [ ] **Step 4:** Run the whole web suite, the Playwright suite and axe in three looks. Expected: PASS, zero violations.
- [ ] **Step 5:** Screenshot every screen in three looks into `evidence/visual-pass/`; commit `style(web): visual refinement pass`; open the M8 pull request.
