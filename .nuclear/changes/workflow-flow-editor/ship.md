# Ship: Interactive workflow block flow editor & swim-lane packs

**Change slug:** `workflow-flow-editor`
**Branch:** `feat/workflow-flow-editor`
**Status:** Ready for draft PR review.

## Summary

- Unified `@xyflow/react` drag-and-drop swim-lane workflow editor extending PR #173 (`Control / Setup > Workflow`), supporting card (`?package=<id>`) and project scopes.
- Declarative versioned workflow spec (`WorkflowSpecV1`, `schema_version: "1.0.0"`) persisted via migration `028-workflow-specs.ts` and executed directly by the dispatcher (`services/api/src/work.ts`).
- Full keyboard accessibility, responsive vertical layout for 390px phone screens, ADR 0024 blind-checker & no-fallback enforcement, swim-lane fork/diff/3-way-merge/rollback, Nuclear pack guarantees, and `run.workflow` skill-version logging.
