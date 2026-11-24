# DESIGN.md v3.4 proposal: §4 confinement by per-call container

Why it changed: in the confirmation review, both of you flagged that the harness's outer macOS Seatbelt layer and
the CLIs' own sandboxes cannot both work. That was verified on the owner's Mac. A nested `sandbox-exec` under the
harness profile exits 71 (`sandbox_apply: Operation not permitted`), and DNS fails under the profile. Apple also
marks `sandbox-exec` deprecated. The owner asked for the most future-proof answer, not the fastest one. This
proposal replaces the §4 bullets on sign-in and tool access. Every other section stands as agreed in v3.3.

## Proposed §4 text (replaces "Sign-in without exposure" and the isolation part of the probes)

- **One boundary, owned by the harness: a fresh, disposable Linux container for every agent call, grading run and
  harness probe.** It runs in a Linux VM on macOS (Docker Desktop, OrbStack or Colima) and natively on Linux
  (Docker or rootless Podman). There is one code path on every host, and the macOS Seatbelt path is removed.
  A host with no container runtime runs nothing with real agents.
- **Pinned image.** A committed Dockerfile installs pinned Linux builds of each CLI, Python, git and the test
  tools. The run records the image digest, the CLI binary digests inside it, the runtime and VM versions and the
  architecture. Agent containers run on the native architecture (arm64 on Apple Silicon). SWE-bench grading keeps
  its own x86 images. The image digest is published, so anyone on any OS can rebuild and re-run.
- **Mounts: only the call's own directories.** An author gets its tree read-write. A checker gets its source
  read-only and a separate writable scratch directory. Each call also gets its private directory, which holds that
  vendor's isolated login store and session scratch. Nothing else from the host is mounted: no home, no study or
  run directory, no repository, no other workspace, no mirror cache and no sockets (Docker, SSH agent, D-Bus).
- **Least privilege.** Each container runs as a non-root user with every capability dropped and
  `no-new-privileges`. It has a read-only root filesystem, a size-limited tmpfs for `/tmp`, and pid, memory and
  CPU limits. It is removed after its diff or verdict is captured.
- **Network: only the vendor's model endpoint.** A call's container sits on an internal network with no route out.
  Its only exit is an egress proxy, which allowlists that vendor's subscription endpoints by host name. The
  allowlist is frozen in `agents.json`, and DNS goes through the proxy. One rule therefore blocks web search,
  API-key billing hosts, other vendors and data exfiltration. The proxy logs every connection attempt per call:
  host, allowed or denied, and bytes. The log is part of the record, so egress can be checked from outside the
  agent instead of from transcripts.
- **Inner sandboxes as a second layer.** The CLIs' own Linux sandboxes (Claude's bubblewrap, Codex's
  Landlock/seccomp) stay switched on with the pinned flags from v3.3. Preflight records whether each one starts
  inside the container. The container is the boundary of record, for both vendors alike.
- **Sign-in.** Each vendor is signed in once into its own isolated, file-based login store. A macOS Keychain
  sign-in does not carry over. The store is copied into each call's private directory and is never mounted into
  the other vendor's calls. Residual risk, disclosed in every report: an agent's tool shell can read its own
  vendor's token. The container holds nothing else secret, the network reaches only that vendor, and the owner
  revokes the token after the run. A token broker outside the container is left for later.
- **Probes, for each vendor and role, in phase 0, run inside the call's own container configuration.** Everything
  v3.3 lists stays. Two egress checks are added:
  - a request to a host off the allowlist fails, and the proxy log shows the denial;
  - the vendor endpoint is reachable.

  The harness runs fixed shell commands under the same container configuration before any agent probe.

## What this removes from the open findings

These no longer apply: nested-Seatbelt startup and DNS failures, sibling-workspace exposure via a shared workspace
root, the host-socket exposure, and the read-only-inside-writable path rules. Every non-confinement finding (ledger,
grading, capture, lock, statistics, release) is fixed separately and goes to the next code review.

## Questions for the reviewers

1. Does this boundary meet §4's isolation requirements for a published benchmark? If not, what is missing?
2. Is a host-name allowlist proxy, with DNS only through the proxy, enough for the "network except the model
   transport" rule? Or is IP pinning or TLS SNI checking needed?
3. If a CLI's inner sandbox cannot start inside an unprivileged container, should that vendor run with the
   container as its only layer, as long as both vendors are treated alike? Or should the run refuse?
4. Is native arm64 for the agent containers acceptable, given that SWE-bench grading stays x86?
5. Anything else that would corrupt, leak, overspend or mislead in a real run.

Answer AGREE, AGREE WITH CHANGES (list them, each with a concrete fix) or DISAGREE.
