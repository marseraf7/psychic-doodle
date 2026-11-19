#!/usr/bin/env bash
# Dựng lõi luật Rust ra WebAssembly (opt-level "s", LTO, strip – xem Cargo.toml) và chép vào js/caro_rules.wasm
# để js/rules-wasm.js nạp được. Chạy: bash core/caro-rules/build-wasm.sh  (cần: rustup target add wasm32-unknown-unknown)
set -euo pipefail
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown "$@"
cp target/wasm32-unknown-unknown/release/caro_rules.wasm js/caro_rules.wasm
echo "caro_rules.wasm: $(wc -c < js/caro_rules.wasm) byte, gzip -9: $(gzip -9c js/caro_rules.wasm | wc -c) byte"
