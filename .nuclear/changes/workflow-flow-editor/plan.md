# Plan: Interactive workflow block flow editor & swim-lane packs

1. **Declarative Spec & Engine (Backend + Frontend shared contract)**
   - `services/api/src/workflow-spec.ts`: `WorkflowSpecV1` schema, preset builder (from `packs/workflows` + `packs/nuclear-grade`), validator (author != checker, no checker fallback, Nuclear guarantees), 3-way lane update merge & conflict detector, diff generator, version snapshot & rollback, custom pack creation & JSON export/import, safe repo URL skill importer.
   - `services/api/src/db/migrations/028-workflow-specs.ts`: persistent tables `workflow_specs`, `workflow_custom_packs`, and `workflow_lane_versions` (additive + reversible down SQL).
   - `services/api/src/workflow-routes.ts` mounted in `services/api/src/app.ts`: REST endpoints for catalog, project/card spec CRUD, lane import, update check/apply, conflict resolution, rollback, custom pack CRUD/export/import.
   - `services/api/src/work.ts`: wire dispatcher (`resolveRunWorkflow`, `workflowContext`, `workflowEvent`, `claim`) to execute saved `WorkflowSpecV1` stages/skills/agent preferences, block on unloadable Nuclear packs, flag modified Nuclear lanes, and log `skill_versions` on every card run.

2. **Frontend Unified Swim-Lane Flow Editor (extending PR #173)**
   - `apps/web/src/lib/workflowSpec.ts`: frontend types, round-trip serializer/parser, pure state transitions (stage add/remove/reorder, skill drag/move/remove, agent assign/unassign, lane fork/diff/merge/rollback, custom pack create/import/export, composable Workflow × Context depth × Check-in resolver, rule validator).
   - `apps/web/src/components/WorkflowEditorCanvas.tsx`: interactive React Flow (`@xyflow/react`) stage flow canvas (left-to-right on desktop, top-to-bottom on phone) with stage columns (`Brainstorm`, `Plan`, `Author`, `Check`, `Review`, `Ship`), draggable skill blocks, drag-target agent assignment, visual rule badges, `"Coming soon"` markers, and full keyboard controls.
   - `apps/web/src/components/WorkflowSwimLanes.tsx`: unified swim-lane panel for upstream packs (Superpowers, Pocock, Nuclear-Grade), imported URL repos, and custom packs — Fork, `"Modified from upstream"` badge + Diff view, Auto-update / Freeze toggle, Check updates + Conflict resolver, Rollback history, New pack / Import URL / Export JSON.
   - `apps/web/src/components/AgentTray.tsx`: Available agents tray (Claude, Codex, Antigravity, opencode, Grok, user models) with real `<AgentMark>` logos, draggable chips, runnable vs `"Coming soon"` status, and custom user model entry.
   - Extend `apps/web/src/components/WorkflowDiagram.tsx`, `apps/web/src/pages/Workflow.tsx`, `apps/web/src/features/board/WorkflowSwitch.tsx`, and `apps/web/src/components/workflow.css` (ISA-101 nuclear control room styling, 1440px + 390px responsive).

3. **Verification & Review**
   - Backend unit + DB integration tests (`services/api/test/workflow-spec.test.ts`).
   - Frontend unit + round-trip + component interaction + keyboard accessibility tests (`apps/web/src/lib/workflowSpec.test.ts`, `apps/web/src/components/workflow-editor.test.tsx`).
   - Full `typecheck`, `test`, `build`, `check:workflow-packs`.
   - Independent blind review subagent check + draft PR.
