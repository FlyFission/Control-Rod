# The benchmark's agent image (DESIGN-v3.4-proposal.md, Pinned image). Every input is pinned:
# - the base image by its multi-architecture index digest;
# - Debian packages from a fixed snapshot.debian.org timestamp (fetched over http; apt checks
#   every file against the signed Release, so the transport needs no certificate);
# - the agent CLIs by exact version, each tarball checked by `npm ci` against package-lock.json.
# Build with `python3 bench/cross-check/bench.py image --tag cr-bench-agent:1` (it records the image, Dockerfile and binary digests). The
# image holds no credential: each call gets its own copied sign-in store under /work/private.
FROM debian@sha256:a64d9dbf633e2a2503afac76be521dc25d9b5765150b30d31a3914d4ae969cab

ARG SNAPSHOT=20261124T000000Z
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8 PYTHONDONTWRITEBYTECODE=1

RUN set -eu; \
    rm -f /etc/apt/sources.list.d/debian.sources; \
    printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/%s trixie main\n' "$SNAPSHOT" > /etc/apt/sources.list; \
    printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/%s trixie-security main\n' "$SNAPSHOT" >> /etc/apt/sources.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates bubblewrap socat ripgrep git python3 curl \
        nodejs npm openssl dnsutils netcat-openbsd procps; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/cr-bench
COPY container/package.json container/package-lock.json ./
# No install script runs. Claude Code's postinstall would only copy its native binary over a
# placeholder, so `claude` points straight at the pinned platform package's binary instead.
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force \
    && case "$(dpkg --print-architecture)" in amd64) A=x64 ;; arm64) A=arm64 ;; *) exit 1 ;; esac \
    && test -x "/opt/cr-bench/node_modules/@anthropic-ai/claude-code-linux-$A/claude" \
    && ln -s "/opt/cr-bench/node_modules/@anthropic-ai/claude-code-linux-$A/claude" /usr/local/bin/claude \
    && claude --version | grep -q "(Claude Code)" \
    && ln -s /opt/cr-bench/node_modules/.bin/codex /usr/local/bin/codex \
    && ln -s /opt/cr-bench/node_modules/.bin/srt /usr/local/bin/srt
COPY crbench/egress.py /opt/cr-bench/egress.py

# One unprivileged user; the launcher passes --user to match the host owner of the mounts.
RUN useradd --uid 1000 --create-home --home-dir /home/agent agent && mkdir -p /work && chown 1000:1000 /work
USER 1000:1000
WORKDIR /work/repo
