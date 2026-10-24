# Hàm dùng chung cho run.sh (máy luyện) và worker.sh (trợ lý sinh ván) – nạp bằng `. lib.sh`, cần sẵn WORK và LOG.
#   - selfplay_batch: tự đấu một lô bằng Rapfi-CARO
#   - repo_*: repo dữ liệu chung (DATA_REPO, vd. https://github.com/marseraf7/caro-nnue-data.git) – nơi các trợ lý đẩy
#     ván tự đấu (data/<tên>/), máy luyện / Kaggle đẩy mạng (best/, cand/). Xác thực theo git của máy (credential helper,
#     token…) – script không đọc, không in token.
# Bố cục repo dữ liệu:
#   data/<tên trợ lý>/<YYYYMM>/sp-<epoch>-<tên>-<n>-<mạng>.binpack.lz4   mỗi file GAMES ván (mặc định 200)
#   best/caro-nnue.bin.lz4, best/best.json                               mạng tốt nhất hiện tại (máy luyện ghi)
#   cand/<nhãn>.bin.lz4, cand/<nhãn>.json                                mạng ứng viên luyện ở Kaggle (chờ đấu chọn)

log() { echo "$(date -u '+%F %T') $*" | tee -a "$LOG"; }
# Ngủ mà vẫn nhận tín hiệu ngay (bash hoãn trap khi đang chạy lệnh ở tiền cảnh)
nap() { sleep "$1" & wait $!; }

# Tự đấu một lô: selfplay_batch <thư mục engine> <file ra .binpack.lz4> <hạt giống> <file log> [file khai cuộc]
# Ghi file tạm rồi đổi tên; trả 0 khi được file hợp lệ. Rapfi nạp mạng hỏng không thoát lỗi mà lặng lẽ chơi bằng bảng
# cổ điển – log có "Failed to load" / "Evaluator … disabled" cũng coi là lỗi.
selfplay_batch() {
  local eng="$1" out="$2" seed="$3" lg="$4" op=""
  [ -n "${5:-}" ] && op="--opening $5"
  # shellcheck disable=SC2086
  if (cd "$eng" && ./pbrain-rapfi selfplay --rule caro -n "${GAMES:-200}" --boardsize 20 $op \
    --budget-unit nodes --budget-distribution fixed --budget-value "${NODES:-20000}" \
    --seed "$seed" -o "$out.tmp" --report-interval 3600000 > "$lg" 2>&1) && [ -s "$out.tmp" ] &&
    ! grep -qE 'Failed to load|Evaluator .* disabled' "$lg"; then
    mv "$out.tmp" "$out"
    return 0
  fi
  rm -f "$out.tmp"
  return 1
}

# Rapfi-CARO ở thư mục này có nạp được mạng NNUE trong config.toml không (phải thấy "weight loaded"). Lưu đầu ra rồi
# mới tìm: grep -q thoát sớm làm Rapfi nhận SIGPIPE, với pipefail cả đường ống bị coi là lỗi.
net_loads() {
  local probe
  probe=$(printf 'START 20\nINFO rule 8\nINFO timeout_turn 100\nBEGIN\nEND\n' | (cd "$1" && timeout 60 ./pbrain-rapfi) 2>&1)
  echo "$probe" | grep -q 'weight loaded'
}

# ---------------------------------------------------------------- repo dữ liệu
# repo_open <thư mục> [đường dẫn thưa…]: clone lần đầu (có đường dẫn: clone thưa, không tải nội dung file ngoài các thư
# mục đó – trợ lý không cần kéo ván của người khác), lần sau chỉ kéo về.
repo_open() {
  local dir="$1"; shift
  if [ ! -d "$dir/.git" ]; then
    if [ $# -gt 0 ]; then
      git clone -q --filter=blob:none --sparse "$DATA_REPO" "$dir" || return 1
      git -C "$dir" sparse-checkout set "$@" || return 1
    else
      git clone -q "$DATA_REPO" "$dir" || return 1
    fi
  fi
  git -C "$dir" config user.name "caro-nnue-${WORKER:-trainer}"
  git -C "$dir" config user.email "caro-nnue-${WORKER:-trainer}@users.noreply.github.com"
  repo_pull "$dir"
}

# Kéo bản mới nhất (gộp lại commit chưa đẩy được của mình lên trên)
repo_pull() {
  git -C "$1" pull -q --rebase --autostash 2> /dev/null || { git -C "$1" rebase --abort 2> /dev/null; return 1; }
}

# repo_push <thư mục> <thông điệp> <đường dẫn…>: commit các file rồi đẩy; bị từ chối (người khác vừa đẩy) thì kéo về,
# thử lại tối đa 6 lần, nghỉ 2, 4, 8… giây. File nằm ngoài vùng clone thưa vẫn thêm được (--sparse), xong thì gỡ khỏi
# thư mục làm việc (sparse-checkout reapply) – trợ lý không giữ lại ván đã đẩy.
repo_push() {
  local dir="$1" msg="$2" i; shift 2
  git -C "$dir" add --sparse -- "$@" || return 1
  git -C "$dir" diff --cached --quiet && return 0
  git -C "$dir" commit -q -m "$msg" || return 1
  for i in 1 2 3 4 5 6; do
    if git -C "$dir" push -q 2> /dev/null; then
      [ -f "$dir/.git/info/sparse-checkout" ] && git -C "$dir" sparse-checkout reapply 2> /dev/null
      return 0
    fi
    nap $((2 ** i)); repo_pull "$dir"
  done
  return 1
}

# Danh sách file dữ liệu (ván tự đấu) mới nhất trước – theo epoch trong tên file (sp-<epoch>-…), không theo giờ sửa
# file (git checkout đặt lại giờ sửa). Cùng tên file ở nhiều thư mục (vd. ván cũ của máy luyện vừa ở data/ vừa đẩy lên
# repo) chỉ tính một lần. data_files <số file tối đa> <thư mục…>
data_files() {
  local n="$1"; shift
  find "$@" -name 'sp-*.binpack.lz4' 2> /dev/null |
    awk '{ f = $0; sub(/.*\//, "", f); if (seen[f]++) next; split(f, a, "-"); print a[2] "\t" $0 }' | sort -rn | head -n "$n" | cut -f2-
}
