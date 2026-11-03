No blocker or major defects found in `52359de..HEAD`.

- [RequirementsEditor.tsx:114](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/preparation/RequirementsEditor.tsx:114) prevents retiring criteria cited by resolved escalations. Retirement strips references only from open escalations, matching `preserveResolutions`.
- Other editor paths neither mutate resolved escalation records nor remove their cited criteria. Criterion text and mappings remain editable; these change the requirements digest and require renewed confirmation.
- Retiring an open escalation’s last criterion leaves an empty mapping, rather than a dangling reference. [readiness.ts:254](/home/flyfission/worktrees/control-rod-phase0/services/api/src/preparation/readiness.ts:254) explicitly blocks readiness until current criteria are mapped.

Static review only; tests were not run.

MERGE