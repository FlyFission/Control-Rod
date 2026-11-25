# Ship: trust agent updates

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Accepted by owner decision:** newer Antigravity and Grok builds are seated without a live qualification (risk R-03, R-04).
- **Known (blind check, P2, pre-existing):** the model picker offers models a CLI reports (for example `grok-4.7-build-fast`) to a checker; the API holds a non-deciding checker model rather than running it.
- **Known (blind check round 2, P2, pre-existing):** Codex's feature listing does not load a login-bound workspace-managed policy, which could pin a feature on at launch; same exposure as the fixed switch list on main.
- **Not claimed:** no live run of a newer Antigravity or Grok; Codex switch-off shown on the Linux build.

Rollback: revert the commit. Exact pins and the Codex refusal return.

Monitoring after merge: a newer build observed using a tool outside its sandbox (add it to the gate, or set a floor above the bad build); a Codex feature that will not switch off.

## Signature

| Field | Entry |
|---|---|
| Decision | Merge #218 to main |
| Question | "Merge PR 218 now that it's updated and passing?" (decision card in the owner's project thread, 2026-11-25) |
| Answer | Ben Huffer chose "Yes, merge 218" at 2026-11-25T21:46:25Z |
| Head when asked | `c3f95e29` |
| Later changes | merge of main (#221) and this record only |
| Recorded by | Claude, from the owner's own choice on the card. No signature or initials are typed for him |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-05 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
