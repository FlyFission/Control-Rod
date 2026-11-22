# Control Rod Blind Check GitHub Action

Reusable composite GitHub Action that runs `controlrod check` on a pull request or diff against its acceptance criteria using a checker from a different vendor family, and writes a standalone check summary to the job summary (and optionally a PR comment).

## Security model

- **Caller-declared author, distinct checker family:** `author-runtime` is declared by the caller (not cryptographically attested in standalone mode). `controlrod check` enforces `DistinctFamily` against that declared author and labels it as `(caller-declared, unverified)` in outputs.
- **Criteria read from base ref by default:** When `criteria` is provided, `criteria-from-base` defaults to `"true"`, passing `--criteria-ref "$BASE"` so `controlrod check` reads the criteria from the base commit via `git show` rather than from the PR head checkout. Set `criteria-from-base: "false"` only when the criteria file lives outside the PR branch, or pass `criteria-text` directly in the workflow.
- **No secret forwarding to agents:** `github-token` is passed only to the `gh pr comment` step when `post-comment: "true"`. `controlrod check` strips secrets via `AgentEnv` and launches agents inside their native sandbox with no bypass/skip-permissions flags. Comment failures on fork PRs warn without bypassing verdict enforcement.
- **Standalone output limits:** Standalone Action runs do not connect to a Control Rod control plane, so their output carries **no human passkey acceptance** and **no Control Rod inclusion proof** for `pnpm cr verify`.

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
