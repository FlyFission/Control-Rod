Static review of `35a18f1`; no files modified or tests executed.

**Closed:** P5-01, P5-03–P5-13, P5-15–P5-22, P5-24 and P5-26. Author completion calls `endOverride` when recording outputs (`work.ts:1238`), removing the override and propagating the recomputed marking (`markings.ts:138–144`).

**Still incomplete:** P5-02, P5-14, P5-23 and P5-25, through the remaining path below.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P5-27 | High | **Legacy prepared dependencies still conceal restricted provenance.** An accepted prepared package B predating this branch can have an internal stored lane and outputs derived from an additional capture or attachment in its retained preparation basis. Classifying that source as restricted does not reach B. Both recursive dispatch lookup and first-marking reconstruction inspect only B’s original capture and package dependencies, omitting its preparation basis. Downstream A therefore admits subscription runtimes and transmits B’s derived outputs. | [work.ts:201](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:201), [markings.ts:119](/home/flyfission/worktrees/control-rod-phase0/services/api/src/markings.ts:119), [work.ts:655](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:655) | Include the source package’s retained preparation basis in recursive admission and marking reconstruction. Refuse unclassified ancestors and persist their provenance edges so subsequent raises propagate. |

BLOCK