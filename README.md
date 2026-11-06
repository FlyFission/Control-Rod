# Control Rod

**A workspace where you and your AI agents get real work done, and the agents don't get to say when it's done.**

You hand over a task. Agents you already use (Claude Code, Codex) do the work. A different agent checks it. Then *you* look at the result and sign off. Until you do, nothing counts as finished, no matter how confident the agent sounds.

It runs on your own machine, in your browser. There's a board for your work, an office view where you can watch agents at their desks, and a record of who did, checked and approved everything.

> **Pre-alpha.** It works end to end on one machine for one person, and we're building it in the open. Expect rough edges. [What works today, and what doesn't](docs/status.md).

## Why this exists

Most agent tools make it easy to start an agent and watch it go. That part is fun. The trouble comes at the end: the same agent that did the work also tells you it passed, and you either trust it or re-check everything yourself.

For a side project, fine. For work where a confident mistake is expensive (production code, engineering calculations, drawings) it isn't.

Control Rod keeps the freedom and moves the final say. **You can work however you like. Agents can't mark their own homework.**

| You can | An agent can't |
| --- | --- |
| Type anything, drop in files, and let an intake agent draft the work for you | Release a task, accept a result, or sign anything. Those need your passkey (Touch ID, Windows Hello or a hardware key). |
| Run Claude Code, Codex or both, on your own subscriptions | Check its own work. The checker runs separately and never sees the author's transcript. |
| Stop a run, send work back with notes, or override a rule *on the record*, with a reason | Edit its own acceptance criteria, policies or tests |
| Change what "done" means for a task, as long as you re-sign it | Type up a number and have it believed. Values have to come from a tool run that left evidence. |
| Set it up for software changes or for engineering deliverables like a example package | Get an answer without a reason. When the system refuses something, it says why. |

The deciding logic is a small Rust program (the *kernel*) that agents never touch. Evidence is captured by the system while the work happens, not written up afterward by the agent. We keep a [catalog of every known way around a control](tests/redteam/catalog.yaml); each one is meant to become a test that keeps failing, and some are still pending.

## How it feels

1. **Say what you want.** "Fix the login redirect." "Site a facility for this project," with a file attached.
2. **It becomes a task with a definition of done.** An intake agent either answers you or drafts one or more work packages, each with clear acceptance criteria. You read them, edit them, and release them with your passkey.
3. **Agents do the work.** You can watch from the board or the office view. Each run starts inside the sandbox policy recorded for it, and is stopped with one click if it goes sideways.
4. **A different agent checks it.** It doesn't get the author's chain of thought, only the result and the evidence.
5. **You decide.** Accept, send it back with direction, or reject. Your signature is attached to exactly what you looked at, and the history shows every step.

## Try it

You need [Node 22+](https://nodejs.org), [pnpm](https://pnpm.io/installation), [Go](https://go.dev/dl/) and [uv](https://docs.astral.sh/uv/getting-started/installation/). To run real agents, install [Claude Code](https://claude.com/claude-code) and sign in. Codex is optional. [mise](https://mise.jdx.dev) can install everything above at the pinned versions: run `mise install`.

```sh
git clone https://github.com/FlyFission/Control-Rod.git
cd Control-Rod
pnpm install
pnpm cr doctor   # checks your setup and tells you what to fix
pnpm cr start    # builds on first run, then opens everything at http://localhost:7300
```

Open <http://localhost:7300>, choose **Set up this machine**, and register a passkey. That's the whole account: one machine, one person, no cloud sign-up. (Your agents still talk to their own providers, and the web app still loads some public fonts and map tiles, so it does not yet work fully offline.)

The first start builds the app and takes a few minutes. After that it's quick. `Ctrl+C` stops everything. Your data lives in `~/.controlrod`.

**If `pnpm cr doctor` says the database can't start:** it prints the fix. Usually a clean reinstall (`rm -rf node_modules && pnpm install`) does it. If not, point Control Rod at your own PostgreSQL 17 (Docker, Postgres.app or Homebrew all work) and everything else is the same.

More detail, test commands and troubleshooting: [docs/getting-started.md](docs/getting-started.md).

## What it is not

Control Rod isn't a quality assurance program, a certification, or a replacement for qualified engineering judgment. It produces discipline and records that a QA program can lean on; the people and processes around it still own quality and safety decisions. Nothing here claims compliance with a standard.

## Building it with us

We want this to be easy to join.

- **Start here:** [docs/getting-started.md](docs/getting-started.md) gets you running and shows how to check a change.
- **How we work:** [docs/collaboration.md](docs/collaboration.md) covers issues, branches, reviews and merging.
- **The rules, in one page:** [AGENTS.md](AGENTS.md). They apply to people and to the agents you drive.
- **Why it's built this way:** the [decision records](docs/adr/) and the [threat model](docs/threat-model.md).

The repo is built under its own discipline: each change gets a short record under `.nuclear/changes/`, contracts in `spec/` are the source of truth, and a few directories (`kernel/`, `policies/`, `spec/`, `tests/redteam/`, `.github/`) need a second pair of human eyes. [CONTRIBUTING.md](CONTRIBUTING.md) explains.

### Find your way around

| Where | What |
| --- | --- |
| `apps/web/` | The web app: inbox, board, office view, roster, records, spend, policies |
| `services/api/` | The API, database migrations, sign-in and the evidence record |
| `kernel/` | The Rust kernel that decides every state change |
| `daemon/` | The Go daemon that runs agents and collects evidence |
| `spec/` | The contracts everything else is generated from |
| `packs/` | Domain packs: example package and drawings, plus the general-purpose agent roles |
| `docs/` | Guides, decisions, specs and plans, starting at [docs/README.md](docs/README.md) |
| `policies/`, `connectors/`, `runtimes/`, `deploy/` | Placeholders for what's planned |

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Built by [FlyFission Consulting Group](https://flyfission.com).
