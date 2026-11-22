# PR #117 review follow-up

| Area | Correction | Evidence |
| --- | --- | --- |
| Package lifecycle | Packages use the existing signed rejection flow. The unsigned close operation and board shortcuts are removed. | Existing decision-path checks and desktop browser suite. |
| Historical run | Deep links resolve by package and exact run ID through organization-scoped lookup. Historical attempts are read-only. | PostgreSQL route test and desktop historical reload. |
| Capture intake | Dismissal scopes the capture and work to the caller organization. A completion after dismissal preserves the run record and cannot draft new packages. | Queued and running intake lifecycle checks. |
| Workspace projects | Creation, edits and archive use signed administrator commands. Project ID and the requested change bind to the assertion. The organization admin lock serializes project preference writers. Runtime preferences and archive readiness use owning-organization scope. Archive persists the canonical project lifecycle status. | Passkey-backed create, update and archive checks, plus two concurrent edits that both persist. |
| Capture project identity | New Work and Quick Add capture the selected project ID. Intake validates it against the owning organization and stores that specific project on the draft. Labels still show the project name. | Same-name projects exercised through Quick Add and API intake. |
| Browser defaults | Project cache and active selection are scoped by signed-in user. New Work starts from the effective board lane runtimes. Project controls wait for the server-confirmed result after signing. | Browser session, modal, and runtime selection checks. |
| Contracts | TypeSpec and generated artifacts include project operations, capture dismissal, exact runs and runtime model lists. | Regeneration and typechecking. |
| Checker isolation | Linux binds credentials read-only and gives the CLI writable disposable state. Protected login hashing stays within existing per-file, total byte, and entry limits. | Daemon suite and Bubblewrap checks using synthetic login files. |
| Registry and checker dispatch | The API registry test compares with the checked-in daemon registry. Before dispatch, the control plane selects and stores the approved concrete model for a default checker. The worker uses that same binding. | Claim and stored-run comparison, grade admission checks, and daemon preflight check. |

Live provider login refresh with read-only credential mounts remains unverified. Provider qualification and worktree binding remain separate from these fixes. The desktop follow-up stays stacked until the reviewed board changes land on main.

[PR review](https://github.com/FlyFission/Control-Rod/pull/117/files)
