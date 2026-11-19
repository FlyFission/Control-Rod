# Risk: lock down the README screenshot workflow

- **Mode:** Standard
- Execution owner: Claude Code under Ben Huffer's 2026-11-18 instruction to lock down the screenshot workflow from #93.
- Decision owner: a maintainer other than the person who prompted the agent (`docs/collaboration.md`). Not chosen here; see `ship.md`.
- **Trust surface touched: yes.** `.github/workflows/readme-shots.yml` (AGENTS rule 2, CODEOWNERS `/.github/`). No other workflow, policy, red-team fixture, spec version or kernel function is touched.
- Not signed. This record is a draft for the signer and also serves as the missing record for the workflow #93 added.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Pull request code or a dependency uses a write token. | `shots` is read-only with no stored credential; `commit` runs no repository code. | Any repository code or setup step added to `commit`. |
| R-02 | A poisoned artifact pushes more than pictures. | Folder, link, name, signature, size and count checks; staged paths limited to the pictures folder (`evidence/commit-step-test.txt`). A PNG signature does not prove the rest of the file is an image. | A staged path outside `docs/assets/readme/app/`. |
| R-03 | A branch name injects shell code. | Branch name passed as `HEAD_REF` in the environment and quoted. | zizmor reporting template injection. |
| R-04 | The commit job overwrites a newer push. | Skips when the branch head is not the event's head SHA; a non-fast-forward push fails anyway. | A push that drops a commit. |
| R-05 | The split breaks the screenshot flow. | This PR changes the workflow file, so its own CI runs both jobs; the result is reported in `verification.md` as it ran. | `commit` red on a valid run. |
| R-06 | Independent review cannot be shown on GitHub: CODEOWNERS lists only `@FlyFission`, which opens this PR. | Named in `ship.md` as an open decision. | Merge without a recorded signer. |

## Selected mode

- **Mode:** Standard
- Basis: edits a CI workflow that holds a write token. Reversible by reverting one commit; no schema, contract or persisted data change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-05 are implemented with scanner, YAML-parse and local test evidence, and CI on this change is reported as it ran; the signature for the screenshot workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
