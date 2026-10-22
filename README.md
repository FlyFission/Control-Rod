# Control Rod

**A platform for running AI agents on real engineering work, with every claim checked before it counts.**

Control Rod is an open-source platform for all things engineering: software, and capital project engineering such as calculations, reports and drawing markups. You create an organization, connect the AI agents you already use, and hand off work by voice, text or chat. Every piece of work becomes a controlled work package, runs in a sandbox, and is accepted only after independent checks and the human sign-off its rigor requires.

It is built for the toughest industries, where a confident mistake costs more than a slow answer. The discipline underneath comes from [nuclear-grade context engineering](https://github.com/FlyFission/nuclear-grade-context-engineering).

> **Status: pre-alpha, design phase.** There is no runnable code yet. The architecture, decisions and plan are being written into this repository first, and every stack choice is being proven with hands-on tests before product code begins.

## The idea in one paragraph

Most agent tools let the agent that wrote the work also move it to "done." Control Rod keeps that decision out of the agent's reach. A small Rust kernel decides every state change, a sandbox limits what each agent can touch, and the runner captures evidence as the work happens. Nothing is accepted until a verification record and the required human signature exist, and the record shows who generated, checked and approved every piece of evidence.

## Two modes, one spine

| | Software mode | Capital Projects mode |
| --- | --- | --- |
| Unit of work | A change (pull request) | A deliverable revision |
| Evidence | Tests, checks, CI, independent review | Execution traces, reproducible calcs, independent checks |
| Human decision | Approve the pull request | Approve for issue |

Both modes share the same controls: work packages, sandboxed runs, custody of evidence, independent verification, signed decisions, and organization floors that no project can loosen. Rigor scales with consequence, from administrative changes to high-consequence work.

## Principles

- Agents never hold the gate.
- Evidence is captured by the system as work happens; agents submit claims.
- Floors only tighten: a project can add control above its organization's floors.
- Provider-neutral: no dependency ties Control Rod to one model vendor or cloud.
- Runs anywhere: a laptop, your own machines, a hosted service, a customer's network, or fully air-gapped.

## What Control Rod is not

Control Rod is not a quality assurance program, a certification, or a substitute for qualified engineering judgment. It supplies discipline and records that a QA program can rely on; the program, and the licensed professionals in it, still own quality and safety decisions. Nothing here claims compliance with any standard until an assessment says so.

## Repository layout

The layout is being scaffolded now. See [AGENTS.md](AGENTS.md) for how work in this repository is done, and `docs/adr/` for decision records as they land.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Built by [FlyFission Consulting Group](https://flyfission.com).
