# Risk: Settings subscriptions page

- **Mode:** Standard
- Execution owner: Cursor agent under the milestone 10 brief.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow, or spec major version is edited.
- Scope: a read-only settings page, the daemon's subscription report, and `GET /subscriptions`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The page shows a CLI or an auth state that was not probed. | The report lists only adapters that implement the subscription listing. Auth is taken from the probe the daemon already ran. An id other than claude or codex is dropped by the API. | A test or a page row for a provider that is not registered. |
| R-02 | A status command's output, which can include account material, is stored or shown. | The report keeps a fixed sentence, not the command output. The API drops objects that carry a token, key, secret, or password field, and drops version or path text that looks like a credential. | A stored or rendered value that contains a planted token. |
| R-03 | The extra report runs the CLI again and changes launch behavior. | The report is built from the statuses the scheduled probe already produced. `QualifiedPlatform` is not changed. The unpinned-runtime test still sees two CLI runs. | That test counting any other number of runs. |
| R-04 | An API-key field is added for a CLI that has no login. | API-key-only adapters are not listed. The page renders no input. | An input on the page, or a listed adapter that reports `APIKeyOnly`. |
| R-05 | macOS is treated as qualified for launches because the settings flag is set. | The flag changes only the settings record. The launch preflight is unchanged. | A launch accepted on macOS or native Linux because the flag is set. |

## Selected mode

- **Mode:** Standard
- Basis: a read-only page and an additive API field. Reversible by revert. No protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The page and `GET /subscriptions` show only probes the daemon reported for registered provider CLIs. No token field is rendered or stored. Unit tests for the probe and the page pass, and the page's axe scan reports no violations. Existing launch behavior is unchanged.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
