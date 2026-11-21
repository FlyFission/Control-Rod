# Risk: bounded timeouts for every CI job

- **Mode:** Standard
- Execution owner: Claude Code under Ben Huffer's 2026-11-18 instruction to draft the change record for the `ci.yml` timeouts.
- Decision owner: Ben Huffer, the sole maintainer, under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off) (#97). A review by a maintainer who did not author the change is not available while CODEOWNERS names one maintainer.
- **Trust surface touched: yes.** `.github/workflows/ci.yml` (AGENTS rule 2, CODEOWNERS `/.github/`). No kernel decision function, policy, red-team fixture or spec version is touched.
- Scope: `.github/workflows/ci.yml` only. Nine added lines in one commit, kept apart so it can be dropped without losing this record.
- Signed by the sole maintainer's recorded yes on 2026-11-21 (`ship.md`). The cap values were chosen by the owner the same day.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A cap shorter than a healthy run fails CI and blocks merges. | Caps are 7.8 to 47.4 times the worst of 7 recent runs (`evidence/job-times.txt`); the smallest margin is `typescript` (154 s worst, 20 min cap). A failed run is fixed by re-running or raising one cap. | A job reaching half its cap in a normal run. |
| R-02 | A cold-cache or slow-runner day exceeds a cap. | The sample includes a 14-package dependency bump (run 43790733047). `rust` ran 29 to 38 s against a 30-minute cap, so a cold build has room. One sample of 7 runs, all on warm tool caches. | The first timeout in a run that is otherwise healthy. |
| R-03 | The new `change-records` step fails for a reason unrelated to timeouts (interpreter missing, a false failure on a legitimate future workflow). | The step runs in this PR's CI before merge. The checker fails loudly rather than skipping what it cannot read. The step is one separable line to remove. | The step red on a workflow that does have bounded timeouts. |
| R-04 | The checker is a hand-written line scanner and can false-pass. Review of #69 found six bypasses, all fixed. | For this file, `evidence/yaml-parse.txt` is a real YAML parse showing the same seven caps, so the pass does not rest on the scanner alone. Other workflow files are not covered by that parse. A PyYAML rewrite was offered and not taken. | A further bypass finding against the checker. |
| R-05 | The caps and the 60-minute ceiling are model-drafted numbers. | They are policy choices of the signer, not measurements; `evidence/job-times.py` computes the margins from recorded inputs and states the caps as inputs. AGENTS rule 5 is met for the measurements, not for the choice of cap. | The signer prefers other caps; edit `ci.yml` and `evidence/job-times.py` together. |
| R-06 | Independent review cannot be shown on GitHub. CODEOWNERS lists only `@FlyFission`, and this PR is opened from that account. | Named in `ship.md` as an open decision for the maintainers: a second maintainer reviews, or the owner records an exception. The agent does not choose. | Merge without a recorded independent signer. |

## Selected mode

- **Mode:** Standard
- Basis: edits the CI gate (a trust surface) and adds a check that can fail every later run. Reversible by reverting one commit; no schema, contract or persisted data change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CT-01 to CT-04 are implemented with checker and YAML-parse evidence and a green CI run on this change; the signature, the cap values and the independence of the signer are stated for the maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
