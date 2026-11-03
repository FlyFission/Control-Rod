#!/usr/bin/env bash
# Builds the kernel's WebAssembly binding for the control plane. The output in
# services/api/kernel/ is generated: never edit it by hand, rebuild it with this script.
# Needs the wasm32-unknown-unknown target and wasm-bindgen-cli 0.2.104.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release --locked --target wasm32-unknown-unknown -p controlrod-kernel-wasm
wasm-bindgen --target nodejs --out-dir services/api/kernel --out-name controlrod_kernel \
  target/wasm32-unknown-unknown/release/controlrod_kernel_wasm.wasm
printf '{ "type": "commonjs", "private": true }\n' > services/api/kernel/package.json
