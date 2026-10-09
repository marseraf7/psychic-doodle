#!/usr/bin/env bash
# Cập nhật máy chủ Cờ Caro lên code mới nhất của nhánh đang dùng.
#   sudo bash /opt/caro/server/deploy/update.sh
# Sao lưu dữ liệu trước khi cập nhật; nếu bản mới không chạy được thì tự quay lại bản cũ.
set -euo pipefail
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Cần chạy bằng sudo."

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"
healthy() {
  for _ in $(seq 1 20); do
    curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

say "Sao lưu dữ liệu"
install -d -o root -g root -m 700 /var/backups/caro
BK="/var/backups/caro/truoc-cap-nhat-$(date +%F-%H%M).db"
sqlite3 /var/lib/caro/caro.db ".backup '$BK'"
chmod 600 "$BK"
echo "$BK"

OLD="$(git rev-parse HEAD)"
say "Tải code mới"
git fetch --quiet origin
git merge --ff-only --quiet '@{u}' || die "Không cập nhật được (nhánh trên máy đã bị sửa tay?). Không thay đổi gì."
NEW="$(git rev-parse HEAD)"
if [ "$OLD" = "$NEW" ]; then echo "Đã là bản mới nhất ($NEW)."; exit 0; fi
git log --oneline "$OLD..$NEW" | head -20

say "Cài thư viện và khởi động lại"
chown -R root:root "$REPO" && chmod -R go-w "$REPO"
(cd server && npm ci --omit=dev --no-audit --no-fund)
systemctl restart caro
if healthy; then
  say "Xong: $(git log -1 --format='%h %s')"
  exit 0
fi

say "Bản mới không chạy được – quay lại bản cũ $OLD"
journalctl -u caro -n 30 --no-pager || true
git reset --quiet --hard "$OLD"
(cd server && npm ci --omit=dev --no-audit --no-fund)
systemctl restart caro
if healthy; then echo "Đã quay lại bản cũ, máy chủ chạy bình thường."; else die "Bản cũ cũng không chạy – xem: journalctl -u caro -n 100"; fi
exit 1
