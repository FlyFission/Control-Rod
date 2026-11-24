# Risk: Interactive workflow block flow editor & swim-lane packs

**Change slug:** `workflow-flow-editor`
**Grade:** Standard (no trust surfaces touched; dispatcher execution paths are modified with strict invariant preservation).

## Hazards & mitigations

| Hazard | Impact | Mitigation |
|---|---|---|
| Blind checker assigned same agent as author | Violates ADR 0023 / ADR 0024 independence | Enforced in pure validator (`validateWorkflowSpec`), visually blocked in UI, rejected by `PUT /workflows/...` API (400), and still guarded by `pickChecker` in `work.ts`. |
| Checker falls back to another agent | Violates ADR 0024 decision 6 (shopping for a pass) | Checker stage/blocks never allow fallback in spec or UI; `pickChecker` never falls back to author runtime. |
| Auto-update silently overwrites user edits on forked lane | Data loss / unexpected behavior | Forked lanes default to `freeze`. When `auto` is enabled on a forked lane, 3-way merge pauses on any conflict (`conflict_paused`) and requires explicit user resolution. Every applied update snapshots the prior version for one-click rollback. |
| Nuclear pack fails digest check or fails to load | Weakened assurance on Nuclear runs | `loadNuclearPack` digest verification remains mandatory; dispatcher blocks the run before start (`blockedByNuclearPack` / `blockedByWorkflowPack`); editor flags modified Nuclear lanes with amber warning and records `nuclear_lane_modified` on the run event. |
| Importing skills from external URL leaks paths or unsafe files | Path traversal / prompt injection | Strict URL validation (`https://` only, no local/private hosts), Markdown-only skill ingestion, SHA-256 digests computed and recorded, path traversal rejected. |
| Unbuilt stages/agents presented as live | Operator misled about what runs | Every unbuilt stage (`Review`, `Ship`, custom unmapped stages) and unrunnable agent (`agy`, `grok`, `opencode`, `ollama`) carries an explicit `"Coming soon"` badge. |
| Non-permissive code copied | License violation (AGENTS rule 4) | `@xyflow/react` is MIT (already in `apps/web/package.json`); zero n8n code copied. |
