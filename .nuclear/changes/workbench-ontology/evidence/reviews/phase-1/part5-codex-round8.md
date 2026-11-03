Static review of `cf03791`; no files modified or tests executed.

**Closed:** P5-01 and P5-03–P5-27. **P5-29 is partially fixed:** marked packages now traverse configured provenance unless an override exists. P5-02, P5-28 and P5-29 remain incomplete through P5-30.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P5-30 | High | **Declassification hides later configured-source raises.** Declassify accepted package B to internal, then raise its configured document’s lane to restricted and restart. B’s override still returns internal without inspecting configured provenance. Downstream A can consequently send B’s derived outputs to Claude/Codex. Approval binds only marking versions; configured classifications have no recorded coverage or invalidation. | `services/api/src/work.ts:208`; `services/api/src/work.ts:216`; `services/api/src/markings.ts:332`; `services/api/src/work.ts:666` | Bind configured-source classifications to declassification coverage and compare them with current configuration during recursive admission. Changed or missing classifications must invalidate coverage or hold dispatch, including through overridden ancestors. |

BLOCK