#!/usr/bin/env bash
# Sao lưu ngoài máy cho máy chủ Caro: mỗi ngày chụp CSDL + eval-key, kiểm toàn vẹn, MÃ HOÁ bằng age rồi đặt vào một thư
# mục web bí mật để người giữ bản sao (vd. trợ lý Laplace) tự kéo về. Người giữ bản sao KHÔNG đọc được dữ liệu – chỉ chủ
# khoá giải mã (Minh) giải được – nên link có lộ cũng vô hại. Không bao giờ đưa caro.db / eval-key chưa mã hoá lên web:
# CSDL có email, mật khẩu đã băm và phiên đăng nhập đang hoạt động (ai có file là vào được mọi tài khoản).
#
#   sudo bash server/deploy/offsite-backup.sh          cài một lần: tạo khoá (in khoá giải mã MỘT LẦN), cron 3:25 hằng
#                                                      ngày, thêm /offsite/ vào Caddy, chạy bản đầu, in 2 link gửi đi
#   sudo bash server/deploy/offsite-backup.sh run      chạy một lần (cron gọi lệnh này)
#
# Khôi phục (trên máy mới, khoá.txt chứa dòng AGE-SECRET-KEY-…):
#   age -d -i khoá.txt caro.tar.gz.age | tar xz        → caro.db + eval-key, rồi làm theo CHUYEN-MAY-CHU.md mục 3
# Người giữ bản sao kiểm file đủ bằng: sha256sum -c caro.sha256 (máy chủ đã chạy integrity_check trước khi mã hoá).
set -euo pipefail
D=${OFFSITE_DIR:-/root/caro-offsite}                    # secret (tên thư mục web) + recipient (khoá công khai) – chỉ root đọc
DB=${CARO_DB:-/var/lib/caro/caro.db}
KEY=${CARO_KEY:-/var/lib/caro/eval-key}
WEB=${OFFSITE_WEB:-/var/www/offsite}
CADDY=/etc/caddy/Caddyfile
[ "$(id -u)" = 0 ] || { echo "Chạy bằng sudo"; exit 1; }

run() {
  local out t
  out="$WEB/$(cat "$D/secret")"
  t=$(mktemp -d)
  trap 'rm -rf "$t"' RETURN
  install -d -m 755 "$out"
  sqlite3 "$DB" ".backup '$t/caro.db'"
  [ "$(sqlite3 "$t/caro.db" 'PRAGMA integrity_check')" = ok ] || { echo "CSDL lỗi toàn vẹn – không cập nhật bản ngoài máy"; return 1; }
  cp "$KEY" "$t/"
  tar -C "$t" -czf - caro.db eval-key | age -r "$(cat "$D/recipient")" > "$out/caro.tar.gz.age.tmp"
  mv "$out/caro.tar.gz.age.tmp" "$out/caro.tar.gz.age"
  (cd "$out" && sha256sum caro.tar.gz.age > caro.sha256 && date -u +%FT%TZ > updated.txt)
  chmod 644 "$out"/*
}

if [ "${1:-}" = run ]; then run; exit; fi

# ---------------------------------------------------------------- cài một lần
[ -f "$DB" ] && [ -f "$KEY" ] || { echo "Không thấy $DB / $KEY – đây có phải máy chủ game không?"; exit 1; }
command -v age > /dev/null && command -v sqlite3 > /dev/null || apt-get install -y age sqlite3 > /dev/null
install -d -m 700 "$D"
[ -s "$D/secret" ] || openssl rand -hex 16 > "$D/secret"
if [ ! -s "$D/recipient" ]; then
  # Khoá bí mật chỉ in ra màn hình một lần, không ghi xuống đĩa: máy chủ bị chiếm cũng không giải được bản sao cũ
  pair=$(age-keygen 2> /dev/null)
  echo "$pair" | awk '/^# public key/ {print $4}' > "$D/recipient"
  echo
  echo "======== KHOÁ GIẢI MÃ – CHÉP LẠI NGAY, CHỈ BẠN GIỮ (không gửi ai, không dán vào chat) ========"
  echo "$pair" | grep '^AGE-SECRET-KEY'
  echo "==============================================================================================="
  echo
fi
cp "$0" /usr/local/sbin/caro-offsite.sh
chmod 700 /usr/local/sbin/caro-offsite.sh
echo '25 3 * * * root /usr/local/sbin/caro-offsite.sh run' > /etc/cron.d/caro-offsite
run
# Caddy: phục vụ /offsite/<bí mật>/… từ $WEB (handle_path bỏ tiền tố /offsite trước khi tìm file; không liệt kê thư mục)
if ! grep -q 'handle_path /offsite/' "$CADDY"; then
  bak="$CADDY.bak.$(date +%s)"
  cp "$CADDY" "$bak"
  sed -i 's#^\(\s*\)reverse_proxy 127.0.0.1:8080#\1handle_path /offsite/* {\n\1\troot * '"$WEB"'\n\1\tfile_server\n\1}\n&#' "$CADDY"
  if caddy validate --config "$CADDY" --adapter caddyfile > /dev/null 2>&1; then systemctl reload caddy
  else cp "$bak" "$CADDY"; echo "Caddyfile sửa lỗi – đã khôi phục bản cũ"; exit 1; fi
fi
host=$(grep -m1 -oE '^[a-z0-9.-]+\.[a-z]{2,}' "$CADDY")
s=$(cat "$D/secret")
echo "Gửi riêng cho người giữ bản sao 2 link (file đã mã hoá – lộ cũng không đọc được). KHÔNG gửi khoá giải mã:"
echo "  https://$host/offsite/$s/caro.tar.gz.age"
echo "  https://$host/offsite/$s/caro.sha256"
if curl -sfo /dev/null "https://$host/offsite/$s/caro.sha256"; then echo "Kiểm tra link: OK"; else echo "Kiểm tra link: CHƯA TẢI ĐƯỢC"; fi
