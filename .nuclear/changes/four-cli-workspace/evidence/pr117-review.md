# PR #117 review follow-up

| Area | Correction | Evidence |
| --- | --- | --- |
| Package lifecycle | Packages use the existing signed rejection flow. The unsigned close operation and board shortcuts are removed. | Existing decision-path checks and desktop browser suite. |
| Historical run | Deep links resolve by package and exact run ID through organization-scoped lookup. Historical attempts are read-only. | PostgreSQL route test and desktop historical reload. |
| Capture intake | Dismissal scopes the capture and work to the caller organization. A completion after dismissal preserves the run record and cannot draft new packages. | Queued and running intake lifecycle checks. |
| Workspace projects | Creation uses the signed administrator command. Runtime preferences and archive readiness use owning-organization scope. Archive persists the canonical project lifecycle status. | Positive passkey-backed create and archive checks. |
| Browser defaults | Project cache and active selection are scoped by signed-in user. New Work starts from the effective board lane runtimes. | Browser session, modal, and runtime selection checks. |
| Contracts | TypeSpec and generated artifacts include project operations, capture dismissal, exact runs and runtime model lists. | Regeneration and typechecking. |
| Checker isolation | Linux binds credentials read-only and gives the CLI writable disposable state. Protected login hashing stays within existing per-file, total byte, and entry limits. | Daemon suite and Bubblewrap checks using synthetic login files. |
| Registry | The API registry test compares with the checked-in daemon registry. | Attestation test. |

Live provider login refresh with read-only credential mounts remains unverified. Provider qualification and worktree binding remain separate from these fixes. The desktop follow-up stays stacked until the reviewed board changes land on main.

[PR review](https://github.com/FlyFission/Control-Rod/pull/117/files)
