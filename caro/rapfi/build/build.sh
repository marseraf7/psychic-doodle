#!/usr/bin/env bash
# Dựng Rapfi (GPL-3, https://github.com/dhbloo/rapfi – bản sao lưu https://github.com/marseraf7/rapfi) thành WebAssembly
# cho BOAT – tái tạo đúng các file trong caro/rapfi/:
#   rapfi-single-simd128.{js,wasm}  Rapfi nguyên bản (luật tự do / tiêu chuẩn / Renju)
#   rapfi-caro-simd128.{js,wasm}    Rapfi-CARO: cùng mã + bản vá server/scripts/rapfi/caro/rapfi-caro.patch (luật Việt Nam)
#   bash caro/rapfi/build/build.sh [thư mục ra, mặc định caro/rapfi]
# Cần emsdk đã kích hoạt (emcmake / emcc trong PATH; bản đã dùng: 6.0.12) và cmake.
# Nguồn (theo thứ tự ưu tiên):
#   RAPFI_SRC=<thư mục>   bản clone có sẵn (phải ở commit ghim dưới đây)
#   RAPFI_CLONE=1         clone từ bản sao lưu marseraf7/rapfi, lỗi thì từ kho gốc dhbloo/rapfi
#   (mặc định)            gói nguồn kèm theo rapfi-src-3c94c2a.tar.gz cùng thư mục – không cần mạng
# Bản nguyên bản dùng mã nguồn nguyên vẹn; chỉ thêm expose-fs.js (--pre-js) và không gói sẵn mạng nào
# (wasm_preloads.txt rỗng) – trang tự tải đúng mạng của luật khi cần. RAPFI_ONLY=single | caro: chỉ dựng một bản.
set -euo pipefail
RAPFI_COMMIT=3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/caro/rapfi}" && cd "${1:-$ROOT/caro/rapfi}" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "${RAPFI_SRC:-}" ]; then
  cp -r "$RAPFI_SRC/Rapfi" "$WORK/Rapfi"
  if [ -d "$RAPFI_SRC/.git" ] && [ "$(git -C "$RAPFI_SRC" rev-parse HEAD)" != "$RAPFI_COMMIT" ]; then
    echo "Cảnh báo: RAPFI_SRC không ở commit $RAPFI_COMMIT – bản dựng sẽ khác bản trong app" >&2
  fi
elif [ "${RAPFI_CLONE:-}" = "1" ]; then
  # Bản sao lưu (fork) trước, kho gốc của tác giả sau – cùng commit ghim nên cùng mã nguồn
  git clone https://github.com/marseraf7/rapfi.git "$WORK/src" || git clone https://github.com/dhbloo/rapfi.git "$WORK/src"
  git -C "$WORK/src" checkout -q "$RAPFI_COMMIT"
  mv "$WORK/src/Rapfi" "$WORK/Rapfi"
else
  mkdir "$WORK/src"
  tar xzf "$HERE/rapfi-src-3c94c2a.tar.gz" -C "$WORK/src" --strip-components=1
  mv "$WORK/src/Rapfi" "$WORK/Rapfi"
fi
mkdir -p "$WORK/Networks" && : > "$WORK/Networks/wasm_preloads.txt"

build() { # $1 = thư mục mã (trong $WORK), $2 = tên bản ra, $3.. = tuỳ chọn cmake
  local src="$WORK/$1" name="$2" dir="$WORK/build-$2"; shift 2
  # Lỗi thì in phần cuối nhật ký (thư mục tạm bị xoá khi thoát)
  if ! { emcmake cmake -S "$src" -B "$dir" -DCMAKE_BUILD_TYPE=Release -DNO_MULTI_THREADING=ON -DNO_COMMAND_MODULES=ON \
      -DUSE_SSE=OFF -DUSE_AVX2=OFF -DUSE_AVX512=OFF -DUSE_BMI2=OFF -DUSE_VNNI=OFF -DUSE_WASM_SIMD_RELAXED=OFF \
      -DCMAKE_EXE_LINKER_FLAGS="--pre-js $HERE/expose-fs.js" "$@" && cmake --build "$dir" -j"$(nproc)"; } > "$dir.log" 2>&1; then
    echo "✗ Dựng $name thất bại – 40 dòng cuối nhật ký:" >&2
    tail -40 "$dir.log" >&2
    exit 1
  fi
  # Glue JS vẫn gọi tên dự án rapfi-single-simd128.wasm; worker.js (wasmName) đổi sang đúng file khi nạp
  cp "$dir"/rapfi-single-simd128.js "$OUT/$name.js"
  cp "$dir"/rapfi-single-simd128.wasm "$OUT/$name.wasm"
}
# Mạng NNUE của Rapfi bắt buộc có SIMD (không có bản vô hướng): trình duyệt không hỗ trợ WebAssembly SIMD
# (rất cũ, vd. Safari < 16.4) thì BOAT tự dùng engine của game.
if [ "${RAPFI_ONLY:-}" != "caro" ]; then
  build Rapfi rapfi-single-simd128 -DUSE_WASM_SIMD=ON
fi
if [ "${RAPFI_ONLY:-}" != "single" ]; then
  # Rapfi-CARO: thêm luật Việt Nam (chặn hai đầu) – bản vá GPL-3 kèm trong repo
  mkdir -p "$WORK/caro/Networks" && : > "$WORK/caro/Networks/wasm_preloads.txt" && cp -r "$WORK/Rapfi" "$WORK/caro/Rapfi"
  (cd "$WORK/caro" && patch -s -p1 < "$ROOT/server/scripts/rapfi/caro/rapfi-caro.patch")
  build caro/Rapfi rapfi-caro-simd128 -DUSE_WASM_SIMD=ON
fi
ls -la "$OUT"/rapfi-*-simd128.*
sha256sum "$OUT"/rapfi-*-simd128.* 2>/dev/null || shasum -a 256 "$OUT"/rapfi-*-simd128.*
