# Control Rod

**A platform for running AI agents on real engineering work, with every claim checked before it counts.**

Control Rod is an open-source platform for all things engineering: software, and capital project engineering such as calculations, reports and drawing markups. You create an organization, connect the AI agents you already use, and hand off work by voice, text or chat. Every piece of work becomes a controlled work package, is designed to run in a sandbox, and is accepted only after independent checks and the human sign-off its rigor requires.

It is built for the toughest industries, where a confident mistake costs more than a slow answer. The discipline underneath comes from [nuclear-grade context engineering](https://github.com/FlyFission/nuclear-grade-context-engineering).

> **Status: pre-alpha, owner-local.** `main` runs on one machine for one person: the Rust kernel, the API and database, the run daemon, the web app (with the office view and its themes), and the site-concept and drawing packs. Native CLI sandboxes (Phase 6 A) have landed; sandbox confinement is not yet qualified on every platform. Hosted deployment, independent witnessed evidence and the remaining organization controls are planned. Nothing here is a compliance claim. See [docs/status.md](docs/status.md) for what works, what is stubbed and what is next.

## Quick start

You need Node 22+, pnpm, Go and uv. [Claude Code](https://claude.com/claude-code) signed in is needed for real agent runs, and Codex is optional (see [docs/getting-started.md](docs/getting-started.md)).

```sh
pnpm install --frozen-lockfile
pnpm cr doctor   # lists anything missing
pnpm cr start    # control plane, database and daemon on http://localhost:7300
```

Open <http://localhost:7300>, register a passkey, and send a request. The full walkthrough, test commands and troubleshooting are in [docs/getting-started.md](docs/getting-started.md).

## Working on it

New here? Read, in this order: [AGENTS.md](AGENTS.md) (the rules), [docs/getting-started.md](docs/getting-started.md) (run it and test it), [docs/collaboration.md](docs/collaboration.md) (how work moves from issue to merge) and [CONTRIBUTING.md](CONTRIBUTING.md).

## The idea in one paragraph

Most agent tools let the agent that wrote the work also move it to "done." Control Rod keeps that decision out of the agent's reach. A small Rust kernel decides every state change, a sandbox is designed to limit what each agent can touch (not yet in force for release runs; see the status note), and the runner captures evidence as the work happens. Nothing is accepted until a verification record and the required human signature exist, and the record shows who generated, checked and approved every piece of evidence.

## Two modes, one spine

| | Software mode | Capital Projects mode |
| --- | --- | --- |
| Unit of work | A change (pull request) | A deliverable revision |
| Evidence | Tests, checks, CI, independent review | Execution traces, reproducible calcs, independent checks |
| Human decision | Approve the pull request | Approve for issue |

Both modes share the same controls: work packages, sandboxed runs (planned), custody of evidence, independent verification, signed decisions, and organization floors that no project can loosen. Rigor scales with consequence, from administrative changes to high-consequence work.

## Principles

- Agents never hold the gate.
- Evidence is captured by the system as work happens; agents submit claims.
- Floors only tighten: a project can add control above its organization's floors.
- Provider-neutral: no dependency ties Control Rod to one model vendor or cloud.
- Designed to run anywhere: a laptop, your own machines, a hosted service, a customer's network, or an air-gapped network. Today the web app still requests public fonts and map tiles, so it is not yet air-gap ready.

## What Control Rod is not

Control Rod is not a quality assurance program, a certification, or a substitute for qualified engineering judgment. It supplies discipline and records that a QA program can rely on; the program, and the licensed professionals in it, still own quality and safety decisions. Nothing here claims compliance with any standard until an assessment says so.

## Repository layout

| Path | What lives there | State |
| --- | --- | --- |
| `kernel/` | Rust kernel: every state change is decided here. WASM binding for the API. | Built. **Trust surface** |
| `services/api/` | Fastify API, Postgres migrations, auth with passkeys, evidence and records | Built |
| `apps/web/` | React web app: inbox, packages, office view, roster, records, spend, policies | Built |
| `daemon/` | Go run daemon: claims jobs, launches agent CLIs in their sandboxes, uploads evidence | Built |
| `spec/` | TypeSpec contracts; every language generates from here | Built. **Trust surface** (major versions) |
| `packs/` | Domain packs: `capital-projects` (site concept, drawings) and `general` (intake, author and pre-check roles) are built; `software` is a stub | Partly built |
| `sdk/python/` | Python SDK (so far the digest helpers shared with the kernel) | Early |
| `tools/`, `scripts/` | License gate, originality and claim checks, `pnpm cr` launcher | Built |
| `tests/` | Conformance (CAD), end-to-end fixtures, and the red-team catalog | `tests/redteam/` is a **trust surface** |
| `policies/` | Default Cedar floors and QA overlays | Stub. **Trust surface** |
| `connectors/`, `runtimes/`, `deploy/` | Channel and forge connectors, agent runtime adapters, deployment bundles | Stubs, planned |
| `docs/` | Decisions (`adr/`), threat model, SQA package, guides, specs and plans | See [docs/README.md](docs/README.md) |
| `.nuclear/changes/` | One change record per change: risk, basis, plan, trace, verification, ship | Required |

See [AGENTS.md](AGENTS.md) for how work in this repository is done, and `docs/adr/` for the decision records.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Built by [FlyFission Consulting Group](https://flyfission.com).
