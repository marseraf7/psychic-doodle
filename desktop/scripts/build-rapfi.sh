#!/usr/bin/env bash
# Dựng Rapfi gốc (native, GPL-3) làm tiến trình phụ (sidecar) cho app desktop Tauri – chạy được trên Linux, macOS và
# Windows (Git Bash; trước đó phải nạp môi trường Visual Studio – vcvars / ilammy/msvc-dev-cmd – để có clang-cl).
#   bash desktop/scripts/build-rapfi.sh
# Ra: desktop/src-tauri/binaries/pbrain-rapfi-<target-triple>[.exe]       Rapfi nguyên bản (tự do / tiêu chuẩn / Renju)
#     desktop/src-tauri/binaries/pbrain-rapfi-caro-<target-triple>[.exe]  Rapfi-CARO: + bản vá luật Việt Nam
# Cả hai đều + bản vá rapfi-mt.patch (đa luồng: lệnh gửi ngay sau nước đi không bị mất – như bản WASM đa luồng).
# Biến môi trường:
#   RAPFI_SOURCE=clone (mặc định) | tarball   clone fork marseraf7/rapfi đúng commit ghim (lỗi thì kho gốc dhbloo/rapfi,
#                                              lỗi nữa thì gói nguồn kèm repo); tarball: chỉ dùng gói nguồn, không cần mạng
#   RAPFI_PRESET=<preset CMake>               ghi đè lựa chọn tự động (x64 → x64-clang-AVX2, arm64 → arm64-clang-NEON)
#   TARGET_TRIPLE=<triple>                     ghi đè triple (mặc định: máy chủ của rustc)
#   RAPFI_WORK=<thư mục>                       thư mục làm việc (mặc định desktop/.rapfi-build – giữ lại để dựng lại nhanh)
#   RAPFI_CMAKE_ARGS="…"                       thêm tuỳ chọn cmake (vd. -DCMAKE_CXX_COMPILER=clang++-15 trên Ubuntu 22.04)
set -euo pipefail
RAPFI_COMMIT=3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7 # cùng commit với bản WASM (caro/rapfi/SOURCE.md)
HERE="$(cd "$(dirname "$0")" && pwd)"
DESK="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DESK/.." && pwd)"
PATCHES="$ROOT/caro/rapfi/build"
WORK="${RAPFI_WORK:-$DESK/.rapfi-build}"
OUT="$DESK/src-tauri/binaries"

TRIPLE="${TARGET_TRIPLE:-$(rustc -vV | sed -n 's/^host: //p')}"
[ -n "$TRIPLE" ] || { echo "✗ Không biết target triple (cài Rust hoặc đặt TARGET_TRIPLE)" >&2; exit 1; }
EXT=""; case "$TRIPLE" in *windows*) EXT=".exe" ;; esac
JOBS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"

# ---------------------------------------------------------------- Mã nguồn đúng commit ghim
rm -rf "$WORK" && mkdir -p "$WORK"
fetch() { # $1 = URL kho git; chỉ lấy đúng một commit
  git init -q "$WORK/src" && git -C "$WORK/src" fetch -q --depth 1 "$1" "$RAPFI_COMMIT" && git -C "$WORK/src" checkout -q FETCH_HEAD
}
if [ "${RAPFI_SOURCE:-clone}" = clone ] && { fetch https://github.com/marseraf7/rapfi.git || { rm -rf "$WORK/src"; fetch https://github.com/dhbloo/rapfi.git; }; }; then
  echo "✓ Mã Rapfi: git $RAPFI_COMMIT"
else
  rm -rf "$WORK/src" && mkdir -p "$WORK/src"
  tar xzf "$PATCHES/rapfi-src-3c94c2a.tar.gz" -C "$WORK/src" --strip-components=1
  echo "✓ Mã Rapfi: gói nguồn kèm repo (rapfi-src-3c94c2a.tar.gz)"
fi

# Bản nguyên bản + rapfi-mt.patch; Rapfi-CARO = bản đó + rapfi-caro.patch (cùng thứ tự với caro/rapfi/build/build.sh)
mkdir -p "$WORK/plain" "$WORK/caro"
cp -r "$WORK/src/Rapfi" "$WORK/plain/Rapfi" && (cd "$WORK/plain" && patch -s -p1 < "$PATCHES/rapfi-mt.patch")
cp -r "$WORK/src/Rapfi" "$WORK/caro/Rapfi" && (cd "$WORK/caro" && patch -s -p1 < "$PATCHES/rapfi-caro.patch" && patch -s -p1 < "$PATCHES/rapfi-mt.patch")

# ---------------------------------------------------------------- Dựng
case "$TRIPLE" in
  x86_64-*) PRESET="${RAPFI_PRESET:-x64-clang-AVX2}" ;;   # AVX2: hầu hết CPU x64 từ 2013 (Haswell / Excavator)
  aarch64-*) PRESET="${RAPFI_PRESET:-arm64-clang-NEON}" ;; # NEON: mọi CPU arm64 (Apple M1+ có cả DOTPROD – chưa bật)
  *) echo "✗ Chưa hỗ trợ triple $TRIPLE" >&2; exit 1 ;;
esac

build() { # $1 = plain | caro, $2 = tên file ra
  local src="$WORK/$1/Rapfi" dir="$WORK/build-$1"
  # shellcheck disable=SC2206 # cố ý tách theo khoảng trắng
  local extra=(${RAPFI_CMAKE_ARGS:-}) # ${extra[@]+…}: bash 3.2 của macOS báo lỗi mảng rỗng khi set -u
  case "$TRIPLE" in
    *windows-msvc)
      # Preset x64-msvc-* đòi generator "Visual Studio 18 2026"; ở đây dùng Ninja + clang-cl với đúng các cờ của preset
      # x64-msvc-AVX2 (không LTO). Nhánh MSVC trong CMakeLists.txt của Rapfi tự thêm /arch:AVX2 và CRT tĩnh (/MT).
      # lld-link: trong Git Bash, "link" là lệnh của coreutils (/usr/bin/link) chứ không phải trình liên kết của MSVC.
      cmake -S "$src" -B "$dir" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-cl -DCMAKE_CXX_COMPILER=clang-cl \
        -DCMAKE_LINKER=lld-link -DUSE_SSE=ON -DUSE_AVX2=ON -DUSE_AVX512=OFF -DUSE_BMI2=OFF -DUSE_VNNI=OFF ${extra[@]+"${extra[@]}"}
      ;;
    *linux*)
      # libstdc++ / libgcc tĩnh: sidecar chạy được trên bản Linux khác máy dựng (còn cần glibc ≥ máy dựng và libatomic)
      (cd "$src" && cmake --preset "$PRESET" -B "$dir" -DCMAKE_EXE_LINKER_FLAGS="-static-libstdc++ -static-libgcc" ${extra[@]+"${extra[@]}"})
      ;;
    *)
      (cd "$src" && cmake --preset "$PRESET" -B "$dir" ${extra[@]+"${extra[@]}"})
      ;;
  esac
  cmake --build "$dir" -j"$JOBS" --target rapfi
  mkdir -p "$OUT"
  cp "$dir/pbrain-rapfi$EXT" "$OUT/$2-$TRIPLE$EXT"
  # Linux: bỏ bảng ký hiệu cho nhẹ (macOS không strip: làm hỏng chữ ký ad-hoc, Apple Silicon sẽ không chạy file)
  case "$TRIPLE" in *linux*) strip "$OUT/$2-$TRIPLE$EXT" ;; esac
}
build plain pbrain-rapfi
build caro pbrain-rapfi-caro

ls -la "$OUT"
"$OUT/pbrain-rapfi-$TRIPLE$EXT" --help > /dev/null 2>&1 || true # chỉ để chắc file chạy được (in trợ giúp rồi thoát)
echo "✓ Sidecar Rapfi ($PRESET, $TRIPLE) trong $OUT"
