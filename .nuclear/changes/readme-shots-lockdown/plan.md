# Plan: lock down the README screenshot workflow

1. Split `readme-shots.yml` into `shots` (read-only, `persist-credentials: false`, builds and screenshots, uploads the artifact) and `commit` (`contents: write`, same-repository pull requests only, runs no branch code).
2. In `commit`: check the branch out at its head, download the artifact outside the workspace, skip if the branch moved, accept only 1 to 20 flat regular PNG files with plain lower-case names under 5 MB, stage only `docs/assets/readme/app/*.png`, and push with the branch name passed through an environment variable.
3. Add `timeout-minutes` (30 and 10) and a per pull request concurrency group. Pin `actions/download-artifact` by commit (v8.0.2, 9000827).
4. Check the result: zizmor before and after, a YAML parse, and the commit step run against nine local fixture artifacts.
5. Separately, restore `.nuclear/changes/overlay-themes/evidence/browser-results.json` from 8b875ab^ (overwritten in #93 by a local `--list` run) and correct the 4.9 row of the buildout log; neither is a trust surface.
6. Open a draft PR with the trust-surface box ticked and leave the signature to a maintainer.

## Rollback

Revert the workflow commit; the record stays. To stop the workflow pushing at all, delete the `commit` job and the pictures stay an artifact.

## Revision 2 plan

1. Remove the `commit` job from `readme-shots.yml`.
2. Add `readme-shots-commit.yml` on `workflow_run` (`readme-shots`, completed) with the same script, taking `HEAD_REF` and `HEAD_SHA` from `github.event.workflow_run`, downloading the artifact by run id with `actions: read`.
3. Re-run zizmor, the YAML parse and the nine fixture cases against the new file.
4. Record the owner's approval of revision 1 in `ship.md` as a recorded approval, not a signature.
5. Open a draft PR; merge waits on the owner's yes. After merge, check the first live `readme-shots-commit` run.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-05 are implemented with scanner, YAML-parse and local test evidence, and CI on this change is reported as it ran; the owner's recorded yes to each revision is in [ship](ship.md) under the sole-maintainer rule, with no independent review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
