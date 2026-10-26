# Interchangeable Overlay Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver fifteen distinct, interchangeable agent-activity worlds on the existing Floor, with truthful state, accessible controls and graceful fallback.

**Architecture:** A pure projection converts existing package/run/office snapshots into semantic entities. One bounded DOM/SVG renderer consumes those entities and a lazy-loaded declarative art pack. Viewer preferences, motion and release eligibility are independent of work authority; all domain mutations stay in existing package detail flows.

**Tech Stack:** Existing React 19.3.1, TypeScript 5.9.3, Vite 8.3.5, TanStack Query 5.104.5/Router 1.170.45, Vitest 5.0.5, Testing Library, MSW 3.0.3. Python 3 standard library for passive-SVG validation. Add pinned permissively licensed Playwright/axe development dependencies only in Task 13; no production dependency or model API.

**Spec:** [Engine design](../specs/2026-10-25-overlay-themes-design.md) and [catalog](../specs/2026-10-25-overlay-themes-catalog.md). Read both plus [change basis](../../../.nuclear/changes/overlay-themes/basis.md) before execution.

## Global Constraints

- Version-1 pack descriptors are static TypeScript objects checked with `satisfies ThemePackV1` and build validation, lazy-loaded from a fixed allowlist.
- No canvas/WebGL/game engine or new production dependency in the first release.
- V1 enhances `/floor`; the app header, Board, Office, evidence, decision controls and sign-in retain their current functional styling.
- No new wire fields, migrations or server mutations are needed.
- Page size **30**; sort matching packages by canonical ID ascending, then slice.
- Maximum **six** interactive entities per station, **36** total; complete list is not truncated.
- Container width below **960 CSS pixels** uses the list as the functional view.
- Actor controls have **44×44 CSS pixel** minimum hit areas.
- Poll visible Floor queries every **15 seconds**; snapshot stale after a required failure or **30 seconds** without success.
- OS reduced-motion forces Still; signature effects last at most **1.2 seconds** and never establish success.
- Selected pack artwork ≤ **1 MiB uncompressed**, thumbnail ≤ **100 KiB**, all fifteen thumbs ≤ **1.5 MiB**.
- `VITE_FLOOR_THEMES_ENABLED` defaults to `false`; Plain Floor is always available.
- Default preferences: Plain Floor, Full respecting OS, Scene respecting container width; key `cr.floor.preferences.v1`.
- Fifteen original working identities retain explicit creative lineage; public influence notes and actual assets require separate pack/version/hash-bound release review.
- Never hand-edit generated contracts or alter kernel/policy/red-team/CI trust surfaces in this feature. Do not import old change records' unrelated authorization.
- Performance numbers are targets requiring recorded measurements, not established results.

## Review Focus

- Mixed revisions and partial detail-query failures must never show stale acceptance or a false complete worker count (Tasks 2–3).
- Long labels, unknown roles/statuses, duplicate IDs and multiple rounds must stay legible without dropping active work (Tasks 2, 5).
- Quota-denied storage, unavailable saved packs and competing tabs must preserve task state and usable defaults (Task 4).
- Hidden/stale scenes and reconnects must not replay submissions or infer completion from time (Tasks 3, 6).
- Invalid SVG, failed lazy imports and artwork changes after release review must fail to Plain Floor without disabling navigation (Tasks 1, 7–8, 13).

## Execution entry and dependency order

Documentation delivery does not authorize product implementation. Once execution is requested, use an isolated checkout/worktree and refresh the source pin. Target the accepted executable workbench, presently observed on `buildout/controlled-preparation-20261023` at `465b084a04c6a99bb80c29aa890146eea5a55bd1`; do not implicitly merge that stack into main. Read AGENTS.md and this change record. Reconcile touched seams and rerun baseline web tests/typecheck/build before editing product code; record environment/dependency problems separately from regressions. Do not broaden into dormant preparation activation or protected surfaces.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13. Tasks 2–4 have separable modules, but use this sequential order for a straightforward native implementation. Artwork work can be commissioned against the catalog after Task 1; packaging/release follows validated interfaces. Each task ends with focused checks and a reviewable DCO commit under the actual contributor's identity. Do not manufacture another person's sign-off. No dates, staffing estimates or budget promises are inferred.

## File map

All paths below are proposed except those explicitly marked existing.

| Path | Responsibility |
|---|---|
| `apps/web/src/pages/Floor.tsx` (existing) | Feature-flag branch to legacy or themed route component |
| `apps/web/src/features/floor/LegacyFloor.tsx` | Existing implementation extracted without functional changes |
| `apps/web/src/features/floor/types.ts` | Read-only local display model; no wire contract |
| `apps/web/src/features/floor/paging.ts`, `project.ts`, `layout.ts` | Pure page selection, authoritative projection, bounded slot placement |
| `apps/web/src/features/floor/freshness.ts`, `useFloorData.ts` | Snapshot health and existing-query orchestration |
| `apps/web/src/features/floor/preferences.ts`, `useFloorPreferences.ts` | Validated local preferences and cross-tab/OS integration |
| `apps/web/src/features/floor/FloorScene.tsx`, `FloorActor.tsx`, `FloorList.tsx` | Shared visuals and equivalent functional list |
| `apps/web/src/features/floor/motion.ts`, `useFloorMotion.ts` | Transition memory and motion policy, not work state |
| `apps/web/src/features/floor/ThemeGallery.tsx`, `FloorToolbar.tsx`, `ThemeErrorBoundary.tsx`, `ThemedFloor.tsx` | Preview, load/commit lifecycle and route composition |
| `apps/web/src/features/floor/floor.css` | Container behavior, scoped tokens, shared motion, focus and reduced motion |
| `apps/web/src/features/floor/themes/types.ts`, `registry.ts`, `eligibility.ts`, `plain.ts`, `release-manifest.json` | Pack contract, fixed catalog loaders, eligibility and neutral fallback |
| `apps/web/src/features/floor/themes/packs/<id>.ts` | One passive descriptor per completed pack |
| `apps/web/public/floor-themes/<id>/` | Hashed scene/characters/props/thumb, `assets.json` and credits |
| `design/overlay-themes/<id>/` | Editable original art sources and contact sheets; exclude unlicensed reference media |
| `docs/overlay-themes/asset-workflow.md` | Export recipe, authoring limits and human release checklist |
| `tools/check_theme_assets.py`, `tools/test_check_theme_assets.py` | Asset/provenance/hash validation and hostile fixture tests |
| `apps/web/e2e/floor-themes.spec.ts`, `apps/web/playwright.config.ts` | Mocked-API real-browser behavior and screenshots |
| `.nuclear/changes/overlay-themes/evidence/` | Observed implementation checks, review decisions and performance/accessibility reports |

Do not change `api/client.ts`, `spec/`, services, daemon or kernel merely to implement this display feature. Existing `lib/floor.ts` and its tests remain until the legacy fallback is intentionally retired by a later change.

## Shared interfaces

Define these names in Task 1; later tasks consume them without inventing alternate shapes. `.js` import suffixes follow repository convention. Detailed behavior belongs to spec sections 4–7.

```typescript
type StationId = 'general'|'site'|'verify'|'office'|'bench'|'archive';
type ActionId = 'idle'|'work'|'carry'|'wait'|'attention'|'inspect'|'submitted'|'error';
type MotionMode = 'full'|'quiet'|'still';
type FloorFilter = 'active'|'all';
type FloorView = 'scene'|'list';
type FloorPage = {index: number; size: 30; filter: FloorFilter};
type SourceHealth = {key: string; updatedAt: number; pending: boolean; failed: boolean};
type FloorInput = {
  packages: readonly WorkPackage[];
  views: ReadonlyMap<string, PackageView>;
  office: readonly OfficeItem[];
  page: FloorPage;
};
type FloorEntity = {
  id: string; kind: 'run'|'request'|'package';
  packageId: string; revision: number; runId?: string; role?: string;
  sourceState: string; label: string; detail: string;
  station: StationId; action: ActionId; mark: StateKind;
  attentionRank: number; variant?: number;
};
type FloorModel = {
  entities: readonly FloorEntity[];
  selectedPackages: readonly WorkPackage[];
  matchingPackageCount: number;
  revisionConflicts: readonly string[];
  warnings: readonly string[];
};
type FloorHealth = {
  state: 'loading'|'healthy'|'partial'|'stale';
  oldestSuccessAt?: number; failedKeys: readonly string[];
};
type FloorData = {
  model: FloorModel; health: FloorHealth;
  loadedDetails: number; requiredDetails: number;
  refresh: () => Promise<void>;
};
type FloorPreferencesV1 = {
  schemaVersion: 1; themeId: string; motion: MotionMode; view: FloorView;
};
```

`WorkPackage`, `PackageView`, `OfficeItem` and `Run` come from generated aliases in `api/types.ts`; `StateKind` comes from the existing StateMark component. Use readonly props. `variant` is present only for run entities. Actions never enter the API. Known state labels and attention ranks are specified in the design, not derived from translated strings.

## Task 1: Pack contract, fixed registry and neutral fallback

**Files:** Create `features/floor/types.ts`, `themes/{types,registry,eligibility,plain}.ts`, `themes/release-manifest.json`, `themes/registry.test.ts` under `apps/web/src/`. Do not add fifteen placeholder product components.

**Interfaces:** Produces `ThemePackV1`, `ThemeRegistryEntry`, `ThemeReleaseRecord`, `THEME_CATALOG`, `getThemeEntry(id: string): ThemeRegistryEntry | undefined`, `isThemeEligible(entry, record): boolean`, and `PLAIN_THEME`. Registry entries expose `{id,title,description,moodTags,thumbnail?,load?,availability,influenceNoteId?}`; loader callbacks exist only in the trusted registry, never in descriptors. Asset and station fields follow design section 6. A development entry may omit loader/thumb; a released entry may not. Release records bind pack ID/version and ordered asset hashes, title and approved influence text.

- [ ] Write `registry.test.ts`: assert exactly the fifteen catalog IDs plus separately available Plain Floor, unique IDs, six ordered variants for a valid pack, rejection of incompatible schema, callbacks in descriptors, missing station/action profile, and missing/mismatched release metadata. Fixture: `expect(isThemeEligible(entry, undefined)).toBe(false)`.
- [ ] Run `pnpm --filter @control-rod/web test -- src/features/floor/themes/registry.test.ts`; observe missing-interface failure.
- [ ] Implement contracts, data-only development entries and allowlist selection. Use imported literal asset paths, not `import(userString)`. Plain Floor uses original neutral shapes, no asset loading or rights gate. Map accepted to `done`, failed/lost to `stuck`, requests to `needs`, stopping/waiting to `waiting`, all other terminal/unknown states to `idle`; do not edit StateMark globally.
- [ ] Repeat focused tests and `pnpm --filter @control-rod/web typecheck`; expect pass. These establish descriptor behavior, not finished art.
- [ ] Commit focused source/tests with the actual contributor's DCO sign-off; record result in the change packet.

## Task 2: Authoritative projection, paging and bounded layout

**Files:** Create `features/floor/{paging,project,layout}.ts`, `projection.test.ts`; use existing `lib/office.ts` for canonical office ordering where compatible. Read `spec/work.tsp` and current generated outcome type before implementation.

**Interfaces:** Consumes Task 1 display types. Produces `selectPackagePage(packages: readonly WorkPackage[], page: FloorPage): {items: readonly WorkPackage[]; total: number; index: number}`, `projectFloor(input: FloorInput): FloorModel`, `variantForRun(runId: string): number`, and `layoutEntities(entities: readonly FloorEntity[]): {placed: readonly {entity: FloorEntity; x: number; y: number}[]; overflow: Readonly<Record<StationId, readonly FloorEntity[]>>}`.

- [ ] Write `projection.test.ts` cases: `maps_all_run_and_office_states`, `does_not_accept_succeeded_checker`, `accepts_only_current_revision`, `joins_accept_with_findings_decision`, `preserves_all_active_rounds`, `keeps_latest_terminal_per_role`, `coalesces_duplicate_ids`, `conflicting_duplicate_is_unknown`, `unknown_role_status_is_visible`, `stable_cast_and_layout_under_reordering`, `thirty_first_package_is_on_next_page`, `capture_intake_is_not_fabricated`, `overflow_seventh_entity_is_retained`. Assert exact labels, identity prefixes, canonical stations and all list counts from design section 4. Example: `expect(projectFloor(inputWithSucceededChecker).entities.find(e => e.runId === 'R1')?.label).toBe('Pre-check run finished')`.
- [ ] Run `pnpm --filter @control-rod/web test -- src/features/floor/projection.test.ts`; observe failure before implementing helpers.
- [ ] Implement revision-safe source joins, deterministic UTF-8 FNV-1a32 variant selection and entity deduplication. Terminal-run tie-breaking and page-clamp follow spec. Fit three-by-two slots in each existing room; never extend a room because more entities exist. Office marker and worker identities remain separate. When a view's package revision differs from list revision, suppress its rows, append its ID to revisionConflicts and request refetch via Task 3.
- [ ] Repeat focused tests; typecheck. Verify fixture arrays are not mutated, all placed hit-box anchors are in bounds, overflow list contains every unplaced entity, and repeated variants retain unique run IDs/badges.
- [ ] Commit the independently tested projection.

## Task 3: Query coverage, freshness, revision recovery and polling

**Files:** Create `features/floor/{freshness.ts,useFloorData.ts,data.test.tsx}`; extend existing `lib/live.test.tsx` only if needed to prove current views invalidation. Reuse existing query keys and `api` methods.

**Interfaces:** Consumes `projectFloor`/page selector. Produces `assessFloorHealth(sources: readonly SourceHealth[], now: number): FloorHealth` and `useFloorData(page: FloorPage, visible: boolean): FloorData`. Hook feeds currently loaded selected-page views into projection and maps query states into SourceHealth. `refresh()` refetches packages/office/selected views, not all application queries.

- [ ] Write `data.test.tsx` with MSW and a fresh query client: initial Loading vs true empty; 31 packages makes at most 30 detail requests; one failed detail gives partial count and failed ID; no package-list error becomes “Nobody working”; old view/new list revision shows Updating; stale cached input freezes after 30 seconds; 15-second polling occurs only while visible; tab return refetches; page shrink clamps safely. Assert a failed detail cannot display its stale accepted seal. Use fake timers and deterministic success timestamps.
- [ ] Run `pnpm --filter @control-rod/web test -- src/features/floor/data.test.tsx`; observe missing-hook failure.
- [ ] Implement hook and health assessment, no `/runs` dependency or second SSE stream. Any failed required source with retained data is stale; partial means initial source detail gaps without known old data. Debounce mismatch refetch to avoid a render loop; one automatic retry per observed `(package ID, list revision, view revision)` mismatch, then explicit Retry plus normal visible polling. Do not invalidate on theme changes. Use no background interval and refetch on visibility return.
- [ ] Repeat focused tests and relevant existing live tests. Confirm request inventory consists only of existing read endpoints and no preview queries.
- [ ] Commit data integration and evidence of exact query limits.

## Task 4: Preferences and motion/view effective settings

**Files:** Create `features/floor/{preferences.ts,useFloorPreferences.ts,preferences.test.tsx}`. Keep generic `lib/storage.ts` unchanged unless a genuinely shared helper is needed.

**Interfaces:** Produces `parseFloorPreferences(raw: string | null): FloorPreferencesV1`, `readFloorPreferences(): FloorPreferencesV1`, `writeFloorPreferences(value: FloorPreferencesV1): void`, and `useFloorPreferences(): {preferences: FloorPreferencesV1; update: (patch: Partial<Omit<FloorPreferencesV1,'schemaVersion'>>) => void}`. Theme activation eligibility is resolved by gallery/registry, not by erasing the stored ID.

- [ ] Write `preferences.test.tsx`: corrupt JSON, wrong schema, wrong enum/type, missing storage, throwing getItem/setItem, full quota, valid/invalid storage events, absent saved theme restored when available, and no stored work/user data. Example: `expect(parseFloorPreferences('{bad').themeId).toBe('plain')`. A valid unavailable ID remains remembered while `getThemeEntry` fallback is plain.
- [ ] Run the focused test command; observe missing implementation failure.
- [ ] Implement exact key/defaults and graceful storage failure. Valid cross-tab events update the in-memory state with no write-back loop. Store only four fields; reject unknown-version records. No settings API or account identity claim.
- [ ] Repeat focused tests and typecheck; ensure no full document reload.
- [ ] Commit preference behavior.

## Task 5: Shared scene, list, overflow, responsive layout and keyboard operation

**Files:** Create `features/floor/{FloorScene.tsx,FloorActor.tsx,FloorList.tsx,floor.css,render.test.tsx}`. Import StateMark; no pack-specific React components.

**Interfaces:** `FloorScene({model,pack,selectedId,onSelect,onOpen,onShowStation,motionEnabled})`, `FloorList({model,stationFilter,selectedId,onSelect,onOpen})`, `FloorActor({entity,art,selected,onSelect,onOpen})`. `onOpen(entity)` is handled by route composition; scene never receives API or router credentials. `stationFilter` is StationId or undefined. Selection ID may be undefined.

- [ ] Write `render.test.tsx`: keyboard actor activation, same tooltip on hover/focus, Escape dismissal, 7th entity +1 opens full station list, long labels and escaped HTML, disappearance focus recovery, six variants repeated with unique accessible badges, no duplicate interactive view, accepted summary vs worker distinction. Assert `expect(screen.getByRole('button', {name: /R1.*Pre-check run finished/})).toBeDefined()` using the standardized accessible-label ordering implemented here.
- [ ] Run focused rendering tests; observe missing renderer failure.
- [ ] Implement neutral scene and pack image composition. Use one canonical accessible label format: `[package ID] rev [revision], [role or request kind], [run ID if present]: [label]. [detail]`. Scope tokens/CSS, safe image URLs and shadow/lighting layers. Use container queries for list fallback below 960 pixels; actual hit targets 44 pixels minimum. Apply +N to the real overflow set; render all entities in selected list. Delegate package opening; don't add action buttons.
- [ ] Repeat focused tests and typecheck; verify DOM query assertions. Record real-browser geometry, contrast and zoom checks as still pending Task 13 (jsdom cannot establish them).
- [ ] Commit common renderer and list.

## Task 6: Shared motion policy and truthful one-shot transitions

**Files:** Create `features/floor/{motion.ts,useFloorMotion.ts,motion.test.tsx}`; extend only scoped `floor.css`.

**Interfaces:** Produces `effectiveMotion(requested: MotionMode, reducedMotion: boolean, visible: boolean, health: FloorHealth['state']): MotionMode`, `submissionTransitions(previous: ReadonlyMap<string,string>, next: readonly FloorEntity[], baselineReady: boolean): readonly string[]`, and `useFloorMotion({entities,requested,health,sceneVisible}): {mode: MotionMode; submittingIds: ReadonlySet<string>}`. `visible` combines document and intersection/container visibility; never alters model labels.

- [ ] Write `motion.test.tsx`: OS Still override, Quiet no locomotion, hidden/stale freeze, first load no effects, unchanged snapshot no effect, running→succeeded produces one effect, stopped/lost no effect, theme switch/paging/reconnect/gap rebaseline no effect, cleanup cancels timers/listeners. At 1200 ms submittingIds is empty; no API mock handler is called.
- [ ] Run focused test; observe failure.
- [ ] Implement media-query/visibility listeners with cleanup and bounded transition memory. Rebaseline on gaps, paging, reload and theme activation. Shared CSS implements eight treatments/seven signature primitives with transform/opacity; pack data only selects one. Animate no React state per frame and never infer status from timers. Quiet may emphasize real changes by opacity; Still updates immediately.
- [ ] Repeat focused tests; inspect CSS for disabled motion paths including the existing legacy pulse class leaking into the themed view.
- [ ] Commit common motion policy.

## Task 7: Gallery, atomic activation, error boundary and route integration

**Files:** Create `features/floor/{ThemeGallery.tsx,FloorToolbar.tsx,ThemeErrorBoundary.tsx,ThemedFloor.tsx,LegacyFloor.tsx,gallery.test.tsx,integration.test.tsx}`; modify existing `pages/Floor.tsx`; import scoped CSS from ThemedFloor.

**Interfaces:** `ThemeGallery({entries,activeId,onPreview,onActivate,onClose})`; `loadEligibleTheme(id: string): Promise<ThemePackV1>` in registry; `ThemedFloor()` composes Tasks 1–6. `Floor()` branches on `import.meta.env.VITE_FLOOR_THEMES_ENABLED === 'true'` to ThemedFloor or LegacyFloor; test through a pure `isThemeFeatureEnabled(raw: unknown): boolean` exported from registry. Gallery owns no query client; activation state stays above theme error boundary.

- [ ] Write gallery/integration tests: focus trap/return, Escape, static preview label, disabled development packs, successful activation persistence only after load, failed import retains current pack, rapid A→B load race cannot let slow A replace B, missing image falls back, unknown saved ID uses plain, flag false renders legacy Floor, no task mutation or query reset on switch. Assert selection survives a pack change and no POST/PUT/PATCH/DELETE is observed.
- [ ] Run both focused files; observe failure before integration.
- [ ] Extract legacy Floor verbatim except import paths; implement new component hierarchy and guarded load generation token. Route opening uses `/packages/$id`; request markers add `hash: 'decide'`. Availability and asset errors have ordinary Retry/Use Plain Floor controls. Theme error resets on ID/version; keep queries/list fallback above boundary. Apply preferences after successful activation, and preserve newest user choice over a stale cross-tab load. If an active pack becomes unavailable on reload, use plain while retaining saved ID.
- [ ] Run new tests, existing component/lib/live tests and web typecheck/build. Confirm only selected pack is loaded and no mounted preview/live view doubles requests. Test Plain Floor via gallery and feature-disabled legacy route separately.
- [ ] Commit the working engine pilot behind disabled feature flag; no unfinished art is called complete.

## Task 8: Asset pipeline, provenance, eligibility gate and authoring recipe

**Files:** Create `tools/{check_theme_assets.py,test_check_theme_assets.py}`, `docs/overlay-themes/asset-workflow.md`, initial `public/floor-themes/` manifests; modify `apps/web/package.json` scripts to add `check:themes` and invoke it before the existing build chain. Add `themes/assets.test.ts` for descriptor/manifest agreement. Do not modify CI workflows.

**Interfaces:** CLI `python3 tools/check_theme_assets.py --root .` returns nonzero with pack/asset/reason on failure. JSON `assets.json` per pack contains `packId`, `version`, `schemaVersion:1`, and ordered `{key,path,sha256,bytes,width,height,creator,rightsBasis,licenseNoticeId}` records. `rightsBasis` is original/licensed/public-domain. Release manifest additionally binds display title/influence text and asset list; development packs may omit release records, never claim release eligibility.

- [ ] Write Python temporary-file fixtures: valid static SVG; script/onload/foreignObject/style/external href/remote font/data URI/DOCTYPE/entity rejected; `url(#local)` allowed but external paint URLs rejected; traversal/symlink escape/missing file rejected; bad hash, dimensions, bytes, duplicate variant, budget excess, stale release hash and invalid release-state record rejected. Add TS descriptor-to-manifest/release agreement tests; development registry entries without art must validate as unavailable.
- [ ] Run `python3 -m unittest discover -s tools -p 'test_check_theme_assets.py'` and focused web assets tests; observe failure.
- [ ] Implement XML parsing with Python stdlib ElementTree and strict static element/attribute allowlist; reject DTD/entity declarations before parsing and cap file byte reads before parse. Resolve paths within each pack, reject symlinks, verify SHA-256/dimensions/byte sums/naming and credits. Permit only local fragment references. Keep human legal judgment outside automated claims. Add `check:themes` as `python3 ../../tools/check_theme_assets.py --root ../..`; build becomes `pnpm check:themes && pnpm gen:api && tsc -p tsconfig.json --noEmit && vite build`.
- [ ] Run Python tests, TS tests and checker on development catalog; expect pass with an accurate development/released inventory. Document art export, content-hashed filenames (`<key>.<first12sha256>.svg`), notices, editable source and review steps; no copied references enter the bundle.
- [ ] Commit pipeline/docs and record gate limitations (not arbitrary-upload sanitization, legal clearance or proof of visual quality).

## Task 9: Complete first three packs and pilot the common engine

**Files:** Create `themes/packs/{creature-dispatch,pocket-lab,midnight-bureau}.ts`, corresponding `apps/web/public/floor-themes/<id>/` and `design/overlay-themes/<id>/`; extend `themes/pack-conformance.test.ts`; update registry/release manifest only with actual records. Retain evidence under change packet.

**Interfaces:** Produces three complete ThemePackV1 packs using existing shared-v1 and immutable asset hashes. Six cast assets and stations follow catalog; no per-theme JSX, callbacks or duplicated state mapping.

- [ ] Add conformance fixtures/tests for these three IDs: all canonical station keys, six variants, all eight action treatments through shared engine, signature capsule/spark/dossier, original titles and no public influence note without a release entry. Run focused tests before assets exist and retain meaningful missing-art failures.
- [ ] Produce silhouettes/compositions first, review over actual labels/hit boxes, then final original SVG assets and static thumbnails. Record source/influence/provenance; exact franchise assets are not default placeholders. Create real character materials/lighting rather than six recolors. Validate art at actual scene scale.
- [ ] Run checker, pack-conformance tests and web build; expect pass. Human review compares the three worlds side-by-side for distinct personality and shared behavior. Record each asset review and any approved public influence note with its actual wording.
- [ ] Exercise the first three packs through gallery, all states, stale/overflow/Still modes and fallback. Only after actual art, accessibility, rights and performance evidence is complete may a record move the corresponding pack to released; otherwise it remains development, with the specific remaining gap recorded.
- [ ] Commit three-pack pilot; stop adding new motion primitives merely to match a reference. Resolve common engine problems before expanding the art catalog.

## Task 10: Complete the four fantasy/domestic/storybook packs

**Files:** Add descriptors/assets/editable source for `confectionery-works`, `lanternwood-guild`, `corner-cafe`, `tumbletown-workshop`; extend `pack-conformance.test.ts`, registry and real release records.

**Interfaces:** Consumes validated ThemePackV1/shared renderer; produces four independently eligible packs with signature parcel/lantern/dossier/capsule. Catalog station/cast order remains stable.

- [ ] Extend parameterized conformance tests with exactly these four IDs; require complete assets and all common states; run before art is present and observe failures.
- [ ] Produce art against catalog briefs: copper confectionery, woodland craft, original café ensemble, illustrated impossible machinery. Preserve explicit internal influence notes; develop distinct characters, geometry and costume combinations. Create static previews/contact sheets with real UI overlays.
- [ ] Run asset checker, focused conformance tests and build. Review all four on a shared fixture at scene scale, grayscale, Still and 200% zoom; preserve separate provenance and attribution outcomes per pack.
- [ ] Record actual review/performance eligibility or precise remaining gaps, then enable only individually eligible entries. Verify an unavailable Seuss-influenced pack cannot suppress a cleared café pack or vice versa.
- [ ] Commit the four-pack addition with evidence references.

## Task 11: Complete space, creature research and construction packs

**Files:** Add descriptors/assets/editable source for `orbital-shipyard`, `wildlight-camp`, `voxel-foundry`; extend shared conformance fixtures/registry/release records.

**Interfaces:** Produces three packs with signature spark/lantern/parcel and identical semantic model. Model capability, rights or task progress must not be inferred from creature species or building growth.

- [ ] Extend conformance tests for these three IDs and expected station/signature completeness; run for observed missing-art failure.
- [ ] Produce original robot/alien, research-creature and beveled geometric art; retain reference lineage without copied droid/creature/block designs. Test reading labels against luminous/complex backgrounds before final detail.
- [ ] Run checker/conformance/build, then review complete semantic fixture, repeated cast variants and dense overflow for all three. No optional script/shader/external texture is admitted for visual polish.
- [ ] Record actual asset/distribution/influence review and measured eligibility; activate each pack only when its own gates are complete.
- [ ] Commit this catalog expansion.

## Task 12: Complete the five calm/craft/nature packs

**Files:** Add descriptors/assets/editable source for `cloudspring-bathhouse`, `button-and-spool`, `clockwork-observatory`, `coral-commons`, `meadow-post`; extend conformance fixtures/registry/release records.

**Interfaces:** Produces final five packs with signatures ripple/parcel/spark/ripple/parcel; all consume shared-v1 and viewer motion preference. A pack cannot silently force Full or overwrite the user's setting.

- [ ] Extend conformance tests for these five IDs and `expect(completedCatalogIds).toHaveLength(15)` once all fifteen have complete art; run before production and observe failures. Complete-art count is distinct from release-eligible count.
- [ ] Produce original ceramic attendants, miniature craftspeople, clockwork observers, reef crew and village animals. Check the two calmest packs remain expressive when all animation is off and low-contrast decorative palettes never weaken functional text.
- [ ] Run checker/conformance/build. Review calmness, legible silhouettes, shared task state, overflow and accessible focus on the same fixture used for the louder worlds.
- [ ] Record individual provenance/distribution/attribution outcomes and performance evidence. Gate each pack independently; all fifteen being drawn does not certify their public release.
- [ ] Commit final art wave and catalog/contact-sheet inventory.

## Task 13: Browser evidence, release inventory, documentation and rollback

**Files:** Create `apps/web/{playwright.config.ts,e2e/floor-themes.spec.ts,e2e/floor-fixtures.ts}`, `docs/overlay-themes/user-guide.md`; modify `apps/web/package.json`/lockfile for pinned Playwright and axe development dependencies/scripts; update this change packet's trace/verification/ship and `docs/README.md`. No CI workflow change.

**Interfaces:** Playwright fixture intercepts existing read endpoints (`/auth/session`, `/packages`, `/office`, `/packages/:id`, `/events/stream`) with deterministic source records. It rejects unexpected mutations and external requests. Build/preview runs with feature flag enabled via config webServer environment, no real API/passkey/credentials. `test:themes:browser` runs the fixed fixture suite. Feature-disabled build is a separate explicit rollback check.

- [ ] Add initially failing browser assertions: all fifteen catalog entries and plain fallback; released vs development selection; keyboard dialog/tooltip/navigation; real bounds and 44-pixel targets; 320/768/1280 viewports and 200% zoom; OS-reduced motion; tab-hidden pause; stale/reconnect no replay; failed image/import; rapid switching; 30-package pagination/overflow; no mutations/external requests. Axe checks supplement, not replace, keyboard/screen-reader checks. Pin dependency versions in the lockfile and record current browser versions at execution.
- [ ] Run browser suite before final fixes and retain failures; fix shared engine/art causes through their owning tasks, with narrow regressions. Screenshots use fixed clock/source fixtures with Still mode, plus a separate Full-mode animation exercise; no unstable random camera/actor placement.
- [ ] Run `python3 -m unittest discover -s tools -p 'test_check_theme_assets.py'`, `python3 tools/check_theme_assets.py --root .`, `pnpm --filter @control-rod/web test`, `pnpm --filter @control-rod/web typecheck`, `pnpm --filter @control-rod/web build`, and `pnpm --filter @control-rod/web run test:themes:browser`. Expect zero failing checks; retain outputs and build/source hashes.
- [ ] Capture manual Firefox/Safari/mobile and screen-reader checks, contrast, all-pack contact sheets and performance measurements under design section 6. Record actual machine/browser/build/cache/network conditions; p95 ≤33 ms/30-second fixture, cached switch ≤250 ms, throttled cold activation ≤2 seconds are release targets, not assumed benchmarks. Record unmeasured platforms/targets explicitly and keep the associated gate open.
- [ ] Rebuild with flag false, confirm legacy route still opens package details and work records are untouched. Disable one released pack in allowlist and confirm saved ID falls back. Restore reviewed configuration. Use request interception/fixtures to show no package mutation; optionally compare pre/post fixture work JSON hashes. No real acceptance is exercised just to test cosmetics.
- [ ] Produce release inventory: fifteen complete art packs, individually eligible count, blocked-pack reasons and owner decisions; publish only approved factual influence notes and distributions. Update user guide (switch, preview, motion, list, coverage, fallback), asset notices and exact rollback procedure. Final independent review of code/art/semantics is required before release; use normal repository workflow, not this planning review as substitute. Commit docs/evidence; publishing/merging/deploying still follows the user's then-current authorization.

## Requirement coverage

| Requirement | Tasks | Decisive planned verification |
|---|---|---|
| OT-01 | 1, 9–12, 13 | Registry/conformance inventory + actual fifteen-pack art review |
| OT-02 | 1, 5–6, 8–12 | Descriptor validation + same renderer across all packs |
| OT-03 | 2, 5, 13 | Source-state matrix including checker success vs acceptance |
| OT-04 | 2, 7, 13 | Reordered sources/reload/theme-switch identity and selection |
| OT-05 | 2–3, 13 | Paging/partial-query/revision/capture/duplicate fixtures |
| OT-06 | 5, 7, 13 | Keyboard/dialog/list + actual contrast/zoom/screen reader |
| OT-07 | 6, 13 | Media/visibility/stale/transition timer tests + Full/Still browser |
| OT-08 | 1, 5, 7–8, 13 | Schema/import/image/error-boundary fallbacks |
| OT-09 | 4, 7, 13 | Storage corruption/quota/cross-tab/unavailable preference cases |
| OT-10 | 3, 6, 13 | Failure/freshness/reconnect rebaseline evidence |
| OT-11 | 2, 5, 13 | In-bounds slots + overflow equivalence + real container tests |
| OT-12 | 5, 7–8, 13 | No API props or mutation/external requests; escaped text/passive art |
| OT-13 | 8–13 | Hash/byte/SVG validation + measured machine/browser targets |
| OT-14 | 1, 8–13 | Release-record asset/title/note binding + actual human decision |
| OT-15 | 7, 9–13 | Feature-off build, pack-off fallback and unchanged work records |

## Planning completion and handoff

This plan deliberately leaves every implementation checkbox unchecked. Source inspection, document validation and builder review are planning evidence only. The next engineering milestone is the shared engine plus first two complete packs, followed by Midnight Bureau; completing all fifteen also requires the art pipeline and individual release evidence. Review the proposed defaults and exact artwork/attribution posture before execution. A native sequential implementation is a reasonable default because the tasks share projection, pack and renderer contracts; no execution method has been selected by the user.

## Execution record, 2026-10-26

The user approved execution. Native implementation, source commits, observed failed-first regressions, final review disposition, retained evidence and remaining manual/public-release gates are recorded in [the execution ledger](../../../.nuclear/changes/overlay-themes/execution.md). The checkboxes above preserve the original runbook, not current progress; consult the ledger for executed task status.
