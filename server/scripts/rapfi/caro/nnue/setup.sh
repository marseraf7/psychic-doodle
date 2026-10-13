#!/usr/bin/env bash
# Cài đặt một lần trên máy luyện (VPS Linux x86-64, Ubuntu / Debian) để luyện mạng NNUE luật Việt Nam cho Rapfi-CARO.
#   bash server/scripts/rapfi/caro/nnue/setup.sh
# Chạy trong bản clone của repo này, bằng tài khoản thường có sudo (chỉ để cài gói hệ thống). Mọi thứ khác nằm trong
# WORK (mặc định ~/caro-nnue): bin/ (Rapfi-CARO bản gốc + bảng cổ điển), trainer/ + venv/ (bộ huấn luyện), engines/
# (thư mục chạy: classic, best), data/, runs/, nets/, logs/. Chạy lại an toàn (bỏ qua bước đã xong).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
WORK="${WORK:-$HOME/caro-nnue}"
TRAINER_COMMIT=ed6ff57cbd9d31bc5217ecbdf0de2a004c6be374
mkdir -p "$WORK"/{bin,data,runs,nets,logs,engines}
say() { printf '\n=== %s\n' "$*"; }
SUDO=$([ "$(id -u)" = 0 ] && echo "" || echo sudo)

say "1/5 Gói hệ thống"
if command -v apt-get > /dev/null; then
  $SUDO apt-get update -y
  $SUDO apt-get install -y git curl build-essential clang cmake ninja-build python3-venv python3-dev patch tmux
fi
if ! command -v node > /dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi

say "2/5 Dựng Rapfi-CARO bản gốc (gói nguồn Rapfi kèm repo + bản vá luật Việt Nam)"
if [ ! -x "$WORK/bin/pbrain-rapfi" ]; then
  SRC="$(mktemp -d)"
  tar xzf "$ROOT/caro/rapfi/build/rapfi-src-3c94c2a.tar.gz" -C "$SRC" --strip-components=1
  (cd "$SRC" && patch -s -p1 < "$ROOT/caro/rapfi/build/rapfi-caro.patch")
  # Native: tối ưu cho đúng CPU của máy này (AVX2 / AVX512 nếu có)
  (cd "$SRC/Rapfi" && CC=clang CXX=clang++ cmake --preset x64-clang-Native > "$WORK/logs/build-rapfi.log" 2>&1 &&
    cmake --build build/x64-clang-Native -j"$(nproc)" >> "$WORK/logs/build-rapfi.log" 2>&1) ||
    { echo "Dựng Rapfi lỗi – xem $WORK/logs/build-rapfi.log"; exit 1; }
  cp "$SRC/Rapfi/build/x64-clang-Native/pbrain-rapfi" "$WORK/bin/"
  rm -rf "$SRC"
fi
cp "$ROOT/caro/rapfi/model210901.bin" "$ROOT/caro/rapfi/model-caro.bin" "$WORK/bin/"

say "3/5 Thư mục chạy: classic (bảng cổ điển – điểm xuất phát) và best (mạng tốt nhất hiện tại)"
for e in classic best; do
  if [ ! -f "$WORK/engines/$e/config.toml" ]; then
    mkdir -p "$WORK/engines/$e"
    ln -sf "$WORK/bin/pbrain-rapfi" "$WORK/bin/model210901.bin" "$WORK/bin/model-caro.bin" "$WORK/engines/$e/"
    node "$HERE/make-config.js" "$WORK/engines/$e"
  fi
done
node "$HERE/make-openings.js" "$WORK/openings.txt"

say "4/5 Bộ huấn luyện pytorch-nnue-trainer (của tác giả Rapfi, ghim commit) + luật caro"
if [ ! -d "$WORK/trainer/.git" ]; then
  git clone https://github.com/dhbloo/pytorch-nnue-trainer "$WORK/trainer"
fi
git -C "$WORK/trainer" checkout -q "$TRAINER_COMMIT"
python3 "$HERE/trainer-add-caro.py" "$WORK/trainer"

say "5/5 Python: PyTorch (GPU NVIDIA nếu có, không thì CPU) + phụ thuộc của bộ huấn luyện"
[ -d "$WORK/venv" ] || python3 -m venv "$WORK/venv"
# shellcheck disable=SC1091
. "$WORK/venv/bin/activate"
pip install -q --upgrade pip
if command -v nvidia-smi > /dev/null && nvidia-smi > /dev/null 2>&1; then
  pip install -q torch
else
  pip install -q torch --index-url https://download.pytorch.org/whl/cpu
fi
pip install -q "$WORK/trainer"
python -c "import torch; print('PyTorch', torch.__version__, '· GPU:', torch.cuda.is_available())"

# Kiểm nhanh: Rapfi-CARO chạy được
printf 'START 20\nINFO rule 8\nINFO timeout_turn 300\nBEGIN\nEND\n' | (cd "$WORK/engines/classic" && timeout 30 ./pbrain-rapfi) | grep -E '^[0-9]+,[0-9]+$' > /dev/null &&
  echo "Rapfi-CARO OK" || { echo "Rapfi-CARO không chạy được"; exit 1; }

say "Xong. Bắt đầu luyện:  tmux new -s caro 'bash $HERE/run.sh'   (thoát tmux: Ctrl-b d; xem lại: tmux attach -t caro)"
