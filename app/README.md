# Ứng dụng Cờ Caro (Android / iOS)

Ứng dụng điện thoại dùng **đúng giao diện và mã chơi của bản web** (thư mục [`caro/`](../caro)),
đóng gói bằng [Capacitor](https://capacitorjs.com). Vì cùng một mã nguồn và cùng máy chủ online,
mọi tính năng giống hệt bản web và **người chơi trên app đấu được với người chơi trên web**:
giải đấu (Arena, loại trực tiếp, nhánh thắng – thua, vòng tròn, Thụy Sĩ, vòng bảng → playoff), câu lạc bộ, tìm trận nhanh, phòng công khai, phòng chơi, thách đấu Bo1/3/5, bạn bè, nhắn tin, xin hoà, chat nhanh, lịch sử + xem lại, Elo, xếp hạng…
Sửa giao diện trong `caro/` là cả web lẫn app cùng được cập nhật (app cần dựng lại).

Những chỗ app dùng tính năng gốc của điện thoại thay cho trình duyệt ([`caro/native.js`](../caro/native.js)):

| Tính năng | Trong app |
|---|---|
| Nút Back (Android) | Đóng hộp thoại / menu / xem lại trước, hết mới thu nhỏ app |
| Chia sẻ link mời, link xem lại | Bảng chia sẻ của hệ thống (Zalo, Telegram, Messenger…) |
| Sao chép link | Bộ nhớ tạm của hệ thống |
| Rung | Rung của hệ thống |
| Đăng nhập Google | Tài khoản Google trên máy (**Android**). Google chặn đăng nhập trong WebView nên không dùng được nút của bản web |
| Chơi offline | File game nằm sẵn trong app (không cần service worker) |

## Tải bản dựng sẵn

Mỗi lần đẩy code, GitHub Actions ([`.github/workflows/app.yml`](../.github/workflows/app.yml)) tự dựng app:

- **Actions → App Caro → lần chạy mới nhất → Artifacts → `caro-android`**:
  - `app-debug.apk`: cài thẳng lên điện thoại Android để chơi thử (bật "Cài ứng dụng không rõ nguồn gốc").
  - `app-release.apk` / `app-release.aab`: bản phát hành (chỉ **đã ký** khi bạn cài khoá ký, xem dưới).
- Job **Android – chơi chéo** chạy app trên máy ảo Android 14 và Android 15 thật, cho app đấu với bản web
  (chạm thật vào bàn cờ, nút Back thật), kiểm tra giao diện không bị thanh trạng thái / thanh điều hướng
  che (Android 15 bắt buộc tràn viền), bàn phím không che ô nhập tin nhắn, và sao chép link mời vào
  bộ nhớ tạm, vào phòng công khai từ danh sách và tìm trận nhanh (thẻ "đang tìm" vẫn hiện khi đóng bảng
  bằng nút Back) với bản web, và vào giải đấu Arena bằng giao diện app (tham gia → giải bắt đầu → tự vào ván). Ảnh chụp màn hình ở artifact `android-34-e2e-screenshots`, `android-35-e2e-screenshots`.
- Job **iOS** dựng app cho iPhone ảo và mở thử (ảnh ở artifact `caro-ios-simulator`).

## Máy chủ

App kết nối máy chủ `https://caroxo.duckdns.org`. Đổi máy chủ: vào **Settings → Secrets and variables →
Actions → Variables** của repo, thêm `CARO_SERVER_URL` (ví dụ `https://caro.ten-mien.com`).
Máy chủ **bắt buộc có HTTPS** (Android / iOS chặn kết nối không mã hoá) – Caddy như trong
[server/README.md](../server/README.md) là đủ.

Máy chủ không cần sửa gì thêm: app và web gửi cùng loại tin nhắn. Khi sau này thay đổi cách
máy chủ và giao diện nói chuyện với nhau, nhớ dựng và phát hành lại app để bản cài trên điện thoại
không bị cũ.

## Dựng trên máy của bạn

Cần Node.js 22+, và:
- Android: [Android Studio](https://developer.android.com/studio) (có sẵn JDK 21 và Android SDK).
- iOS: máy Mac có Xcode 16 trở lên.

```bash
cd app
npm ci
npm run sync                  # dựng www từ ../caro rồi chép vào android/ và ios/
npx cap open android          # mở Android Studio → Run
npx cap open ios              # mở Xcode → Run
```

`CARO_SERVER_URL=https://... npm run sync` để trỏ tới máy chủ khác.

## Phát hành lên Google Play

1. Tạo khoá ký **một lần duy nhất** và cất giữ cẩn thận (mất khoá = không cập nhật app được nữa):
   ```bash
   keytool -genkeypair -v -keystore caro.jks -alias caro -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Trong **Settings → Secrets and variables → Actions → Secrets**, thêm:
   - `CARO_KEYSTORE_BASE64`: kết quả `base64 -w0 caro.jks`
   - `CARO_KEYSTORE_PASSWORD`, `CARO_KEY_ALIAS` (`caro`), `CARO_KEY_PASSWORD`
3. Lần chạy Actions tiếp theo cho ra `app-release.aab` đã ký → tải lên
   [Google Play Console](https://play.google.com/console) (phí đăng ký 25 USD, một lần).
   Số phiên bản (`versionCode`) tự tăng theo số lần chạy Actions; tên phiên bản lấy từ `version`
   trong `app/package.json`.
4. Trong Play Console, mục *App content*:
   - **Privacy policy**: `https://caroxo.duckdns.org/privacy.html`
   - **Data safety → Account deletion**: xoá được ngay trong app; link web:
     `https://caroxo.duckdns.org/privacy.html#delete`
   - Khai báo dữ liệu thu thập: tên đăng nhập, email (tuỳ chọn), tin nhắn trong game, lịch sử ván;
     không quảng cáo, không chia sẻ cho bên thứ ba (xem nội dung trang chính sách).

### Phát hành bản mới và bắt buộc cập nhật

Mỗi bản app gửi kèm số phiên bản (`version` trong `app/package.json`) khi kết nối. Khi đổi cách
máy chủ và giao diện nói chuyện với nhau mà bản cũ không dùng được nữa:

1. Tăng `version` trong `app/package.json` (ví dụ `1.1.0`), dựng và phát hành bản mới lên cửa hàng.
2. Khi bản mới đã lên cửa hàng, đặt trên máy chủ `MIN_APP_VERSION=1.1.0` (và `ANDROID_UPDATE_URL`,
   `IOS_UPDATE_URL`). App cũ hơn sẽ hiện "Cần cập nhật app" kèm nút mở cửa hàng; chơi với máy vẫn được.

Mã ứng dụng là `io.github.marseraf7.caro`. Muốn đổi thì đổi **trước** lần phát hành đầu tiên
(`appId` trong `scripts/build-web.js`, rồi tạo lại thư mục `android/`, `ios/`); sau khi đã lên
cửa hàng thì không đổi được nữa.

## Bật đăng nhập Google trên Android

App gửi cho máy chủ đúng loại mã Google như bản web, nên máy chủ không cần sửa. Chỉ cần thêm
trong [Google Cloud Console](https://console.cloud.google.com/apis/credentials), **cùng dự án**
với Client ID web đang dùng ở `GOOGLE_CLIENT_ID`:

1. *Create credentials → OAuth client ID → **Android***.
2. Package name: `io.github.marseraf7.caro`.
3. SHA-1: của **khoá ký phát hành** (`keytool -list -v -keystore caro.jks -alias caro`).
   Nếu phát hành qua Google Play, thêm cả SHA-1 trong *Play Console → App integrity → App signing key*.

Bản `app-debug.apk` dựng trên GitHub Actions ký bằng khoá tạm, khác nhau mỗi lần dựng, nên
**nút Google chỉ hoạt động trên bản release đã ký**. Tài khoản thường (tên đăng nhập + mật khẩu)
dùng được trên mọi bản.

**iPhone**: hiện ẩn nút Google. Người dùng tài khoản Google vào mục **Tài khoản → Đặt mật khẩu**
(trên web hoặc Android) rồi đăng nhập trên iPhone bằng tên đăng nhập + mật khẩu đó.

## Phát hành lên App Store (iOS)

Cần máy Mac với Xcode và tài khoản [Apple Developer](https://developer.apple.com/programs/)
(99 USD/năm):

```bash
cd app && npm ci && npm run sync && npx cap open ios
```

Trong Xcode: chọn *Team* ở mục *Signing & Capabilities* → *Product → Archive* → *Distribute App*.
GitHub Actions chỉ kiểm tra rằng app dựng và mở được trên iPhone ảo; bản ký để lên App Store
phải làm trên Mac của bạn.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `scripts/build-web.js` | Chép `../caro` vào `www/`, ghi địa chỉ máy chủ, thêm thư viện Capacitor, tạo `capacitor.config.json` |
| `android/`, `ios/` | Dự án gốc Android Studio / Xcode (do Capacitor tạo) |
| `assets/` | Ảnh gốc để tạo biểu tượng và màn hình khởi động (`npx @capacitor/assets generate`) |
| `tests/android-e2e.js` | Kiểm thử chơi chéo app ⟷ web trên máy ảo Android |
