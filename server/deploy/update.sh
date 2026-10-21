#!/usr/bin/env bash
# Cập nhật máy chủ Caro x Gomoku lên code mới nhất của nhánh đang dùng.
#   sudo bash /opt/caro/server/deploy/update.sh          – cập nhật ngay (và bật tự cập nhật nếu chưa cài)
#   sudo bash /opt/caro/server/deploy/update.sh --auto   – do bộ hẹn giờ caro-update.timer gọi 10 phút / lần:
#       không có code mới thì thoát lặng lẽ; đang có ván đấu thì hoãn (tối đa 60 phút) để không cắt ngang người chơi.
# Sao lưu dữ liệu trước khi cập nhật; nếu bản mới không chạy được thì tự quay lại bản cũ.
# Tắt tự cập nhật: sudo systemctl disable --now caro-update.timer   (chạy tay lần sau không bật lại)
set -euo pipefail
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

# Cả script nằm trong main: bash đọc hết trước khi chạy, git thay file này giữa chừng cũng không sao
main() {
  [ "$(id -u)" -eq 0 ] || die "Cần chạy bằng sudo."
  local AUTO=0
  [ "${1:-}" = --auto ] && AUTO=1
  local REPO
  REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$REPO"
  local PENDING=/var/lib/caro-update/pending # lúc thấy code mới mà phải hoãn vì đang có ván (giây)

  [ "$AUTO" = 1 ] || install_timer "$REPO"

  git fetch --quiet origin
  local OLD TARGET
  OLD="$(git rev-parse HEAD)"
  TARGET="$(git rev-parse '@{u}')"
  if [ "$OLD" = "$TARGET" ]; then
    rm -f "$PENDING"
    [ "$AUTO" = 1 ] || echo "Đã là bản mới nhất ($OLD)."
    return 0
  fi
  git merge-base --is-ancestor "$OLD" "$TARGET" || die "Không cập nhật được (nhánh trên máy đã bị sửa tay?). Không thay đổi gì."

  if [ "$AUTO" = 1 ]; then
    # Đang có ván: khởi động lại sẽ làm người chơi mất kết nối giữa ván – hoãn, chờ lần hẹn sau
    local games now first
    games="$(curl -fsS --max-time 5 http://127.0.0.1:8080/api/stats 2>/dev/null | sed -n 's/.*"games":\([0-9]*\).*/\1/p')"
    now="$(date +%s)"
    if [ "${games:-0}" -gt 0 ]; then
      install -d -m 700 "$(dirname "$PENDING")"
      [ -s "$PENDING" ] || echo "$now" > "$PENDING"
      first="$(cat "$PENDING")"
      if [ $((now - first)) -lt 3600 ]; then
        echo "Có code mới nhưng đang có $games ván – hoãn cập nhật."
        return 0
      fi
      echo "Đã hoãn 60 phút mà vẫn còn $games ván – cập nhật luôn."
    fi
  fi

  say "Sao lưu dữ liệu"
  install -d -o root -g root -m 700 /var/backups/caro
  local BK
  BK="/var/backups/caro/truoc-cap-nhat-$(date +%F-%H%M).db"
  sqlite3 /var/lib/caro/caro.db ".backup '$BK'"
  chmod 600 "$BK"
  find /var/backups/caro -name 'truoc-cap-nhat-*.db' -mtime +14 -delete
  echo "$BK"

  say "Tải code mới"
  git merge --ff-only --quiet "$TARGET"
  rm -f "$PENDING"
  git log --oneline "$OLD..$TARGET" | head -20

  say "Cài thư viện và khởi động lại"
  chown -R root:root "$REPO" && chmod -R go-w "$REPO"
  (cd server && npm ci --omit=dev --no-audit --no-fund)
  systemctl restart caro
  if healthy; then
    say "Xong: $(git log -1 --format='%h %s')"
    return 0
  fi

  say "Bản mới không chạy được – quay lại bản cũ $OLD"
  journalctl -u caro -n 30 --no-pager || true
  git reset --quiet --hard "$OLD"
  (cd server && npm ci --omit=dev --no-audit --no-fund)
  systemctl restart caro
  if healthy; then echo "Đã quay lại bản cũ, máy chủ chạy bình thường."; else die "Bản cũ cũng không chạy – xem: journalctl -u caro -n 100"; fi
  return 1
}

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Tự cập nhật (caro-update.timer): cài một lần; đã có file (kể cả khi người quản trị đã tắt) thì giữ nguyên
install_timer() {
  local REPO="$1"
  [ -f /etc/systemd/system/caro-update.timer ] && return 0
  sed "s#/opt/caro/server#$REPO/server#g" "$REPO/server/deploy/caro-update.service" > /etc/systemd/system/caro-update.service
  cp "$REPO/server/deploy/caro-update.timer" /etc/systemd/system/caro-update.timer
  systemctl daemon-reload
  systemctl enable --now caro-update.timer >/dev/null
  say "Đã bật tự cập nhật: 10 phút kiểm một lần (xem: systemctl list-timers caro-update)"
}

main "$@"
exit $?
