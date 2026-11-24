# DESIGN.md v3.4 proposal, revision 2: §4 confinement by per-call container

Revision 2 folds in the reviewers' design check of revision 1. Codex on Astra and Antigravity on Neon both answered
AGREE WITH CHANGES. Where the two differed, on tool access to the token, the stricter rule (Astra's) is used here:
the owner chose it on 2026-11-24.

Why it changed: in the confirmation review, both of you flagged that the harness's outer macOS Seatbelt layer and
the CLIs' own sandboxes cannot both work. That was verified on the owner's Mac: a nested `sandbox-exec` under the
harness profile exits 71 (`sandbox_apply: Operation not permitted`), and DNS fails under the profile. Apple also
marks `sandbox-exec` deprecated. This proposal replaces the §4 bullets on sign-in and tool access, and amends §9
where noted. Every other section stands as agreed in v3.3.

## Proposed §4 text

### Boundary

- **One boundary, owned by the harness: a fresh, disposable Linux container for every agent call, harness probe and
  grading run.** It runs in a Linux VM on macOS (Docker Desktop, OrbStack or Colima) and natively on Linux. There is
  one code path on every host; the macOS Seatbelt path is removed. A host with no supported runtime runs nothing with
  real agents. Each supported runtime and profile needs its own exact-launch evidence before it is claimed.
- **Pinned image.**
  - The Dockerfile is committed. It pins the base image by `@sha256`, and each CLI build and tool by exact version
    and SHA-256.
  - The run records the image digest, architecture, Dockerfile digest, the CLI binary digests inside the image, and
    the runtime and VM versions.
  - The agent image holds the pinned CLIs and generic tools, not per-repo SWE-bench environments.
  - A rebuild on another architecture reproduces the pinned toolchain with an architecture-specific digest. Images
    are not claimed byte-identical across architectures.
- **Architecture.**
  - All four roles (both authors and both checkers) run in the same native-architecture agent image, arm64 on Apple
    Silicon.
  - Hidden tests grade the same captured patch bytes in the pinned x86 SWE-bench images.
  - Reports state the scope: authored and checked on arm64, with hidden-test outcomes measured on x86. That is not
    evidence of cross-architecture correctness. Any architecture-sensitive repository in the cohort is named.
- **Blinding inside the container.**
  - Mount paths are fixed and opaque: `/work/repo`, `/work/scratch` and `/work/private`.
  - The host name is neutral.
  - Container names, labels and environment carry only an opaque launch ID. There is no task, repository, role or
    vendor.
- **Mounts: only the call's own directories.**
  - An author gets `/work/repo` read-write.
  - A checker gets `/work/repo` read-only and a separate writable `/work/scratch`.
  - Each call gets `/work/private`.
  - Nothing else from the host is mounted: no home, no study or run directory, no repository, no other workspace, no
    mirror cache, no hidden tests or outcomes, and no sockets (Docker, SSH agent, D-Bus).
  - Writable mounts and output streams are size-bounded.
  - On Linux, `--user <uid>:<gid>` matches the host owner of the mounts.
- **Least privilege.**
  - Non-root user, every capability dropped, `no-new-privileges`, default seccomp and AppArmor.
  - Read-only root filesystem and a size-limited tmpfs `/tmp`.
  - pid, memory and CPU limits, and `--init`.
  - Container hardening is never weakened to make anything inside it start.
- **Lifecycle.** On exit, timeout, error or interrupt, the harness removes the container (`rm -f`) and waits for the
  removal to finish before any of these:
  - capturing a diff;
  - checking a checker tree;
  - deleting a host directory;
  - admitting another launch.

  Orphaned containers carrying this run's label are reconciled with the ledger and removed on every start and
  resume. Host-side capture keeps the no-follow, patch-bytes and identity checks.

### Network

- **Per call, per vendor.** Each call has its own internal network with no route out. Its only exit is that call's
  egress proxy, which holds that vendor's allowlist and nothing else. No two containers can reach each other.
- **The proxy:**
  - allows `CONNECT <host>:443` only, for exact host names frozen in `agents.json` (no wildcards), and denies plain
    HTTP methods and every other port;
  - resolves allowed names itself, refuses IP literals, and refuses resolved addresses that are loopback, private
    (RFC 1918), CGNAT, link-local or metadata, IPv6 loopback, ULA or link-local, or the host or VM gateway;
  - checks, passively and without decrypting, that the TLS ClientHello server name exactly matches the CONNECT host,
    and refuses the connection otherwise.
- **No direct network.** The container has no direct route and no DNS resolver, so it cannot use direct DNS.
- **Logs.** The proxy logs each connection attempt by launch ID: host, allowed or denied, and bytes. It never logs
  headers, credentials or bodies. Proxy logs and container metadata go through the release privacy checks.
- **What the proxy does and does not do.** It blocks off-allowlist egress, cross-vendor access and direct
  exfiltration paths. It does **not**, on its own, block provider-native web search or API-key billing: one endpoint
  (for example `api.anthropic.com`) can serve both subscription and API-key traffic. The pinned CLI flags and probes
  still block web search, and §9's checks still enforce subscription-only billing.

### Tool processes get neither the token nor the network

v3.3's rule stands: shell network egress must fail, and an agent's tools may not read credentials. A container
alone does not meet it, because the CLI and its tool shell share the container. So:

- **The credential and the network belong to the CLI's transport, not to the processes that run shell commands or
  tests.** The CLIs' own sandboxes (Claude's bubblewrap and Codex's Landlock/seccomp, with the pinned v3.3 flags)
  enforce this inside the container: tool children get no network and cannot read `/work/private`.
- **An admission check, not a fallback.** Phase 0 checks, with the real launcher and no model call, that each CLI's
  inner sandbox starts inside the hardened container.
- **If an inner sandbox cannot start, the container is not weakened.** These choices are open, in order:
  1. a narrower runtime profile, such as a seccomp profile that adds only unprivileged user namespaces, adopted only
     if every §4 and §5 control still passes;
  2. a small VM per call (for example Kata, Firecracker or Apple's container framework), where the inner sandboxes
     start normally and the VM is the boundary.

  The choice is frozen before calibration and used for both vendors and every role. Nothing falls back mid-run.
  If no choice demonstrates the split, the run refuses.
- **Every call is verified, not just declared.** Phase 0 places a harmless credential sentinel in `/work/private`
  and checks, through the actual launcher, that a tool child can neither read it nor open any network connection.
  Separately, it checks that the CLI completes an authenticated model call.

### Sign-in

- **One store per vendor.** Each vendor is signed in once into its own isolated, file-based master login store on
  the host. A macOS Keychain sign-in does not carry over.
- **Per-call copies.** Each call gets a copy in `/work/private`. That copy is never mounted into the other vendor's
  calls, and no container writes back to the master store.
- **Token freshness.** Before each batch, the host checks token freshness, one vendor at a time, and refreshes the
  master store on the host when needed, so concurrent calls never race on an expired or rotated refresh token.
  Phase 0 measures token lifetime and refresh behavior.
- **Billing checks run inside the container.** Each CLI's `auth status`, the billing-key and config scan (including
  `/etc/codex/*.toml` and `codex features`), and the token-file check (an API-key prefix is refused) all run inside
  the pinned container, against the copied store, with every billing variable stripped from the launch environment.
  They run at phase 0 and again on every resume.
- **Residual risk, stated in `report.md` and `share.md`.** The CLI process itself holds its own vendor's token, as
  it does under the product daemon. The owner revokes the tokens after the run.

### Grading

- **Offline.** Fixture and SWE-bench grading run with no vendor credentials and no network. Images are staged
  before grading.
- **Hidden tests stay out of agent containers.** Hidden tests and outcomes never enter an agent container or the
  adjudication view.

### Probes, for each vendor and role, in phase 0

- **Everything v3.3 lists stays**, run through the call's exact container configuration and launcher. The harness
  runs fixed shell commands before any agent probe.
- **Added egress checks:**
  - a host off the allowlist is refused, and the proxy log shows it;
  - a direct TCP connection to a raw IP and a direct DNS query both fail;
  - the vendor endpoint is reachable from the CLI's transport;
  - a mismatched TLS server name is refused.
- **Added credential and inner-sandbox checks:** the credential-sentinel test and the inner-sandbox admission check
  above. For Codex, a PTY is available if its pinned tools need one.
- **The confirmation-review probe rules stay required.** Probes run:
  - under the run lock, with `load_manifest` and in-flight reconciliation on error;
  - with a checker scratch write and a refused write to `/work/repo`;
  - checking `git rev-list --all --count == 1`;
  - with a non-empty Claude tool list.
- **Authenticated probes are counted like study calls.** They come under the same durable reservations, caps and
  stop rules.

### Resources

Preflight checks the VM's free disk and RAM, because the same VM holds the SWE-bench images, the agent images and
the proxies.

## §9 amendment

`agents.local.json` cannot override the container image, the in-container CLI binary or the egress allowlist. It
may set only:
- the host login-store path;
- a container-runtime selector from a frozen list;
- the allowlisted transport values.

## Status of earlier findings

The nested-Seatbelt startup and DNS failures, sibling-workspace exposure, host-socket exposure and the
read-only-inside-writable path rules are **addressed by design, pending exact-launch verification.** Every other
finding (capture, ledger, grading, verdict lock, sizing, release) keeps its status until the next code review
verifies it.
