#!/usr/bin/env bash
# Builds the kernel's WebAssembly binding for the control plane. The output in
# services/api/kernel/ is generated: never edit it by hand, rebuild it with this script.
# Needs the wasm32-unknown-unknown target, the Rust version pinned in mise.toml and
# wasm-bindgen-cli 0.2.104 (the same version as the wasm-bindgen crate).
#
# The build is reproducible: CI runs this script and fails when the result differs from the
# committed files (`.github/workflows/ci.yml`, job kernel-wasm). Panic messages inside the
# binary carry the source paths of dependencies, so the cargo home is mapped to one fixed name,
# and any RUSTFLAGS of your own are left out.
set -euo pipefail
cd "$(dirname "$0")/.."
WASM_BINDGEN_VERSION="0.2.104"
found="$(wasm-bindgen --version 2>/dev/null || true)"
if [ "$found" != "wasm-bindgen $WASM_BINDGEN_VERSION" ]; then
  echo "need wasm-bindgen $WASM_BINDGEN_VERSION, found '${found:-none}':" >&2
  echo "  cargo install wasm-bindgen-cli --version $WASM_BINDGEN_VERSION --locked" >&2
  exit 1
fi
cargo_home="${CARGO_HOME:-$HOME/.cargo}"
unset CARGO_ENCODED_RUSTFLAGS
RUSTFLAGS="--remap-path-prefix=${cargo_home}=/root/.cargo" \
  cargo build --release --locked --target wasm32-unknown-unknown -p controlrod-kernel-wasm
wasm-bindgen --target nodejs --out-dir services/api/kernel --out-name controlrod_kernel \
  target/wasm32-unknown-unknown/release/controlrod_kernel_wasm.wasm
printf '{ "type": "commonjs", "private": true }\n' > services/api/kernel/package.json
