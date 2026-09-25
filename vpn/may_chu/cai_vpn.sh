#!/usr/bin/env bash
# Cài VPN WireGuard riêng lên máy chủ Ubuntu/Debian chỉ bằng 1 lệnh.
#
#   bash cai_vpn.sh              cài đặt (lần đầu) + tạo thiết bị "laptop"
#   bash cai_vpn.sh them TEN     thêm thiết bị (ipad, dienthoai...) -> in mã QR + file .conf
#   bash cai_vpn.sh xoa TEN      xóa thiết bị (thu hồi quyền kết nối)
#   bash cai_vpn.sh ds           danh sách thiết bị + lần kết nối gần nhất
#   bash cai_vpn.sh qr TEN       in lại mã QR / cấu hình của thiết bị
#   bash cai_vpn.sh go           gỡ VPN khỏi máy chủ
#
# Biến môi trường tùy chọn: VPN_PORT (mặc định 51820), VPN_DNS, VPN_HOST (IP/tên miền
# công khai nếu dò tự động sai).
set -euo pipefail

WG_DIR=/etc/wireguard
CONF=$WG_DIR/wg0.conf
KHACH_DIR=/root/vpn-thiet-bi
SYSCTL=/etc/sysctl.d/99-vpn-rieng.conf
MANG=10.8.0                        # dải IP nội bộ của VPN: 10.8.0.1 = máy chủ
PORT=${VPN_PORT:-51820}
DNS=${VPN_DNS:-1.1.1.1, 8.8.8.8}

xanh() { printf '\033[1;32m%s\033[0m\n' "$*"; }
vang() { printf '\033[1;33m%s\033[0m\n' "$*"; }
loi()  { printf '\033[1;31m[LỖI] %s\033[0m\n' "$*" >&2; exit 1; }

kiem_tra_root() {
  [ "$(id -u)" -eq 0 ] || loi "Cần chạy bằng root: sudo bash $0 $*"
}

kiem_tra_he_dieu_hanh() {
  . /etc/os-release
  case " ${ID:-} ${ID_LIKE:-} " in
    *" ubuntu "*|*" debian "*) ;;
    *) loi "Script chỉ hỗ trợ Ubuntu/Debian (máy này: ${PRETTY_NAME:-không rõ})." ;;
  esac
}

ip_cong_khai() {
  if [ -n "${VPN_HOST:-}" ]; then echo "$VPN_HOST"; return; fi
  local ip u
  for u in https://api.ipify.org https://ifconfig.me https://icanhazip.com; do
    ip=$(curl -4 -fsS --max-time 8 "$u" 2>/dev/null | tr -d '[:space:]') || true
    if [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "$ip"; return; fi
  done
  loi "Không dò được IP công khai. Chạy lại với: VPN_HOST=IP_MAY_CHU bash $0"
}

card_mang() {
  ip -4 route show default | awk '{for (i = 1; i < NF; i++) if ($i == "dev") {print $(i + 1); exit}}'
}

dong_bo() {  # nạp lại danh sách thiết bị mà không ngắt kết nối đang có
  wg syncconf wg0 <(wg-quick strip wg0)
}

cai_dat() {
  if [ -f "$CONF" ]; then
    vang "VPN đã được cài rồi. Các thiết bị hiện có:"
    danh_sach
    echo
    echo "Thêm thiết bị: bash $0 them TEN   (xem: bash $0 help)"
    return
  fi
  kiem_tra_he_dieu_hanh

  xanh "[1/5] Cài WireGuard..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq wireguard-tools qrencode iptables iproute2 curl >/dev/null

  xanh "[2/5] Dò thông tin mạng..."
  local host nic
  host=$(ip_cong_khai)
  nic=$(card_mang)
  [ -n "$nic" ] || loi "Không tìm thấy card mạng ra Internet."
  echo "      IP công khai: $host   card mạng: $nic   cổng UDP: $PORT"

  xanh "[3/5] Bật chuyển tiếp gói tin..."
  printf 'net.ipv4.ip_forward = 1\n' > "$SYSCTL"
  sysctl -q -p "$SYSCTL"

  xanh "[4/5] Tạo khóa và cấu hình máy chủ..."
  mkdir -p "$WG_DIR" "$KHACH_DIR"
  chmod 700 "$WG_DIR" "$KHACH_DIR"
  local khoa_bi_mat
  khoa_bi_mat=$(wg genkey)
  # PostUp mở cổng + NAT; chèn lên ĐẦU chuỗi (-I) để thắng luật chặn sẵn có
  # (Oracle Cloud, ufw...). PostDown xóa đúng các luật đó khi tắt VPN.
  (umask 077; cat > "$CONF" <<EOF
# VPN_HOST=$host
# VPN_PORT=$PORT
[Interface]
Address = $MANG.1/24
ListenPort = $PORT
PrivateKey = $khoa_bi_mat
PostUp = iptables -I INPUT -p udp --dport $PORT -j ACCEPT; iptables -I FORWARD -i %i -j ACCEPT; iptables -I FORWARD -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s $MANG.0/24 -o $nic -j MASQUERADE
PostDown = iptables -D INPUT -p udp --dport $PORT -j ACCEPT; iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s $MANG.0/24 -o $nic -j MASQUERADE
EOF
  )
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$PORT"/udp >/dev/null
  fi

  xanh "[5/5] Khởi động VPN..."
  systemctl enable --now wg-quick@wg0 >/dev/null 2>&1 \
    || loi "Không khởi động được WireGuard. Xem: journalctl -u wg-quick@wg0"

  them_thiet_bi laptop
  echo
  xanh "=== CÀI XONG! ==="
  vang "Nhớ mở cổng UDP $PORT trong tường lửa của nhà cung cấp VPS nếu có"
  vang "(Oracle Cloud: Security List; AWS/Lightsail: Networking; Vultr/DO: Firewall)."
  echo "Thêm thiết bị khác: bash $0 them ipad"
}

gia_tri() {  # đọc "# KHOA=giatri" đã lưu ở đầu wg0.conf
  sed -n "s/^# $1=//p" "$CONF" | head -n1
}

ip_trong() {
  local i
  for i in $(seq 2 254); do
    grep -q "AllowedIPs = $MANG.$i/32" "$CONF" || { echo "$MANG.$i"; return; }
  done
  loi "Hết IP trống (tối đa 253 thiết bị)."
}

kiem_tra_ten() {
  [[ ${1:-} =~ ^[A-Za-z0-9_-]{1,32}$ ]] \
    || loi "Tên thiết bị chỉ gồm chữ không dấu, số, - và _ (ví dụ: laptop, ipad)."
}

them_thiet_bi() {
  local ten=${1:-}
  kiem_tra_ten "$ten"
  [ -f "$CONF" ] || loi "Chưa cài VPN. Chạy: bash $0"
  grep -q "^### BAT DAU $ten\$" "$CONF" && loi "Đã có thiết bị '$ten'. Xem lại: bash $0 qr $ten"

  local ip khoa pub psk pub_may_chu
  ip=$(ip_trong)
  khoa=$(wg genkey)
  pub=$(wg pubkey <<<"$khoa")
  psk=$(wg genpsk)
  pub_may_chu=$(sed -n 's/^PrivateKey = //p' "$CONF" | wg pubkey)

  cat >> "$CONF" <<EOF

### BAT DAU $ten
[Peer]
PublicKey = $pub
PresharedKey = $psk
AllowedIPs = $ip/32
### KET THUC $ten
EOF
  (umask 077; cat > "$KHACH_DIR/$ten.conf" <<EOF
[Interface]
PrivateKey = $khoa
Address = $ip/32
DNS = $DNS

[Peer]
PublicKey = $pub_may_chu
PresharedKey = $psk
Endpoint = $(gia_tri VPN_HOST):$(gia_tri VPN_PORT)
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
  )
  dong_bo
  xanh "Đã thêm thiết bị '$ten' ($ip)."
  hien_thi "$ten"
}

hien_thi() {
  local ten=${1:-}
  kiem_tra_ten "$ten"
  local f=$KHACH_DIR/$ten.conf
  [ -f "$f" ] || loi "Không có thiết bị '$ten'. Xem danh sách: bash $0 ds"
  qrencode -o "$KHACH_DIR/$ten.png" -r "$f"
  echo
  echo "----- Mã QR cho '$ten' (quét bằng app WireGuard trên iPad/điện thoại) -----"
  qrencode -t ansiutf8 -r "$f"
  echo "----- Nội dung file $ten.conf (copy dán vào WireGuard trên Windows) -----"
  cat "$f"
  echo "-----------------------------------------------------------------------"
  echo "File đã lưu: $f"
  echo "Tải về Windows (gõ trong PowerShell trên LAPTOP, không phải ở đây):"
  echo "  scp root@$(gia_tri VPN_HOST):$f \$HOME\\Downloads\\"
}

xoa_thiet_bi() {
  local ten=${1:-}
  kiem_tra_ten "$ten"
  grep -q "^### BAT DAU $ten\$" "$CONF" || loi "Không có thiết bị '$ten'."
  local tam
  tam=$(mktemp)
  # bỏ khối BAT DAU..KET THUC và dòng trống ngay trước nó
  awk -v b="### BAT DAU $ten" -v e="### KET THUC $ten" '
    $0 == b {bo = 1; trong = ""; next}
    bo && $0 == e {bo = 0; next}
    bo {next}
    /^$/ {trong = trong "\n"; next}
    {printf "%s", trong; trong = ""; print}
  ' "$CONF" > "$tam"
  cat "$tam" > "$CONF"
  rm -f "$tam" "$KHACH_DIR/$ten.conf" "$KHACH_DIR/$ten.png"
  dong_bo
  xanh "Đã xóa thiết bị '$ten' - thiết bị đó không kết nối được nữa."
}

danh_sach() {
  [ -f "$CONF" ] || loi "Chưa cài VPN. Chạy: bash $0"
  local ten pub ip lan bat
  echo "THIẾT BỊ         IP VPN       KẾT NỐI GẦN NHẤT"  # printf đếm byte -> lệch cột chữ có dấu
  while read -r ten; do
    pub=$(sed -n "/^### BAT DAU $ten\$/,/^### KET THUC $ten\$/s/^PublicKey = //p" "$CONF")
    ip=$(sed -n "/^### BAT DAU $ten\$/,/^### KET THUC $ten\$/s/^AllowedIPs = \(.*\)\/32/\1/p" "$CONF")
    lan=$(wg show wg0 latest-handshakes 2>/dev/null | awk -v p="$pub" '$1 == p {print $2}')
    if [ -n "$lan" ] && [ "$lan" != 0 ]; then
      bat="$(( ($(date +%s) - lan) / 60 )) phút trước"
    else
      bat="chưa kết nối"
    fi
    printf '%-16s %-12s %s\n' "$ten" "$ip" "$bat"
  done < <(sed -n 's/^### BAT DAU //p' "$CONF")
}

go_cai_dat() {
  read -r -p "Gỡ VPN và xóa TẤT CẢ thiết bị? Gõ 'co' để xác nhận: " xn
  [ "$xn" = "co" ] || { echo "Đã hủy."; return; }
  systemctl disable --now wg-quick@wg0 >/dev/null 2>&1 || true
  rm -f "$CONF" "$SYSCTL"
  rm -rf "$KHACH_DIR"
  xanh "Đã gỡ VPN."
}

kiem_tra_root "$@"
case "${1:-cai}" in
  cai)            cai_dat ;;
  them|add)       them_thiet_bi "${2:-}" ;;
  xoa|remove)     xoa_thiet_bi "${2:-}" ;;
  ds|list)        danh_sach ;;
  qr|show)        hien_thi "${2:-}" ;;
  go|uninstall)   go_cai_dat ;;
  *)              sed -n '2,12s/^# \{0,1\}//p' "$0" ;;
esac
