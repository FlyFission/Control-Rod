# Cross-vendor checking benchmark

Control Rod's core claim is that a second agent, from another vendor, should check an author's work before a person signs off. Published research supports parts of that idea (see `docs/research/second-checker/`), but no study we found measures one vendor's coding agent reviewing another vendor's code. This benchmark measures it on real tasks, and anyone can re-run it.

The design is [DESIGN.md](DESIGN.md) (v3.3), agreed after four rounds of blind review by Antigravity on Gemini 4 Neon and Codex on Astra. This README says how to run it. Where the two differ, DESIGN.md wins.

It is started by hand, every time. Nothing here runs on a schedule.

## What it measures

Two authors, Claude Code and Codex, each solve every task once. Every patch that is nonempty and valid is then checked twice: by a checker on the author's own model ("same") and by one from the other vendor ("cross"). Hidden tests (SWE-bench `FAIL_TO_PASS` and `PASS_TO_PASS`), which no agent sees, grade each patch as hidden-test-failing ("bad") or passing ("good").

The headline is the **equal-author-weight contrast**: cross minus same explicit-rejection rate, on bad patches (catches) and on good patches (false rejections), averaged over the two authors, with a 95% task-bootstrap interval. Beside it: both directions, paired 3×3 verdict tables, inconclusive bounds, exact McNemar within each author, Youden's J, leave-one-repository-out, verdict stability, and workflow outcomes for A1 (tests), A2 (+ same) and A3 (+ cross). The human arm (A4) is omitted from this run (DESIGN.md, Owner decision 3).

"Rejection" means an explicit fail verdict. The words "defects caught" are used only for the adjudicated outcome.

## The order of a study

Each step writes its record into the study directory and refuses to run out of order.

```sh
B="pnpm cr bench"            # or: python3 bench/cross-check/bench.py
S=~/cr-bench-studies/2026-11  # any directory; keep it outside the repository

$B init      --study $S --config bench/cross-check/configs/verified-historical.json  # freezes the protocol
$B select    --study $S --phase calibration     # 10-12 tasks and calibration/audit.md
$B exclude   --study $S --phase calibration --task ID --reason "..."   # strike defective tasks, before any call
$B preflight --study $S --phase calibration --confirm-overage-off   # billing route, sign-in, CLI digests, host, Docker
$B probe     --study $S                         # isolation probes, each vendor and role
$B controls  --study $S --phase calibration     # base and gold twice, known-bad, missing-report, every task
$B run       --study $S --phase calibration     # prints the plan; add --yes to start
$B lock      --study $S --phase calibration     # hashes every verdict, builds the blind adjudication queue
$B adjudicate --study $S --phase calibration --item ID --judgment supported --note "..."   # or --skip REASON
$B evaluate  --study $S --phase calibration     # hidden tests, only after lock and adjudication
$B score     --study $S --phase calibration
$B size      --study $S                         # power.py: phase-1 count, pilot or stop; frozen once
$B select    --study $S --phase main            # then the same steps for phase main
$B release   --study $S --confirm-redistribution   # privacy scan, digests, transcript asset, share.md
```

Every gate record (preflight, probes, controls) carries the digests of the study, the harness code and, for a phase, its manifest; `run` refuses a record made for anything else, and refuses outright if the harness code changed since `init`. `run` exits non-zero unless the phase is complete.

`run` stops cleanly at a usage limit and records a quota pause for that vendor, using the reset time the CLI states when it states one. Start it again after the limit resets; it resumes the same task block. A call whose retries are used up stops the run as incomplete; it is never recorded as done. It never runs on a timer.

## Spend

Only the CLIs' existing subscription sign-ins are used. `preflight` refuses to start if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY` or another billing key or API-key mode is in the environment, the CLI config or the sign-in store, and it checks each CLI's own status command against the isolated login store the calls will use. It also needs `--confirm-overage-off`: you check, in each vendor's account settings, that paid extra usage is off, because no CLI reports that. Billing keys are looked for again on every `run` start. Reports say $0 actual; any API-equivalent figure is disclosure only and is not money anyone pays. Token totals cover every launch (retries, probes, repeats) and are marked partial when any call reported no usage.

## Sign-in without exposure

Each call gets a fresh opaque directory under `/var/tmp/cr-bench-<uid>/` holding a single-commit export of the task's base tree, and a separate private directory with only that CLI's sign-in, mounted into the call's container at `/work/private`:

- Codex: the benchmark's own sign-in, separate from your everyday one, so a token the benchmark refreshes never signs out your own CLI. Create it once with `CODEX_HOME=~/.config/cr-bench/codex codex login`. Each call gets a copy of its `auth.json`; if Codex refreshes the token during a call, the refreshed copy replaces the store atomically after the container is gone.
- Claude Code: a subscription token from `claude setup-token`, kept in `~/.config/cr-bench/claude-oauth-token` (mode 600). Each call gets it as Claude Code's own credentials file in its config directory, never as an environment variable, because every tool process inherits the environment. A token that is not a subscription token (an API key) is refused.

If they live elsewhere, `agents.local.json` (ignored by git) may move the sign-in store (`login_store.source`) and set transport values on the allowlist in `agents.json` (for Codex, only the ChatGPT backend URL). It cannot change the store's kind, model, effort, tools, sandbox or CLI binary.

## Confinement

Every real agent call runs in its own fresh Linux container (DESIGN-v3.4-proposal.md). On macOS that container runs in a small Linux VM; the benchmark is tested with Colima. The container mounts only three directories, at fixed paths: the call's tree at `/work/repo` (read-only for a checker), a checker's scratch at `/work/scratch`, and the call's private directory at `/work/private` (the sign-in copy and HOME). Nothing else of your machine is visible.

Each container gets `--cap-drop ALL`, no-new-privileges, a read-only root, a tmpfs `/tmp`, process, memory and CPU limits, a neutral host name, an AppArmor profile (`container/cr-bench-bwrap.apparmor`) and a seccomp profile (`container/seccomp-userns.json`, derived by `container/make_seccomp.py` from Docker's default). The two profiles add only what each CLI's own bubblewrap sandbox needs to start inside an unprivileged container. Claude Code's containers also run with Docker's system-path masking off, because its sandbox mounts a fresh `/proc`; AppArmor's `/proc` and `/sys` denials still apply, and `preflight` refuses unless it sees the profile enforced inside a container. The egress proxy keeps Docker's default profiles.

Network: each call has its own internal network with no route out and no DNS resolver. The only way out is a per-call egress proxy (`crbench/egress.py`), listening only on the call network, that allows HTTPS `CONNECT` on port 443 to the vendor's exact hosts in `agents.json`. It refuses IP literals and any host that resolves to a private, loopback, link-local or shared address, and it drops a connection unless its first TLS record is one complete ClientHello naming exactly the host it asked for. It logs host, decision and byte counts, never headers or bodies, and caps connections, log lines and bytes. What it guarantees is the resolved address and the initial TLS name; traffic inside an allowed connection is not inspected.

Tool processes get neither the token nor the network: each CLI's own sandbox denies `/work/private` and all network to the commands the model runs. `preflight` checks this for both roles with no model call (`admission`), using sentinel sign-in files laid out like the real ones. A tool child must fail to read them, must not see a credential in its environment, and must fail to open a socket to the proxy or the internet or use the proxy. Every probe line must be present, the script must reach its end, the proxy log must exist, and a positive control from outside the inner sandbox must reach the vendor, so a check cannot pass by printing nothing.

The container, its proxy and its network are removed, and the removal waited for, before the harness captures the result, so nothing a call started can still write. Leftovers from a crash are removed by label at the next start.

Fixture grading and the stub agents in the tests still use the outer host sandbox ported from Control Rod's daemon (Seatbelt on macOS, bubblewrap on Linux).

Git never runs with your global or system config, hooks or signing. Each task's base tree is exported from git objects and checked by tree OID; an author's change is captured in a fresh trusted export, never by running git in the author's `.git`; patches stay bytes end to end and are re-applied and compared by tree OID.

`probe` checks the boundary before any task call. From a plain shell in the call's exact container: no host path is visible, a checker's source is read-only, an off-list host, a raw IP, an IP literal, direct DNS and a mismatched TLS server name all fail, and the vendor host is reachable. Then each agent runs one fixed script, `PROBE.sh`, with its own shell tool, so every step runs inside the CLI's sandbox whether or not the model would have tried it. In the container it tests what the CLI's sandbox decides (its sign-in directory, the network, credential variables by name, and a checker's read-only source and writable scratch) and prints only allowed or denied, never a protected file, which a model would rightly refuse to do. Host paths are left to the boundary probes, since they are not in the container at all. Outside a container (stub agents) it also reads the host canaries and lists real credential folders, each with a planted entry with a unique name that is removed afterwards. Codex models decline, from one run to the next, to run a step their permission profile forbids (reading the sign-in directory, or a checker's write to its read-only source). So Codex's script leaves out those two steps, and both denials are taken from admission, which runs them through `codex sandbox` with the run's exact flags. A probe counts only if the transcript shows the script ran and reached its last line, Claude reports its model and tool list (Codex in `--ephemeral` mode reports no resolved model; its calls are recorded as unverified), and no token, planted name or sentinel appears.

Residual risk, disclosed in every report: the CLI process itself holds its own sign-in, and its traffic to the vendor's allowed hosts is not inspected.

### Setting up the container runtime (macOS)

```sh
brew install colima docker
mkdir -p /var/tmp/cr-bench-$(id -u) && chmod 700 /var/tmp/cr-bench-$(id -u)
colima start --cpu 6 --memory 16 --disk 160 --mount /var/tmp/cr-bench-$(id -u):w --mount /private/var/tmp/cr-bench-$(id -u):w
colima ssh -- sudo apparmor_parser -r < bench/cross-check/container/cr-bench-bwrap.apparmor
python3 bench/cross-check/bench.py image --tag cr-bench-agent:1
```

Share only the workspace root into the VM (`--mount`, in both its `/var/tmp/...` and `/private/var/tmp/...` forms); SWE-bench grading needs the memory and disk set in `configs/verified-historical.json`; Colima's default shares your whole home directory. The AppArmor profile does not survive a VM restart: load it again after each `colima start`. `preflight` refuses if the workspace root is not visible in a container, if the image differs from the one it pinned, or if the VM is short of memory or disk. `bench.py image` builds from pinned inputs (base image digest, a fixed Debian snapshot, exact CLI versions checked against `container/package-lock.json`) and records the image ID and the binaries' digests. The image holds no credential.

## Configs

- `configs/fixture.json`: eight offline fixture tasks and two stub agents. The tests run this.
- `configs/verified-historical.json`: SWE-bench Verified, the `15 min - 1 hour` and `1-4 hours` tiers, labelled historical. Its calendar horizon, call and token caps and timeouts are the owner's to set before `init`. The calibration allocation of 120 calls covers 12 tasks × 6 calls, stability repeats of up to 24, 4 probes and retry headroom.

Download the dataset once to a local JSONL file in the format the pinned harness reads (swebench 5 needs each row's `image`, `eval_script`, `log_parser` and `eval_type`, as in `SWE-bench/SWE-bench_Verified`; `preflight` builds a test spec from every selected row and checks the harness accepts every flag passed to it, so a mismatch stops before any call), Each task's grader image is pulled for its own platform (`linux/amd64` for the `x86_64` images, run under Rosetta on a Mac) before the harness runs, and its image ID and digests are recorded with the controls and the evaluation. pin its SHA-256, row count and split in the config (`init` refuses while they are null), and point `snapshot.path` at it. A pre-sampling exclusion list, if you use one, is pinned the same way under `selection.pre_exclusions`. Rows with an empty `FAIL_TO_PASS` or `PASS_TO_PASS` (SWE-bench Verified has 11 with no regression tests) are left out of the pool before drawing, because a regression could never be seen on them; the manifest and `audit.md` name each one with its reason.

## Tests

```sh
python3 -m unittest bench/cross-check/test_bench.py
```

116 offline tests, run on Python 3.9 and 3.13, cover the rules the code enforces: the freeze, seeded selection and a reserve that must fill, signed sizing, exclusions closing at the first call, single-commit exports by tree OID, git hooks ignored, capture that never reads the author's `.git`, links and binary files in patches, read-only checker trees (a container checker's directories keep their mode, so Claude Code's sandbox sees the read-only mount, EROFS rather than EACCES, and skips its mount points), sandbox mount-point leftovers dropped from a capture and recorded, the test-path rule (add, edit, delete, rename, `tests/`), the strict verdict schema, the isolation flags, the container flags, mounts and environment file, the egress proxy (real TLS ClientHellos, server-name mismatch, private-address and rebinding refusals), the outer confinement (deny, allow back, read-only, no network; skipped on a host with neither mechanism), billing-key refusal, sealed, leaky and lazy probes, unique attempt IDs, the run lock, the call cap, the calibration allocation, the frozen phase-0 token gate, quota pauses in ledger order and the 24-hour grace, halts on sign-in and repeated infra errors, exhausted retries, the deadline, interrupted calls, model, CLI and harness changes, a checker that writes to source, grading by test ID, every-task controls, the staged verdict lock and its re-verification, the blind queue, scoring, sizing, and the release gate. They use no network and make no model calls. One more test runs the boundary probes in the real image and is skipped unless the image and a container runtime are present.

## Limits

- The benchmark calls the CLIs directly, not through Control Rod's daemon.
- Real calls need a container runtime (Colima on macOS, Docker on Linux) and the pinned image.
- Two vendors, one model each. The result says nothing about other agents or about vendor diversity in general.
- Agent calls are not seeded. Every input and output is kept, so a run can be audited but not replayed exactly.
- Hidden tests are the reference, and they can be wrong. Tasks are audited and can be struck before any call.
- The agent half of the isolation probes depends on the agent running the probe script; one that declines fails the probe rather than passing it. The harness half does not depend on the agent.
- `power.py` judges each simulated study with a cluster-robust normal interval, not the full task bootstrap that `score` uses. Its output records this.
