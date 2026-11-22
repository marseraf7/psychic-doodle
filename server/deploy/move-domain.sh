#!/usr/bin/env bash
# Chuyển máy chủ đang chạy sang tên miền mới, GIỮ tên cũ để chuyển dữ liệu người chơi + chuyển hướng 301 (docs/doi-ten-mien.md):
#   sudo bash /opt/caro/server/deploy/move-domain.sh <tên-mới> <tên-cũ> [tên-cũ-2 …]
#   ví dụ: sudo bash /opt/caro/server/deploy/move-domain.sh caro.example.com ten-cu.duckdns.org caroxo.ddnsgeek.com
# Làm: /etc/caro/caro.env đặt PUBLIC_URL = MOVED_TO = https://<tên-mới>, MOVED_FROM = các tên cũ; /etc/caddy/Caddyfile dựng lại
# từ mẫu với "tên-mới, tên-cũ… {" (Caddy tự xin chứng chỉ cho cả hai); kiểm cấu hình, nạp lại Caddy, khởi động lại máy chủ.
# Trước khi chạy: bản ghi DNS của tên mới đã trỏ về máy này (A / AAAA). Chạy lại nhiều lần vẫn an toàn.
set -euo pipefail
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Cần chạy bằng sudo"
[ "$#" -ge 2 ] || die "Dùng: sudo bash $0 <tên-mới> <tên-cũ> [tên-cũ-2 …]"
RE='^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$'
for d in "$@"; do [[ "$d" =~ $RE ]] || die "Tên miền sai: $d"; done
NEW="$1"; shift
OLD="$(IFS=,; echo "$*")"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV=/etc/caro/caro.env
[ -f "$ENV" ] || die "Không thấy $ENV (máy chủ cài bằng install.sh?)"

# Đặt KEY=giá-trị trong caro.env (có rồi thì thay, chưa có thì thêm)
set_env() {
  if grep -q "^$1=" "$ENV"; then sed -i "s#^$1=.*#$1=$2#" "$ENV"; else echo "$1=$2" >> "$ENV"; fi
}
say "Biến môi trường ($ENV)"
cp -a "$ENV" "$ENV.bak-$(date +%Y%m%d-%H%M%S)"
set_env PUBLIC_URL "https://$NEW"
set_env MOVED_TO "https://$NEW"
set_env MOVED_FROM "$OLD"
grep -E '^(PUBLIC_URL|MOVED_TO|MOVED_FROM)=' "$ENV"

say "Caddy: https://$NEW + tên cũ ($OLD)"
SITES="$NEW, ${OLD//,/, }"
cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
sed "s#caro.ten-mien-cua-ban.com#$SITES#" "$REPO/server/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
chown -R caddy:caddy /var/log/caddy 2>/dev/null || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "Khởi động lại máy chủ"
systemctl restart caro
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8080/healthz >/dev/null || die "Máy chủ không lên – journalctl -u caro -n 100"
cat <<EOF

Xong. Kiểm tra (đợi ~1 phút để Caddy lấy chứng chỉ cho tên mới):
  curl -sI https://$NEW/ | head -1                    -> HTTP/2 200
  curl -sI https://${OLD%%,*}/robots.txt | grep -i location -> https://$NEW/robots.txt (301)
Mở https://${OLD%%,*}/ trên trình duyệt đã từng chơi: tự sang https://$NEW/, còn đăng nhập + tiến độ.
EOF
