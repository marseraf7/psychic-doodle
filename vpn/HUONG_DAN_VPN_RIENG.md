# Tự tạo VPN riêng cho laptop Windows (và iPad)

Bạn thuê một máy chủ nhỏ ở nước ngoài (VPS), chạy **một lệnh** để cài VPN **WireGuard**, rồi cho laptop kết nối vào máy chủ đó.
VPN này chỉ mình bạn dùng: nhanh, ổn định và không bị người lạ đọc dữ liệu như VPN miễn phí công khai.

**Chi phí:** khoảng 5 USD/tháng (~130.000đ). **Thời gian:** khoảng 15 phút.

---

## Bước 1: Thuê máy chủ (VPS)

Dưới đây là ví dụ với **Vultr** (https://www.vultr.com). DigitalOcean và Hetzner làm tương tự.

1. Đăng ký tài khoản và nạp tiền bằng thẻ Visa/Mastercard hoặc PayPal.
2. Nhấn **Deploy +** rồi chọn **Deploy New Server**.
3. Chọn các mục sau:
   - **Type:** Shared CPU / Cloud Compute
   - **Location:** **Singapore** hoặc **Tokyo** (gần Việt Nam nên ping thấp)
   - **Image / OS:** **Ubuntu 24.04 LTS x64**
   - **Plan:** gói rẻ nhất, 1 CPU / 1 GB RAM, khoảng 5–6 USD/tháng
   - Tắt **Auto Backups** cho rẻ
4. Nhấn **Deploy Now** và chờ khoảng 1 phút đến khi trạng thái là **Running**.
5. Bấm vào máy chủ, tại mục **Overview**, ghi lại:
   - **IP Address**, ví dụ `45.77.12.34`
   - **Password** (nhấn biểu tượng con mắt để xem)

> ⚠️ Muốn thôi không dùng nữa thì phải **Destroy** (xóa) máy chủ. Chỉ **Stop** thì vẫn bị tính tiền.

---

## Bước 2: Đăng nhập vào máy chủ từ laptop

1. Trên laptop, nhấn **Windows + X** rồi chọn **Terminal** (hoặc **Windows PowerShell**).
2. Gõ lệnh sau, thay `45.77.12.34` bằng IP của bạn, rồi nhấn Enter:
   ```
   ssh root@45.77.12.34
   ```
3. Nếu máy hỏi `Are you sure you want to continue connecting?`, gõ **`yes`** rồi nhấn Enter.
4. Máy hỏi `password:`. Dán mật khẩu ở Bước 1 bằng cách **nhấn chuột phải** (mật khẩu **không hiện** khi gõ, đó là bình thường), rồi nhấn Enter.
5. Khi thấy dòng kiểu `root@vultr:~#` là bạn đã vào được máy chủ.

---

## Bước 3: Cài VPN bằng một lệnh

Copy **cả dòng** dưới đây, dán vào cửa sổ Terminal (chuột phải) và nhấn Enter:

```
curl -fsSL https://raw.githubusercontent.com/marseraf7/psychic-doodle/claude/vpn-configs-russia-q6j9fs/vpn/may_chu/cai_vpn.sh -o cai_vpn.sh && bash cai_vpn.sh
```

Chờ khoảng 1 phút. Script tự làm hết: cài WireGuard, tạo khóa, mở tường lửa và tạo sẵn thiết bị **laptop**.
Khi xong, màn hình hiện:

- một **mã QR** lớn (dùng cho iPad ở Bước 7),
- **nội dung file `laptop.conf`** (dùng cho laptop ở Bước 4),
- dòng chữ xanh **=== CÀI XONG! ===**.

> **Chỉ khi dùng Oracle Cloud, AWS Lightsail hoặc đã tự bật Firewall trên Vultr/DigitalOcean:** vào trang quản lý máy chủ, mở cổng **UDP 51820** (Inbound / Ingress).
> Vultr và DigitalOcean mặc định không chặn nên không cần làm bước này.

---

## Bước 4: Lấy file cấu hình về laptop

**Cách 1 (khuyên dùng):** mở **thêm một cửa sổ Terminal mới** trên laptop (đừng dùng cửa sổ đang đăng nhập máy chủ) và gõ:

```
scp root@45.77.12.34:/root/vpn-thiet-bi/laptop.conf $HOME\Downloads\
```

Nhập lại mật khẩu máy chủ. File **`laptop.conf`** sẽ nằm trong thư mục **Downloads**.

**Cách 2 (nếu cách 1 lỗi):** trong cửa sổ máy chủ, bôi đen phần nội dung từ `[Interface]` đến `PersistentKeepalive = 25` rồi nhấn **Ctrl+C**.
Mở **Notepad** trên laptop, dán vào, chọn **File → Save As**. Ở ô **Save as type** chọn **All files (\*.\*)**, đặt tên **`laptop.conf`** rồi lưu.

---

## Bước 5: Cài WireGuard trên Windows và kết nối

1. Tải **WireGuard for Windows** tại https://www.wireguard.com/install/ và cài như phần mềm bình thường.
2. Mở WireGuard, nhấn **Import tunnel(s) from file** (Nhập đường hầm từ tệp) rồi chọn file **`laptop.conf`**.
3. Nhấn **Activate** (Kích hoạt). Trạng thái chuyển sang **Active** màu xanh.
4. Muốn tắt thì nhấn **Deactivate**.

---

## Bước 6: Kiểm tra

Mở trình duyệt và vào **https://ipinfo.io**:
- nếu **ip** trùng IP máy chủ và **country** là **SG** (hoặc JP...), VPN đã hoạt động ✅
- trong WireGuard, dòng **Latest handshake** hiện "vài giây trước" nghĩa là đã kết nối được máy chủ.

---

## Bước 7 (tùy chọn): Thêm iPad / điện thoại

Mỗi thiết bị nên có **cấu hình riêng**. Không dùng chung một file cho hai máy cùng lúc, vì chúng sẽ đá nhau ra.

1. Đăng nhập lại máy chủ (Bước 2) và gõ:
   ```
   bash cai_vpn.sh them ipad
   ```
2. Trên iPad, tải app **WireGuard** từ App Store (miễn phí).
3. Mở app, nhấn **+** → **Tạo từ mã QR** (Create from QR code), rồi quét mã QR đang hiện trên màn hình laptop.
4. Đặt tên (ví dụ `VPN rieng`), nhấn **Cho phép** khi iPad hỏi thêm cấu hình VPN, rồi bật công tắc.

---

## Quản lý VPN (gõ trên máy chủ)

| Lệnh | Tác dụng |
|---|---|
| `bash cai_vpn.sh ds` | Xem danh sách thiết bị và lần kết nối gần nhất |
| `bash cai_vpn.sh them dienthoai` | Thêm thiết bị mới |
| `bash cai_vpn.sh qr ipad` | Hiện lại mã QR / cấu hình của một thiết bị |
| `bash cai_vpn.sh xoa ipad` | Xóa thiết bị (ví dụ khi mất máy) |
| `bash cai_vpn.sh go` | Gỡ VPN khỏi máy chủ |
| `apt update && apt upgrade -y` | Cập nhật bảo mật cho máy chủ (vài tháng một lần) |

---

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `ssh` báo *Connection timed out* | Sai IP, hoặc máy chủ chưa chạy xong. Chờ 1–2 phút rồi thử lại |
| `Permission denied` khi nhập mật khẩu | Dán lại bằng chuột phải và cẩn thận không thừa dấu cách. Có thể đặt lại mật khẩu trên trang Vultr |
| WireGuard **Active** nhưng không vào được web, không có *Latest handshake* | Cổng UDP 51820 bị chặn. Mở cổng trong Firewall của nhà cung cấp (Bước 3) |
| Mạng công ty/trường chặn WireGuard | Cài lại với cổng 443: `bash cai_vpn.sh go`, rồi `VPN_PORT=443 bash cai_vpn.sh`, và nhập lại file `.conf` mới |
| Script báo không dò được IP | Chạy: `VPN_HOST=45.77.12.34 bash cai_vpn.sh` (thay bằng IP của bạn) |
| Vào web chậm | Tạo máy chủ ở vị trí gần hơn (Singapore) và xóa máy chủ cũ |

## Bảo mật

- **Không gửi** file `.conf` hay mã QR cho người khác, vì ai có file đó đều dùng được VPN của bạn.
- Nên đổi mật khẩu root: sau khi đăng nhập máy chủ, gõ `passwd` rồi nhập mật khẩu mới hai lần.
- WireGuard không lưu nhật ký truy cập web. Nhà cung cấp VPS chỉ thấy lượng dữ liệu ra vào máy chủ.
