# Control Rod Blind Check GitHub Action

Reusable composite GitHub Action that runs `controlrod check` on a pull request or diff against its acceptance criteria using a checker from a different vendor family, and writes a standalone check summary to the job summary (and optionally a PR comment).

## Security model

- **Caller-declared author, distinct checker family:** `author-runtime` is declared by the caller (not cryptographically attested in standalone mode). `controlrod check` enforces `DistinctFamily` against that declared author and labels it as `(caller-declared, unverified)` in outputs.
- **Merge-base diffing:** When `diff-file` is omitted, the Action resolves `git merge-base "$BASE" "$HEAD_REF"` before calling `controlrod check --base ... --head ...`, so commits added to the base branch after PR branch-off do not appear as deletions in the PR diff. Ensure `actions/checkout` uses `fetch-depth: 0`.
- **Criteria read from base ref by default:** When `criteria` is provided, `criteria-from-base` defaults to `"true"`, passing `--criteria-ref "$BASE"` so `controlrod check` reads the criteria from the base commit via git rather than from the PR head checkout. Set `criteria-from-base: "false"` only when the criteria file lives outside the PR branch, or pass `criteria-text` directly in the workflow.
- **Linked `pnpm cr verify` receipt binding:** Every verdict and receipt comment embeds `<!-- controlrod-check-binding: {...} -->` with the checked PR `head_sha`, full `diff_sha256`, `criteria_sha256`, and optional `package-revision`. An auditor running `pnpm cr verify --receipt <pr-comment.md> <inclusion-proof.json>` (or passing `inclusion-proof` directly to the Action) will fail verification unless an authenticated human acceptance in the bundle covers that exact diff (a valid `diff_sha256` is required), revision, the same package ID as the bundle, and, when the bundle records a head commit, that head commit (a mismatch fails). Platform events do not record head SHAs, so usually the proof is reported as not head-bound (`proof-verified=true-not-head-bound`) and no head binding is claimed. It does **not** bind the bundle's pre-check checker, verdict or acceptance criteria to this standalone check, so the Action never appends a "Verified Control Rod acceptance" section; `proof-verified=true` is not verified acceptance of this check.
- **Offline verifier is not built by the Action:** `inclusion-proof` needs `services/api/dist/verify-bundle.js`. Run `pnpm install --frozen-lockfile && pnpm --filter @control-rod/api build` in the Control Rod checkout first (or set `CONTROLROD_VERIFY_JS`); otherwise the proof is reported as not verified and the step fails.
- **Head commit:** In git mode `head-ref` defaults to the pull request head SHA from the event (else `HEAD`).
- **No secret forwarding to agents:** `github-token` is passed only to the `gh pr comment` step when `post-comment: "true"`. `controlrod check` strips secrets via `AgentEnv` and launches agents inside their native sandbox with no bypass/skip-permissions flags. Comment failures on fork PRs warn without bypassing verdict enforcement.
- **Standalone output limits:** Without a verified `inclusion-proof` bundle, standalone Action runs do not connect to a Control Rod control plane, so their output carries **no human passkey acceptance** and **no Control Rod inclusion proof** for `pnpm cr verify`.

## Example usage

```yaml
jobs:
  blind-check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<pinned-sha>
        with:
          fetch-depth: 0
      - uses: FlyFission/Control-Rod/packages/check-action@<pinned-sha>
        with:
          author-runtime: claude
          checker-runtime: codex
          criteria: docs/acceptance.md
          post-comment: "false"
```
