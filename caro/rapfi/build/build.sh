#!/usr/bin/env bash
# Dựng Rapfi (GPL-3, https://github.com/dhbloo/rapfi) thành WebAssembly cho BOAT – tái tạo đúng file trong caro/rapfi/.
#   bash caro/rapfi/build/build.sh [thư mục ra, mặc định caro/rapfi]
# Cần emsdk đã kích hoạt (emcmake / emcc trong PATH) và cmake. Biến RAPFI_SRC: bản clone có sẵn (bỏ qua thì tự clone).
# Mã nguồn được dùng nguyên vẹn ở commit ghim dưới đây; chỉ thêm expose-fs.js (--pre-js) và không gói sẵn mạng nào
# (wasm_preloads.txt rỗng) – trang tự tải đúng mạng của luật khi người chơi chọn BOAT.
set -euo pipefail
RAPFI_COMMIT=3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/caro/rapfi}" && cd "${1:-$ROOT/caro/rapfi}" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "${RAPFI_SRC:-}" ]; then
  cp -r "$RAPFI_SRC/Rapfi" "$WORK/Rapfi"
  (cd "$RAPFI_SRC" && [ "$(git rev-parse HEAD)" = "$RAPFI_COMMIT" ]) || echo "Cảnh báo: RAPFI_SRC không ở commit $RAPFI_COMMIT"
else
  git clone https://github.com/dhbloo/rapfi.git "$WORK/src"
  git -C "$WORK/src" checkout "$RAPFI_COMMIT"
  mv "$WORK/src/Rapfi" "$WORK/Rapfi"
fi
mkdir -p "$WORK/Networks" && : > "$WORK/Networks/wasm_preloads.txt"

build() { # $1 = tên thư mục, $2.. = tuỳ chọn cmake
  local dir="$WORK/build-$1"; shift
  emcmake cmake -S "$WORK/Rapfi" -B "$dir" -DCMAKE_BUILD_TYPE=Release -DNO_MULTI_THREADING=ON -DNO_COMMAND_MODULES=ON \
    -DUSE_SSE=OFF -DUSE_AVX2=OFF -DUSE_AVX512=OFF -DUSE_BMI2=OFF -DUSE_VNNI=OFF -DUSE_WASM_SIMD_RELAXED=OFF \
    -DCMAKE_EXE_LINKER_FLAGS="--pre-js $HERE/expose-fs.js" "$@" > "$dir.log"
  cmake --build "$dir" -j"$(nproc)" >> "$dir.log"
  cp "$dir"/rapfi-single-simd128.js "$dir"/rapfi-single-simd128.wasm "$OUT/"
}
# Mạng NNUE của Rapfi bắt buộc có SIMD (không có bản vô hướng): trình duyệt không hỗ trợ WebAssembly SIMD
# (rất cũ, vd. Safari < 16.4) thì BOAT tự dùng engine của game.
build simd -DUSE_WASM_SIMD=ON   # → rapfi-single-simd128.{js,wasm}
ls -la "$OUT"
