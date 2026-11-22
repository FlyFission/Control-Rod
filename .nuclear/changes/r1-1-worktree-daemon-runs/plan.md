# Plan: worktree daemon binding

- Persist a validated typed workspace selection on the capture and freeze it onto author runs when queued. Never infer authority from capture text.
- Carry the binding in the run contract. Require daemon support in claim admission so older daemons cannot silently ignore it.
- Validate path containment, symlinks, repository identity, branch and commit on the daemon before launch. Keep run inputs and outputs in a reserved per-run directory inside the checkout without clearing checkout contents. Serialize access to the checkout and leave shared Git administration outside write authority.
- Use the checkout as author working directory with the existing native sandbox and explicit input/output paths. Keep checker preparation separate. Retain daemon-generated checkout evidence.
- Run affected tests, package suites and generated-contract checks, capture inputs, output and digests, then prepare a draft PR with a blind-checker handoff.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All acceptance requirements in trace.md have author evidence; independent checking and human acceptance remain pending.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
