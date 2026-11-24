# Control Rod — SWOT, GAP & End-User QoL Review (2026-11-24)

Scope: `origin/main` @ `a4885a9d` (#169). Worktree: `~/worktrees/control-rod-10x-audit`, branch `audit/10x-20261124`. This document is untracked; folding it into the repo (e.g. `docs/audits/`) is an amendment-plan decision.

## SWOT

### Strengths
- **Product thesis, evidence-cited.** README grounds every core move (locked work, independent check, human sign-off) in named studies with links and the chart's generating script (`docs/research/second-checker/`). Honest caveats included ("none of these studies measures one vendor's agent reviewing another's code").
- **Honest status ledger.** `docs/status.md` separates "what works on main" from "stubbed or planned" from "known failures", with PR-level evidence pointers. Rare in pre-alpha.
- **CI discipline unusual for the stage.** 4-language CI (TS, Rust, Go, Python) green across the last 10 main runs at ~2–3 min each; bounded timeouts on every job (`tools/check_workflow_timeouts.py` enforces it); contract-drift check (TypeSpec in `spec/` is source of truth); license gate; SBOM; red-team catalog validation; per-commit change-record validation.
- **Layering with a security reason per layer.** Rust kernel decides every state change (WASM-bound), Go daemon runs agents, Fastify API, generated types. 25 ADRs (`docs/adr/`), threat model, CODEOWNERS sign-off on trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` majors, kernel).
- **Design matches the pitch.** Passkey-only accept, cross-vendor check by default with signed self-check override, SCRAM, offline record verification (`pnpm cr verify`).

### Weaknesses
- **Oversized modules, acknowledged.** `services/api/src/work.ts` = 3,516 lines (issue #121 open); `repos.ts` 1,753; `app.ts` 905.
- **Test asymmetry vs trust claims.** API: 81 test files; daemon: 41; web e2e: 11 specs; **kernel: 1 test file** (`kernel/tests/preparation.rs`). The component that "no agent can touch" has the least direct coverage.
- **Repo bloat by design.** `.nuclear/changes/` = 1,177 committed files, 20 MB, including 368 log/patch evidence files. Monotonic growth; every change makes clones bigger forever.
- **Install friction.** git clone + Node ≥22.12 + pnpm + Go (+ uv) — or `mise`. One tag, zero releases, no packaged artifact. `pnpm cr` surface is three verbs (`doctor`, `start`, `verify`); deeper ops live under `daemon/cmd/controlrod` subcommands — two mental models.
- **Platform truth gap.** Live-login runs verified only on WSL2; whole-app macOS start unverified (README table says so). API suite has two known failures on trust-auth test DBs (SEC-01/SEC-03, documented as environmental).
- **Docs sprawl.** 7.9 MB `docs/` mixes end-user docs (getting-started, status) with internal process (`plan/`, `superpowers/`, `sqa/`, `patterns/`, `office-view/`, `overlay-themes/`). New-user discoverability suffers.

### Opportunities
- **Ship a release.** First tag + release notes + mise-pinned versions collapses install friction; the marketing is already ahead of distribution.
- **Evidence offload.** Move heavy logs/patches out of git (CI artifacts or digest-and-manifest in git) while preserving auditability.
- **The flight deck already covers the big gaps** — see PR table below; the amendment plan is sequencing, not invention.
- **Adapter breadth (#125).** 8 CLI ecosystems detected-but-disabled; each enabled one widens the "different vendor checks" moat.
- **Issues #124–#127** (dashboard, adapters, simplification audit, orchestration) show the roadmap already names the right problems.

### Threats
- **Bus factor 1, codified.** Sole-maintainer sign-off is recorded policy (#97→#98, ADR rule in `AGENTS.md`/CODEOWNERS). Deliberate, but it caps review bandwidth and adoption trust for a *security* product.
- **Security pitch outruns tests.** README: red-team catalog "each is meant to become a test that keeps failing, and most are still pending." A published bypass case becomes reputational damage disproportionate to pre-alpha.
- **Air-gap contradiction.** Web app still requests public fonts/map tiles (#133 open) vs "runs on your own machine".
- **Dependency holds.** Deliberate Dependabot skips accumulate unpatched drift (documented in collaboration.md).
- **ADR numbering collision risk.** Main already accepted "ADR 0024: council first, simple by default" (#150 via #161), while open PR #98 proposes recording the sole-maintainer rule **as ADR 0024** — same number, different content. One of these needs renumbering.
- **PR drift = conflict tax.** #98 is 38 commits behind main; #115 is 18 behind with a single commit.

## GAP analysis (current → 10/10)

| # | Gap | Evidence | Closing move | Overlap |
|---|-----|----------|--------------|---------|
| 1 | No distribution artifact | 1 tag, 0 releases; install = clone + 4 tools | Tagged releases, mise pinning, versioned README/install docs | — |
| 2 | Kernel under-tested vs role | 1 test file for the trust anchor | Golden + property suite per kernel decision fn; each red-team catalog case → permanent failing test (their own stated goal) | #115 (stale) |
| 3 | `work.ts` monolith | 3,516 lines, #121/#122 open | Decompose by domain (issue #121 already scopes it) | — |
| 4 | Evidence bloats git | 1,177 files / 20 MB / 368 logs in `.nuclear/changes/` | Digest + manifest in git, payloads to artifact storage | — |
| 5 | Platform qualification incomplete | macOS unverified live; SEC-01/03 env failures | Live-login platforms workflow on Linux+macOS (#123) | — |
| 6 | Docs IA mixes audiences | `docs/{plan,superpowers,sqa,patterns}` vs user docs | Split user/ vs contributor/ trees; one entry index each | — |
| 7 | PR queue drifting | 6 open, 4 heavily behind main | Merge fresh, rebase cheap, close superseded (see table) | all |
| 8 | Sign-off not enforced upstream | #131 open | `controlrod check` + required GitHub PR check | #136 (in flight) |
| 9 | Workspace/runtime binding incomplete | #118/#119 P0s | Daemon runs bound to selected worktree | #135 (in flight) |
| 10 | External custody undefined | #128/#132 | ADR + import-for-check flow | — |

## End-user QoL

**What already works well**
- `pnpm cr doctor` tells you what to fix before you hit it — best-in-class preflight.
- Board-first UX: Needs-you cards sort to column top, `N` jumps to next, tab-title count, opt-in notifications, `?` shortcut list.
- Honesty affordances: "Fallback: ran as X (requested Y)"; spinner only while a run runs; refusal messages say why.
- Passkey accept; SCRAM; offline `pnpm cr verify`; presenting mode hides spend.

**Friction points**
1. **Time-to-first-card.** Toolchain (4 tools or mise) + clone + first-run build "takes a few minutes" before any value. No one-liner install.
2. **Two CLIs.** `pnpm cr {doctor,start,verify}` vs `controlrod {daemon,agents,runtimes,sandbox-args,...}`. An end user shouldn't need to know which surface owns a task.
3. **Local Postgres fragility.** getting-started troubleshooting centers on "database won't start" — local DB is the top support surface, and test DBs already show env-dependent failures.
4. **Single-vendor users.** Every check waits on you (correct by design), but the override loop should be measured in seconds, one passkey tap + a reason.
5. **macOS users told "expected to work, not verified"** — trust-killing copy on the second-best platform; either verify or hide the caveat behind a link.
6. **8 of 10 detected CLIs disabled** with no in-app path to enablement ("Not yet runnable") — expectation management is present, but the roster reads bigger than the product.
7. **No documented uninstall/reset** for a tool whose pitch is "your data lives in ~/.controlrod".

## Open PR cognizance (for the amendment plan)

| PR | Title | Drift vs main | Touches | Verdict |
|----|-------|---------------|---------|---------|
| #167 | Visual reference board + per-screen visual bar | +28/−3 (fresh) | 100 files, mostly `apps/web`, office themes | Merge first; newest, low conflict |
| #160 | Cross-vendor checking benchmark (`pnpm cr bench`) | +9/−11 | `bench/`, 1 core file | Rebase cheap; adds the measurement loop the pitch promises |
| #136 | `controlrod check` CLI + Action + PR receipt | +11/−17 | `daemon/`, `services/api`, `scripts/cr.mjs`, `.github` (trust surface → sign-off required) | High value (closes #131/#130); rebase onto current check-send-back work (#169) — it touches the same `runner/check.go` area |
| #135 | Run authors in their selected worktree | +8/−17 | 57 files, daemon+api | P0 territory (#118/#119); rebase then merge before further daemon drift |
| #115 | O6 quorum attestation (DRAFT) | +1/−18 | kernel + `services/api` + wasm blob | 1 commit, 18 behind; kernel = sign-off surface; re-evaluate whether superseded by newer kernel work |
| #98 | Sole-maintainer ADR (DRAFT) | +2/−38 | docs/ADR | **ADR 0024 number already used on main (#161) with different content** — renumber or supersede; else merge conflict in `docs/adr/` is guaranteed |

Owner-side workflow hygiene (not the repo, but you asked about workflow): the primary checkout `~/projects/Control-Rod` sits on `feat/simple-custody-cli-models-and-walk`, 14 behind origin/main; 25+ worktrees exist across `~/projects` and `~/worktrees`. Pruning stale worktrees (pr2/pr3/pr4, 2026-10-22 review trees, detached-HEAD trees) would cut confusion and disk.

## Suggested amendment-plan ordering

1. Triage the PR queue (fresh→merge, stale→rebase-or-close; resolve ADR 0024 collision).
2. Close the two P0 issue clusters already in flight (#118/#119 via #135, then #120 daemon recovery).
3. Ship distribution gap: first release + install one-liner + macOS verification decision (verify or de-emphasize).
4. Evidence lifecycle change (biggest long-term repo-health lever; needs an ADR + sign-off since it alters `.nuclear/` conventions).
5. `work.ts` decomposition (#121) once the daemon/API PR queue is drained.
6. Docs IA split (user vs contributor).
7. Kernel test depth + red-team catalog → tests cadence (pairs with #115 decision).

Scoring the gap to 10/10: workflow/discipline ~8/10, code health ~7/10, distribution ~4/10, end-user onboarding ~6/10, trust-verification depth ~5/10. The repo's own issues already name 80% of this; the differentiator is sequencing and actually landing the in-flight PRs.
