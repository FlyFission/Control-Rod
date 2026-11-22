# Control Rod Blind Check GitHub Action

Reusable composite GitHub Action that runs `controlrod check` on a pull request or diff against its acceptance criteria using an independent vendor family, and writes the standalone PR receipt to the job summary (and optionally a PR comment).

## Security model

- **Different vendor family required:** `author-runtime` must name the runtime/vendor family that wrote the diff; `controlrod check` enforces `DistinctFamily` and refuses to run with the same or unknown family.
- **No secret forwarding to agents:** `github-token` is passed only to the final `gh pr comment` step when `post-comment: "true"`. `controlrod check` strips secrets via `AgentEnv` and launches agents inside their native sandbox with no bypass/skip-permissions flags.
- **Honest standalone receipt:** receipts generated outside the full Control Rod control plane explicitly state that they carry no passkey acceptance or event-chain inclusion proof.

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
