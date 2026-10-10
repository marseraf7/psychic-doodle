#!/usr/bin/env bash
# Cài máy chủ Cờ Caro lên VPS Ubuntu 22.04 / 24.04 mới, có sẵn các lớp bảo vệ:
#   - Node.js 22, Caddy (HTTPS miễn phí, tự gia hạn), máy chủ chạy bằng user riêng, bị cách ly (systemd)
#   - Tường lửa: chỉ mở SSH, 80, 443 (cổng 8080 của Node chỉ nghe trong máy)
#   - SSH: chỉ đăng nhập bằng khoá, không cho root đăng nhập, fail2ban chặn IP dò mật khẩu
#   - Tự cài bản vá bảo mật Ubuntu, giới hạn dung lượng nhật ký, sao lưu dữ liệu mỗi ngày
#
# Dùng (sau khi đã clone repo vào /opt/caro):
#   sudo bash /opt/caro/server/deploy/install.sh caro.ten-mien.com
# Chạy lại nhiều lần vẫn an toàn (bước nào xong rồi thì bỏ qua / ghi đè đúng cấu hình).
set -euo pipefail

DOMAIN="${1:-}"
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Cần chạy bằng sudo: sudo bash $0 <tên-miền>"
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$ ]] || die "Thiếu hoặc sai tên miền. Ví dụ: sudo bash $0 caro.ten-mien.com"
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = ubuntu ] || warn "Script viết cho Ubuntu; hệ điều hành này là ${PRETTY_NAME:-?} – có thể không chạy đúng."

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ ! -f "$REPO/server/server.js" ] || [ ! -d "$REPO/caro" ]; then
  die "Không thấy mã nguồn ở $REPO (cần chạy script nằm trong repo đã clone)."
fi
case "$REPO" in /home/*|/root/*) die "Hãy clone repo vào /opt/caro (dịch vụ bị chặn đọc /home và /root để an toàn).";; esac
ADMIN_USER="${SUDO_USER:-}"

# ---------------------------------------------------------------- Gói phần mềm
say "Cập nhật hệ thống và cài gói cần thiết"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install git curl ca-certificates gnupg sqlite3 ufw fail2ban python3-systemd unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https

node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; }
if ! node_ok; then
  say "Cài Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get -y -q install nodejs
  node_ok || die "Node.js phải từ 22.13 trở lên (hiện có: $(node -v 2>/dev/null || echo không có))"
fi

if ! command -v caddy >/dev/null; then
  say "Cài Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get -y -q install caddy
fi

# ---------------------------------------------------------------- Bộ nhớ ảo (máy 1 GB RAM)
if ! swapon --show | grep -q . && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ]; then
  say "Thêm 1 GB bộ nhớ ảo (swap)"
  [ -f /swapfile ] || { fallocate -l 1G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------- User, dữ liệu, cấu hình
say "Tạo user 'caro', thư mục dữ liệu và file cấu hình"
id caro >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin caro
install -d -o caro -g caro -m 700 /var/lib/caro
install -d -o root -g root -m 755 /etc/caro
if [ ! -f /etc/caro/caro.env ]; then
  install -o root -g root -m 600 "$REPO/server/deploy/caro.env.example" /etc/caro/caro.env
else
  chown root:root /etc/caro/caro.env && chmod 600 /etc/caro/caro.env
fi
# Địa chỉ công khai cho ảnh xem trước link chia sẻ (thẻ og:image) – không tin tên miền do trình duyệt gửi lên
if grep -q '^PUBLIC_URL=$' /etc/caro/caro.env; then
  sed -i "s#^PUBLIC_URL=\$#PUBLIC_URL=https://$DOMAIN#" /etc/caro/caro.env
elif ! grep -q '^PUBLIC_URL=' /etc/caro/caro.env; then
  echo "PUBLIC_URL=https://$DOMAIN" >> /etc/caro/caro.env
fi
# Mã nguồn thuộc root: dịch vụ chỉ đọc được, không sửa được chính nó
chown -R root:root "$REPO"
chmod -R go-w "$REPO"

say "Cài thư viện của máy chủ (npm ci)"
(cd "$REPO/server" && npm ci --omit=dev --no-audit --no-fund)

# ---------------------------------------------------------------- Dịch vụ systemd
say "Cài dịch vụ caro (systemd, chạy cách ly)"
sed "s#/opt/caro/server#$REPO/server#g" "$REPO/server/deploy/caro.service" > /etc/systemd/system/caro.service
systemctl daemon-reload
systemctl enable caro >/dev/null
systemctl restart caro
ok=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  journalctl -u caro -n 40 --no-pager || true
  die "Máy chủ không chạy được – xem nhật ký phía trên (hoặc: journalctl -u caro -n 100)."
fi
echo "Máy chủ đang chạy (cổng 8080 chỉ trong máy)."

# ---------------------------------------------------------------- HTTPS
say "Cấu hình Caddy cho https://$DOMAIN"
install -d -o caddy -g caddy -m 755 /var/log/caddy
sed "s#caro.ten-mien-cua-ban.com#$DOMAIN#" "$REPO/server/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ---------------------------------------------------------------- Tường lửa
say "Tường lửa: chỉ mở SSH, 80, 443"
SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port / {print $2; exit}')"
SSH_PORT="${SSH_PORT:-22}"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORT/tcp" >/dev/null   # mở SSH trước khi bật để không tự khoá mình ở ngoài
ufw limit "$SSH_PORT/tcp" >/dev/null   # chặn tạm IP mở quá nhiều kết nối SSH liên tiếp
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed -n '1,20p'

# ---------------------------------------------------------------- SSH
say "Siết SSH"
KEYS=""
if [ -n "$ADMIN_USER" ] && [ "$ADMIN_USER" != root ]; then
  KEYS="$(getent passwd "$ADMIN_USER" | cut -d: -f6)/.ssh/authorized_keys"
fi
if [ -n "$KEYS" ] && [ -s "$KEYS" ]; then
  cat > /etc/ssh/sshd_config.d/99-caro-hardening.conf <<'CONF'
# Do caro install.sh tạo: chỉ đăng nhập bằng khoá SSH, không cho root đăng nhập trực tiếp
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
CONF
  if sshd -t; then
    # Ubuntu 24.04 bật SSH theo kiểu socket: dịch vụ đang nghỉ thì lần kết nối sau tự đọc cấu hình mới
    systemctl try-reload-or-restart ssh.service 2>/dev/null || systemctl try-reload-or-restart sshd.service 2>/dev/null || true
    echo "Đã tắt đăng nhập bằng mật khẩu và đăng nhập root (vẫn đăng nhập bằng khoá như bây giờ)."
  else
    rm -f /etc/ssh/sshd_config.d/99-caro-hardening.conf
    warn "Cấu hình SSH không hợp lệ – đã bỏ qua bước này."
  fi
else
  warn "Không thấy khoá SSH của user '${ADMIN_USER:-?}' – GIỮ NGUYÊN cách đăng nhập SSH hiện tại để bạn không bị khoá ở ngoài."
  warn "Nên chuyển sang đăng nhập bằng khoá SSH rồi chạy lại script này."
fi
# fail2ban: chặn 1 giờ IP đăng nhập SSH sai 5 lần trong 10 phút (đọc nhật ký từ journal của systemd)
cat > /etc/fail2ban/jail.d/caro-sshd.local <<CONF
[sshd]
enabled = true
backend = systemd
port = $SSH_PORT
maxretry = 5
findtime = 10m
bantime = 1h
CONF
if systemctl enable fail2ban >/dev/null 2>&1 && systemctl restart fail2ban; then
  echo "fail2ban đang bảo vệ SSH."
else
  warn "fail2ban chưa chạy được (xem: journalctl -u fail2ban -n 50) – các phần khác vẫn đã cài xong."
fi

# ---------------------------------------------------------------- Bản vá bảo mật, nhật ký, sysctl
say "Tự cài bản vá bảo mật, giới hạn nhật ký, tham số mạng an toàn"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
install -d /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/caro.conf <<'CONF'
[Journal]
SystemMaxUse=200M
CONF
systemctl restart systemd-journald
cat > /etc/sysctl.d/99-caro.conf <<'CONF'
# Do caro install.sh tạo
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
CONF
sysctl --system >/dev/null

# ---------------------------------------------------------------- Sao lưu
say "Sao lưu dữ liệu mỗi ngày lúc 3:17 (giữ 14 ngày) vào /var/backups/caro"
install -d -o root -g root -m 700 /var/backups/caro
cat > /etc/cron.d/caro-backup <<'CONF'
# Do caro install.sh tạo: sao lưu CSDL an toàn khi máy chủ đang chạy
17 3 * * * root sqlite3 /var/lib/caro/caro.db ".backup '/var/backups/caro/caro-$(date +\%F).db'" && chmod 600 /var/backups/caro/*.db && find /var/backups/caro -name 'caro-*.db' -mtime +14 -delete
CONF

# ---------------------------------------------------------------- Xong
say "Xong!"
cat <<EOF
  Trang web:        https://$DOMAIN   (lần đầu Caddy cần ~1 phút để lấy chứng chỉ HTTPS)
  Kiểm tra:         curl https://$DOMAIN/healthz   -> ok
  Cấu hình:         sudo nano /etc/caro/caro.env   rồi   sudo systemctl restart caro
                    (đặt ADMIN_USERNAMES = tên đăng nhập bạn vừa đăng ký trong game để duyệt giải / CLB)
  Cập nhật code:    sudo bash $REPO/server/deploy/update.sh
  Nhật ký:          journalctl -u caro -f
  Mức cách ly:      systemd-analyze security caro

  Việc cần làm trên trang Azure (script không làm được):
   - Network security group: chỉ mở 22 (nên giới hạn "Source" = IP của bạn), 80, 443.
   - Tắt Auto-shutdown của máy ảo.
EOF
