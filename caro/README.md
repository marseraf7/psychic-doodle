# Cờ Caro

Game cờ caro chạy trên web, chơi mượt trên cả điện thoại lẫn máy tính.

- **Bàn cờ vô hạn**: kéo để di chuyển, chụm 2 ngón / cuộn chuột để phóng to thu nhỏ.
- **Luật chặn 2 đầu** (phổ biến ở Việt Nam):
  - 4 quân liền, không bị chặn đầu nào → thắng.
  - 5 quân liền, bị chặn 1 đầu → thắng.
  - Bị chặn cả 2 đầu → không tính thắng.
- Chơi **2 người cùng máy** hoặc **với máy** (Dễ / Vừa / Khó).
- Đi lại, lưu ván đang chơi, tỉ số, chế độ sáng/tối theo máy.
- Chế độ "chạm 2 lần để đánh" (bật sẵn trên điện thoại) để tránh bấm nhầm.
- **Không dùng tài nguyên bên ngoài** (không CDN, không Google Fonts, không quảng cáo/analytics):
  mọi thứ nằm trong thư mục này, nên không bị chặn ở Việt Nam hay Nga.
  Có service worker nên đã mở một lần là chơi được cả khi mất mạng; có thể "Thêm vào màn hình chính".

## Chạy

Chỉ là file tĩnh, không cần cài đặt hay build:

```bash
cd caro
python3 -m http.server 8000   # rồi mở http://localhost:8000
```

Mở trực tiếp `index.html` cũng chơi được (khi đó không có chế độ offline).

## Đăng lên mạng

- **GitHub Pages** (đã có sẵn workflow `.github/workflows/pages.yml`): vào
  *Settings → Pages → Source: GitHub Actions*; mỗi lần gộp vào nhánh `main`,
  game tự đăng lên `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
- Hoặc tải thư mục `caro/` lên bất kỳ hosting tĩnh nào (Cloudflare Pages, Netlify,
  hosting trong nước…) – nên chọn nơi truy cập ổn định ở cả hai nước.

## Phím tắt (máy tính)

`←↑→↓` di chuyển · `+`/`-` phóng to/thu nhỏ · `C` về giữa · `N` ván mới · `Ctrl+Z` đi lại

## Kiểm thử

```bash
node caro/tests/rules.test.js
```

## Cấu trúc

| File | Nội dung |
|---|---|
| `rules.js` | Luật thắng + AI (dùng chung cho trình duyệt và Node) |
| `app.js` | Vẽ bàn cờ (canvas), xử lý chạm/chuột/phím, lưu trạng thái |
| `index.html`, `style.css` | Giao diện |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Chạy offline, cài như ứng dụng |
