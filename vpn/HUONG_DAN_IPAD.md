# Kết nối VPN trên iPad: hướng dẫn từng bước

Các cấu hình lấy từ [igareck/vpn-configs-for-russia](https://github.com/igareck/vpn-configs-for-russia).
Đó là máy chủ **công khai, miễn phí, không rõ ai vận hành**, nên:

- **Không** đăng nhập ngân hàng, email công việc hay tài khoản quan trọng khi đang bật VPN này.
- Máy chủ chết liên tục, thường chỉ sống vài giờ đến vài ngày. Nếu mất kết nối thì cập nhật lại danh sách (bước 5) hoặc chạy lại script.
- Chỉ dùng danh sách **BLACK** (máy chủ ở nước ngoài). Danh sách **WHITE** là máy chủ đặt ở Nga, chỉ có ích với người đang ở Nga.

Bạn có hai cách: **Cách A** làm hoàn toàn trên iPad, **Cách B** lọc trước trên máy tính cho sạch hơn.

---

## Bước 1: Cài app VPN trên iPad

Mở **App Store** và tìm một trong các app miễn phí sau. Hướng dẫn bên dưới dùng **Streisand**. Các app khác có nút tương tự.

| App | Ghi chú |
|---|---|
| **Streisand** | Miễn phí, gọn, hỗ trợ VLESS/Reality, Trojan, SS, Hysteria2 |
| **v2RayTun** | Miễn phí, có nút kiểm tra độ trễ hàng loạt |
| **Hiddify** | Miễn phí, mã nguồn mở |
| Shadowrocket | Trả phí (~2,99 USD), rất ổn định |

> Nếu App Store Việt Nam không có app, thử app khác trong bảng.

---

## Cách A: Thêm link đăng ký trực tiếp (không cần máy tính)

### Bước 2: Copy link đăng ký

Trên iPad, nhấn giữ link dưới đây và chọn **Sao chép liên kết**:

```
https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/BLACK_VLESS_RUS.txt
```

Nếu link trên không tải được, dùng bản dự phòng:

```
https://cdn.jsdelivr.net/gh/igareck/vpn-configs-for-russia@main/BLACK_VLESS_RUS.txt
```

(Muốn thêm Trojan/Shadowsocks/Hysteria2 thì thêm cả link `.../BLACK_SS+All_RUS.txt`.)

### Bước 3: Thêm vào app

1. Mở **Streisand**.
2. Nhấn nút **+** ở góc trên bên phải.
3. Chọn **Thêm từ bộ nhớ tạm** hoặc **Add subscription / Đăng ký**, tùy phiên bản app.
4. Nếu app hỏi tên thì đặt tùy ý, ví dụ `VPN free`, rồi nhấn **Lưu**.

App sẽ tải về khoảng vài chục máy chủ.

### Bước 4: Kiểm tra máy nào còn sống

1. Nhấn nút **đo độ trễ** (biểu tượng tia sét/đồng hồ, hoặc mục **Ping / Test**).
2. Chờ vài giây. Máy chạy được sẽ hiện số **ms** màu xanh. Máy chết hiện **timeout** hoặc màu đỏ.
3. Chọn máy có **ms thấp nhất**, thường là Phần Lan, Hà Lan hoặc Đức.

### Bước 5: Bật VPN

1. Nhấn **công tắc Kết nối** (nút lớn ở trên cùng).
2. Lần đầu, iPad hiện hộp thoại **"Streisand muốn thêm cấu hình VPN"**. Nhấn **Cho phép**, rồi nhập **mật mã iPad** hoặc dùng Face ID/Touch ID.
3. Khi thanh trạng thái (góc trên bên phải) hiện chữ **VPN** là đã kết nối.

### Bước 6: Kiểm tra

Mở Safari và vào **https://ipinfo.io**. Nếu ô *country* là nước ngoài (FI, NL, DE...) thì VPN đã hoạt động.

### Khi máy chủ chết

Vào app, **vuốt xuống** hoặc nhấn **Cập nhật** trên nhóm đăng ký để tải danh sách mới (tác giả cập nhật 2–4 giờ/lần). Sau đó làm lại **Bước 4 và 5**.

---

## Cách B: Lọc trên máy tính rồi chuyển sang iPad

Script `loc_vpn.py` kết nối thật qua từng máy chủ và chỉ giữ những máy **thật sự vào được web**, xếp máy nhanh nhất lên đầu.

### Bước 2: Chạy script trên máy tính Windows

1. Cài **Python** từ https://www.python.org/downloads/ và **nhớ tick "Add python.exe to PATH"**.
2. Bấm đúp **`chay_loc_vpn.bat`** trong thư mục `vpn`.
   - Lần đầu, script tự tải **Xray-core** (khoảng 30 MB) vào thư mục `vpn\xray` để kiểm tra thật.
   - Chờ khoảng 30 giây đến 1 phút.
3. Khi xong, thư mục **`ket_qua_vpn`** tự mở ra:
   - `vpn_con_chay.txt` chứa các cấu hình còn chạy, nhanh nhất ở trên (tối đa 30 cái).
   - `bao_cao.txt` ghi độ trễ và lý do lỗi của từng máy.

> Máy tính và iPad nên dùng **cùng mạng**, vì máy chạy tốt trên mạng này thì khả năng cao cũng chạy trên iPad.

### Bước 3: Chuyển sang iPad

1. Mở `vpn_con_chay.txt` bằng Notepad, nhấn **Ctrl+A** rồi **Ctrl+C**.
2. Gửi đoạn chữ đó sang iPad bằng cách tiện nhất: **Zalo "Cloud của tôi"**, Telegram "Saved Messages", ghi chú iCloud, hoặc email cho chính mình.
3. Trên iPad, mở tin nhắn đó, **nhấn giữ → Chọn tất cả → Sao chép**.

### Bước 4: Nhập vào app

1. Mở **Streisand**, nhấn **+** rồi **Thêm từ bộ nhớ tạm**.
2. App thêm tất cả cấu hình một lần. Máy đầu danh sách là máy nhanh nhất.

Sau đó làm như **Bước 5 và 6 của Cách A**.

---

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Bật VPN nhưng không vào được web | Máy chủ đó đã chết. Chọn máy khác hoặc cập nhật danh sách |
| Tất cả máy đều timeout | Nhà mạng chặn một số giao thức. Thử đổi Wi-Fi ↔ 4G, hoặc thêm link `BLACK_SS+All_RUS.txt` |
| App báo "không nhận link" | Dùng link dự phòng jsDelivr, hoặc dùng file `vpn_con_chay_base64.txt` (Cách B) |
| VPN tự tắt | Trong app, bật **On Demand / Luôn kết nối** nếu có. Vào **Cài đặt → Chung → VPN** kiểm tra |
| Muốn tắt VPN | Tắt công tắc trong app, hoặc **Cài đặt → VPN → tắt** |

## Tùy chọn nâng cao của script

```
python loc_vpn.py --nguon WHITE-CIDR-RU-checked.txt   # chọn danh sách khác trong repo
python loc_vpn.py --nguon https://.../link.txt        # link đăng ký bất kỳ (thường hoặc base64)
python loc_vpn.py --top 10                            # chỉ giữ 10 máy nhanh nhất
python loc_vpn.py --giu-udp                           # giữ cả Hysteria2/TUIC (không kiểm tra được)
python loc_vpn.py --nhanh                             # không dùng Xray, chỉ đo cổng TCP/TLS (kém chính xác)
```
