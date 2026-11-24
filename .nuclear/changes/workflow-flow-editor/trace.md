# Trace: Interactive workflow block flow editor & swim-lane packs

**Change slug:** `workflow-flow-editor`

## Files changed

| Area | File | Purpose |
|---|---|---|
| Backend spec engine | `services/api/src/workflow-spec.ts` | Declarative `WorkflowSpecV1` schema (`1.0.0`), catalog loader, preset builder, lossless serialize/parse, rule & Nuclear validation, 3-way merge & conflict pause, reversible rollback, safe HTTPS repo URL importer, custom pack export/import. |
| DB migration | `services/api/src/db/migrations/028-workflow-specs.ts` | Creates `workflow_specs` and `workflow_custom_packs` tables with reversible down SQL; registered in `services/api/src/db/migrate.ts` and `services/api/test/migration-preservation.ts`. |
| Commands & API routes | `services/api/src/commands/catalog.ts`, `services/api/src/workflow-routes.ts`, `services/api/src/app.ts` | Registers `workflow.spec-save` / `workflow.pack-save` and mounts `/workflows/*` routes with org ownership and server-side council validation. |
| Dispatcher | `services/api/src/work.ts` | Executes saved `WorkflowSpecV1` (`package` → `project` → `default`), honors per-stage agent overrides for `intake`/`author`/`pre-check`, enforces blind-checker independence & no-fallback, promotes Nuclear context depth when set, runs on-start auto-update checks (pausing on conflict), blocks on failed Nuclear packs, flags modified Nuclear lanes, and logs `skill_versions` on `run.workflow`. |
| Frontend state & API | `apps/web/src/lib/workflowSpec.ts`, `apps/web/src/lib/workflowApi.ts` | Pure client-side spec engine, round-trip serializer/parser, composable toggles, fork/diff/3-way merge/reversible rollback, custom pack JSON export/import, and typed `/workflows/*` API client with card log support. |
| Frontend components | `apps/web/src/components/WorkflowEditor.tsx`, `WorkflowEditorCanvas.tsx`, `WorkflowSwimLanes.tsx`, `AgentTray.tsx`, `workflow.css`, `pages/Workflow.tsx`, `features/board/WorkflowSwitch.tsx` | Unified `@xyflow/react` swim-lane flow editor extending PR #173 (`Brainstorm → Plan → Author → Check → Review → Ship`), Available agents tray with real marks, swim lanes for all packs/modes, keyboard controls, 390px vertical layout, and card/project scope integration. |
| Tests | `services/api/test/workflow-spec.test.ts`, `apps/web/src/lib/workflowSpec.test.ts`, `apps/web/src/components/workflow-editor.test.tsx` | Round-trip, rule enforcement, 3-way merge, conflict pause, reversible rollback, SSRF/traversal hardening, Nuclear flags/blocking, keyboard interaction, and UI tests. |
