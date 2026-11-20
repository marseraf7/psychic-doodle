# Thí điểm app desktop bằng Tauri 2, chạy Rapfi gốc làm tiến trình phụ (19/11/2026)

Đây là bước 4 trong lộ trình ở `docs/nghien-cuu-viet-lai-rust-17-11-2026.md`. **Tóm tắt:** bản Linux dựng được, cài được
và chạy được trên máy dev. Cầu nối JS → lệnh Tauri → Rapfi gốc đã chạy thật từ đầu tới cuối. Rapfi gốc nhanh hơn bản
WebAssembly của app **×3,35 mỗi luồng** (ba luật có NNUE, cùng máy, cùng số nút), vượt xa ngưỡng ×1,3. Bản Windows và
macOS mới có cấu hình CI, **chưa từng chạy**. Hai điều kiện dừng còn bỏ ngỏ: lỗi hiển thị WebKitGTK trên máy Linux thật,
và **chủ dự án chưa xác nhận quyết định giấy phép GPL**.

## 1. Đã làm gì

| Phần | File |
|---|---|
| Dự án Tauri 2 (cửa sổ "Caro x Gomoku", id `io.github.marseraf7.caro.desktop`) | `desktop/src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `build.rs`, `src/main.rs` |
| Quyền của cửa sổ: chỉ được gọi 2 lệnh engine, không cấp plugin nào | `desktop/src-tauri/capabilities/main.json` |
| Hai lệnh `engine_bench`, `engine_best_move(moves, rule, timeMs)` | `desktop/src-tauri/src/engine.rs` |
| Điều khiển Rapfi qua giao thức Gomocup (canh giờ, tự chạy lại khi treo / chết); chỉ dùng thư viện chuẩn, kiểm thử được mà không cần Tauri | crate `desktop/src-tauri/rapfi/` (`caro-rapfi`) |
| Tự kiểm khi đặt `CARO_DESKTOP_SELFTEST=1`: mở app, JS gọi Rapfi, in kết quả và thời gian khởi động rồi thoát | `desktop/src-tauri/src/selftest.rs` |
| Cầu nối JS thí điểm `window.CaroNativeEngine = { available, bench(), bestMove(moves, rule, ms) }`; BOAT đi nước qua nó từ 20/11/2026 (mục 9) | `desktop/www-extra/native-engine.js` |
| Chép giao diện `caro/` → `desktop/www` (y như app Android / iOS), ghi `config.js` có `CARO_DESKTOP = true` | `desktop/scripts/build-web.js` và `app/scripts/web-common.js` (phần chung với app di động) |
| Dựng Rapfi gốc từ fork `marseraf7/rapfi` đúng commit ghim, ra `binaries/pbrain-rapfi[-caro]-<triple>[.exe]` | `desktop/scripts/build-rapfi.sh` |
| Tài nguyên của tiến trình phụ: cấu hình (sinh từ `caro/rapfi/worker.js`), mô hình, mạng NNUE, giấy phép, mã nguồn | `desktop/scripts/rapfi-resources.js` |
| So tốc độ Rapfi gốc với Rapfi WASM trên cùng máy | `server/scripts/rapfi/bench-goc-wasm.js` |
| CI cho Linux / Windows / macOS | `.github/workflows/desktop.yml` |
| Máy chủ nhận WebSocket từ app desktop (`tauri://localhost`, `http://tauri.localhost`) | `server/src/web.js` (`APP_WS_ORIGINS`), có bài thử trong `server/test/origin.test.js` |

Một số lựa chọn thiết kế:

- **Hai tiến trình phụ.** `pbrain-rapfi` là Rapfi nguyên bản, dùng cho luật tự do, tiêu chuẩn và Renju. `pbrain-rapfi-caro`
  là Rapfi-CARO (thêm bản vá luật Việt Nam `caro/rapfi/build/rapfi-caro.patch`), dùng cho luật `vn`. Cách chia này giống
  bản WASM. Cả hai đều có thêm `rapfi-mt.patch`: bản gốc chạy đa luồng nên gặp đúng lỗi "mất lệnh gửi ngay sau nước đi"
  mà bản WASM đa luồng đã vá.
- **JS không có quyền `shell`.** Đề bài gợi ý cấp quyền chạy sidecar `pbrain-rapfi` qua plugin shell. Ở đây phía Rust tự
  chạy tiến trình (`std::process`) với đường dẫn cố định: file cạnh file chạy của app, nơi Tauri đặt các file
  `bundle.externalBin`. Nhờ vậy cửa sổ chỉ cần hai quyền `allow-engine-bench` và `allow-engine-best-move` do
  `AppManifest` sinh ra. Không cài `tauri-plugin-shell`. Lỗi XSS trong trang cũng chỉ gọi được hai lệnh này.
- **Tiến trình sống lâu.** Rapfi được giữ chạy giữa các nước để giữ bảng băm. Gặp hết giờ (thời gian nghĩ × 1,5 + 10
  giây), tiến trình chết hay ống đứt thì Rust giết tiến trình, chạy lại và hỏi lại một lần. Gặp đầu vào sai (ô ngoài bàn,
  trùng ô, luật lạ) thì báo lỗi ngay, không thử lại. Thời gian nghĩ bị kẹp trong khoảng 40 ms đến 10 phút. Khi app thoát,
  các tiến trình Rapfi bị giết.
- **Luồng.** Mỗi nước dùng `min(số lõi, 8)` luồng. `bench` của Rapfi luôn chạy 1 luồng.
- **Phiên bản** (tra crates.io và npm ngày 19/11/2026): `tauri ~2.12.7`, `tauri-build ~2.7.6`, `@tauri-apps/cli 2.12.6`.
  Cả hai file khoá `Cargo.lock` và `desktop/package-lock.json` đều được commit.

## 2. Dựng trên máy

Cần Node 22, Rust (stable), CMake, Ninja và clang. Linux cần thêm WebKitGTK 4.1. Chạy mọi lệnh từ gốc repo. Ở bước 2,
Windows phải chạy trong Git Bash, sau khi đã nạp môi trường Visual Studio ("x64 Native Tools", hoặc `vcvars64.bat`) để có
`clang-cl`, `lld-link` và Windows SDK.

```bash
# 1. Linux (Debian / Ubuntu): thư viện hệ thống
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libssl-dev \
  build-essential file cmake ninja-build clang
#    macOS: xcode-select --install && brew install cmake ninja
#    Windows: Visual Studio 2022+ có "Desktop development with C++" + "C++ Clang tools"; cmake, ninja; WebView2 có sẵn trên Win 10/11

# 2. Rapfi gốc (khoảng 4 phút mỗi bản trên 4 lõi) → desktop/src-tauri/binaries/
bash desktop/scripts/build-rapfi.sh              # RAPFI_SOURCE=tarball: dùng gói nguồn trong repo, không cần mạng

# 3. Mạng NNUE (CC0, khoảng 40 MB), đúng commit mà app dùng
git clone https://github.com/marseraf7/rapfi-networks.git /tmp/rapfi-networks
git -C /tmp/rapfi-networks checkout e32ad77a5364363b3e3a02b3f9e8610ade19ea98

# 4. Giao diện + tài nguyên + biểu tượng + bộ cài
cd desktop && npm ci
node scripts/build-web.js
RAPFI_NETS=/tmp/rapfi-networks/mix9svq node scripts/rapfi-resources.js
npx tauri icon ../app/assets/icon-only.png
npx tauri build                # hoặc: npx tauri dev
# Ra: src-tauri/target/release/bundle/{deb,rpm,appimage} | {msi,nsis} | {dmg,macos}

# Kiểm thử phần điều khiển Rapfi (không cần Tauri; có Rapfi thật thì đặt thêm biến, xem đầu tests/sidecar.rs)
cd src-tauri/rapfi && CARO_RAPFI_BIN=../binaries/pbrain-rapfi-x86_64-unknown-linux-gnu \
  CARO_RAPFI_CONFIG=../resources/rapfi/config.toml cargo test
# Tự kiểm app thật (Linux không màn hình: xvfb-run -a …)
CARO_DESKTOP_SELFTEST=1 ./src-tauri/target/release/caro-desktop
```

Không đặt `RAPFI_NETS` thì app vẫn dựng được, nhưng ba luật Gomoku chỉ chạy bằng đánh giá cổ điển (yếu hơn bản web
nhiều). Script sẽ in cảnh báo khi đó.

## 3. CI làm gì (`.github/workflows/desktop.yml`)

CI chạy khi có thay đổi ở `desktop/**` hoặc ở chính file workflow, và khi bấm chạy tay. Ma trận gồm `ubuntu-22.04` (x64),
`windows-latest` (x64) và `macos-latest` (arm64). Mỗi máy làm các bước sau:

1. Cài thư viện. Linux: WebKitGTK 4.1 và clang-15. Windows: `ilammy/msvc-dev-cmd` (clang-cl), tắt `core.autocrlf` để
   script và bản vá giữ xuống dòng LF. macOS: ninja.
2. Tải `rapfi-networks@e32ad77` (có cache), rồi chạy `build-rapfi.sh`. Preset được chọn như sau: x64 Linux dùng
   `x64-clang-AVX2`; Windows dùng Ninja + clang-cl với đúng các cờ của `x64-msvc-AVX2`, vì preset MSVC đòi generator
   "Visual Studio 18 2026"; arm64 macOS dùng `arm64-clang-NEON`.
3. `cargo test --release` crate `caro-rapfi` với Rapfi thật (Windows bỏ qua các bài dùng engine giả viết bằng `sh`).
4. **Chỉ Linux:** in `pbrain-rapfi bench`, rồi chạy `bench-goc-wasm.js` ở độ sâu 16 và ghi bảng vào Step Summary. Tỉ lệ
   dưới 1,3 thì chỉ in cảnh báo, không làm đỏ lượt dựng.
5. Dựng giao diện và tài nguyên, rồi `tauri build --target <triple>` và in kích thước bộ cài.
6. Tự kiểm app: mở cửa sổ, gọi Rapfi qua cầu nối JS ở luật tiêu chuẩn và luật Việt Nam, cho BOAT đi một nước thật trong
   giao diện (phải qua Rapfi gốc), giả lỗi bản gốc để BOAT phải đi bằng Worker WASM, rồi app tự thoát (mục 9). Linux bắt
   buộc đạt. Windows và macOS đặt `continue-on-error` vì chưa từng chạy thử.
7. Tải các bộ cài lên artifact: `.deb`, `.rpm`, `.AppImage`, `.msi`, `.exe` (NSIS), `.dmg`.

**Chưa ký số.** Workflow không dùng bí mật nào. Bộ cài Windows chưa có chữ ký Authenticode, nên SmartScreen sẽ cảnh báo.
Bản macOS chưa ký Developer ID và chưa notarize, nên Gatekeeper chặn và người dùng phải chuột phải → Mở. Ký số cần chứng
thư của chủ dự án: chứng thư ký mã cho Windows, và Apple Developer ID + tài khoản notarize cho macOS. Tauri ký cả các file
`externalBin` khi có danh tính ký.

**Chưa kiểm:** workflow chưa chạy lần nào trên GitHub (máy dev không xem được kết quả CI) và chưa qua actionlint (chỉ mới
kiểm cú pháp YAML). Những chỗ dễ hỏng nhất:

- dựng Rapfi bằng clang-cl, Ninja và `lld-link` trên Windows;
- AppleClang với `-march=armv8-a+simd` trên macOS;
- clang-15 trên Ubuntu 22.04 (máy dev dùng clang 18 trên Ubuntu 24.04);
- tự kiểm trên Windows và macOS.

## 4. Kết quả đo

### 4.1. Rapfi gốc so với WASM: đo thật trên máy dev

Máy đo: Intel Xeon 2,10 GHz, 4 lõi (có AVX2 và AVX-512), Ubuntu 24.04, Node 22.23. Bản gốc dựng bằng clang 18, preset
`x64-clang-AVX2`. Bản WASM là đúng các file `caro/rapfi/rapfi-{single,caro}-simd128.wasm` của app, chạy trong Node (V8,
cùng engine JS với Chrome). Hai bản dùng cùng `config.toml` (sinh từ `worker.js`), cùng mạng, 1 luồng và độ sâu cố định.
Bộ thế là bộ "Search Bench" của Rapfi (10 thế). Bảng băm được xoá trước mỗi thế. Thời gian là thời gian đồng hồ của riêng
lượt nghĩ: lượt khởi động (nạp mạng) không tính.

| Độ sâu | Luật tự do | Tiêu chuẩn | Renju | **Gộp 3 luật NNUE** | Việt Nam (đánh giá cổ điển) |
|---|---|---|---|---|---|
| 16 | 180 K / 52 K nút/s = ×3,46 | 146 K / 45 K = ×3,23 | 198 K / 59 K = ×3,33 | **×3,35** | 1.080 K / 749 K = ×1,44 |
| 18 | 176 K / 55 K = ×3,17 | 169 K / 48 K = ×3,50 | 200 K / 56 K = ×3,56 | **×3,37** | 1.137 K / 820 K = ×1,39 |

- Số nút của bản gốc và bản WASM **trùng nhau ở mọi thế**. Hai bản tìm cùng một cây, nên tỉ lệ trên chỉ là tỉ lệ tốc độ.
- `pbrain-rapfi bench` (bản gốc, 1 luồng, độ sâu 19): 176.879 nút/s ở bản không vá và 178.055 nút/s ở bản sidecar có
  `rapfi-mt.patch`. Cả hai đều 4.391.204 nút, hash `e240ab16`, đúng hash chuẩn của clang mà CMakeLists.txt của Rapfi ghi.
  Như vậy bản vá đa luồng không đổi kết quả tìm kiếm.
- Mức ×3,35 cao hơn ước tính ×1,3–1,85 trong bài nghiên cứu (suy từ Stockfish). Lý do có lẽ là đánh giá NNUE của Rapfi
  hưởng lợi nhiều từ SIMD 256 bit (AVX2) so với 128 bit của WASM. Luật Việt Nam dùng đánh giá cổ điển, ít SIMD, nên chỉ
  được ×1,4. Mức này vẫn trên ngưỡng nhưng sát.
- Giới hạn của phép đo: WASM chạy trong Node, chưa đo trong Safari, Firefox hay WebView. Đây là một máy chủ ảo, chưa đo
  trên máy người chơi. Chưa đo bản arm64 (NEON) và bản Windows. Ngoài tốc độ mỗi luồng, bản gốc còn dùng được nhiều luồng
  ở mọi nơi; bản WASM chỉ đa luồng khi trang được cô lập cross-origin.

Lệnh chạy lại phép đo:
`RAPFI_NETS=<mix9svq> RAPFI_CARO_BIN=<pbrain-rapfi-caro> node server/scripts/rapfi/bench-goc-wasm.js <pbrain-rapfi> 16`.

### 4.2. Bộ cài và khởi động: chỉ có số của Linux, dựng trên máy dev (Ubuntu 24.04)

| Bộ cài | Kích thước |
|---|---|
| `.deb` | 45,6 MiB |
| `.rpm` | 45,6 MiB |
| `.AppImage` | 120,2 MiB (gói kèm GTK / WebKitGTK) |

Trong đó, bốn mạng NNUE chiếm khoảng 38 MiB, file chạy của app khoảng 8 MB, mỗi sidecar Rapfi khoảng 4 MB (libstdc++
tĩnh, lúc đo chưa strip; `build-rapfi.sh` nay strip trên Linux nên còn khoảng 3,3 MB), gói nguồn Rapfi khoảng 0,8 MB. Bỏ mạng ra (tải khi cần như bản web) thì `.deb` còn khoảng 7–8 MiB. Kích thước bộ
cài Windows và macOS: **chưa đo**.

Khởi động: đo bằng `.deb` đã cài, chế độ tự kiểm, Xvfb dựng hình bằng phần mềm (không có GPU). Trang nạp xong
(`PageLoadEvent::Finished`) sau **1,31 / 1,37 / 1,42 giây** ở ba lần chạy. Cả lượt tự kiểm, gồm hai nước Rapfi mỗi nước
300 ms, mất 2,2–2,3 giây. Lần chạy đầu tiên khi bộ nhớ đệm đĩa còn lạnh mất 4,4 giây. Trên máy có GPU, Windows và macOS:
**chưa đo**.

Thời gian dựng: biên dịch Rust bản phát hành (LTO) mất khoảng 3 phút trên 4 lõi. Mỗi bản Rapfi mất khoảng 4 phút.

## 5. Giấy phép GPL của tiến trình phụ

- Rapfi theo GPL-3.0. Mạng NNUE và mô hình cổ điển theo CC0. Rapfi chạy là **chương trình riêng**, chỉ trao đổi qua
  stdin / stdout bằng giao thức Gomocup. App không liên kết hay nạp mã Rapfi vào tiến trình của mình, nên cách này thường
  được xem là gói gộp (aggregate).
- Bộ cài kèm `<resources>/rapfi/` gồm `COPYING.txt` (toàn văn GPL-3), `AUTHORS.txt` và `NGUON-RAPFI.txt`. File
  `NGUON-RAPFI.txt` ghi bản quyền, quyền của người dùng, nơi lấy mã nguồn (fork `marseraf7/rapfi` và kho gốc
  `dhbloo/rapfi` tại commit `3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7`) và giấy phép CC0 của mạng. Thư mục `source/` kèm
  **toàn bộ mã nguồn tương ứng**: gói nguồn đúng commit, hai bản vá và `build-rapfi.sh`. Như vậy không phải dựa vào lời
  hứa cung cấp mã nguồn qua mạng.
- Việc còn thiếu: chưa có màn hình "Giấy phép" trong app desktop. Bản web có trang giấy phép riêng. Bản desktop hiện chỉ
  có các file trong thư mục tài nguyên. Nên thêm một liên kết trong mục Giới thiệu.
- **Đây không phải tư vấn pháp lý.** Lộ trình đặt "bên pháp lý chưa xác nhận GPL" làm **điều kiện dừng**. Chủ dự án phải
  tự quyết định (và nên hỏi người có chuyên môn), nhất là khi phát hành qua Microsoft Store hoặc Mac App Store, nơi điều
  khoản cửa hàng có thể xung khắc với GPL như trường hợp App Store của iOS. Phát hành tải trực tiếp (GitHub Releases) là
  đường ít rủi ro nhất. Thí điểm này **chưa** được xác nhận.

## 6. Rủi ro Linux / WebKitGTK (từ ghi chú nghiên cứu)

- WebKitGTK có lỗi hiển thị đã biết với driver NVIDIA và Wayland: màn trắng, chớp, hoặc sập khi bật DMA-BUF. Cách tránh
  thường dùng là đặt `WEBKIT_DISABLE_DMABUF_RENDERER=1` hoặc `WEBKIT_DISABLE_COMPOSITING_MODE=1` (tài liệu Tauri "Linux
  graphics"). App chưa tự đặt biến nào. Ở đây mới thử bằng Xvfb với dựng hình phần mềm: chạy được, nhưng **chưa thử trên
  máy Linux thật có NVIDIA hoặc Wayland**.
- Canvas trên WebKitGTK chậm hơn Chromium. Chưa đo bàn cờ hay hoạt ảnh trên Linux.
- WebView mỗi nơi một kiểu: Windows dùng WebView2 (Chromium), macOS dùng WKWebView (Safari), Linux dùng WebKitGTK. Giao
  diện đã chạy trong Safari / WebKit (bài e2e webkit), nhưng chưa chạy e2e trong chính các WebView này.
- `.deb` / `.rpm` phụ thuộc `libwebkit2gtk-4.1`, nên bản Linux quá cũ (trước Ubuntu 22.04 / Debian 12) không cài được.
  AppImage gói kèm thư viện nhưng nặng 120 MiB. Sidecar còn cần glibc ≥ máy dựng (2.35 trên Ubuntu 22.04) và
  `libatomic1`.

## 7. Việc còn lại để nối Rapfi gốc vào ván cờ

1. ~~BOAT đi nước bằng bản gốc~~: **xong 20/11/2026** (mục 9). Còn `caro/rapfi-analysis.js` (phân tích ván) và nghĩ trước
   vẫn chạy Worker WASM: cần các lệnh Rust ở điểm 2 (điểm đánh giá, số nút, dừng).
2. Mở rộng lệnh Rust cho đủ những gì `worker.js` đang làm:
   - trả về điểm đánh giá (`ev`: cp / mate) cùng nước đi;
   - ván mới (`YXHASHCLEAR`);
   - nghĩ trước và dừng (`YXSTOP`);
   - chấm theo số nút cho phần phân tích (`INFO max_node`);
   - đổi số luồng (máy nóng / pin yếu);
   - chia thời gian kiểu `brain.js`.
   Có thể chuyển hẳn `brain.js` sang gọi lệnh gốc.
3. Quyết định về mạng NNUE: gói sẵn (bộ cài 45 MiB) hay tải khi cần vào thư mục dữ liệu của app, kiểm SHA-256 như
   `worker.js` (bộ cài khoảng 8 MiB).
4. Đo lại sức chơi: ván BOAT với Rapfi gốc đa luồng so với Rapfi WASM (`server/scripts/rapfi/boat-match.js` chạy với
   driver gốc).
5. Hoàn thiện app: CSP cho `tauri.conf.json` (hiện là `null`), màn hình giấy phép, tự cập nhật (`tauri-plugin-updater`
   cần khoá ký), ký số và notarize. Kiểm đăng nhập Google trong WebView desktop, vì Google chặn đăng nhập trong WebView
   nhúng (app Android dùng tài khoản trên máy). Triển khai máy chủ có bản `APP_WS_ORIGINS` mới để chơi online được.

## 8. Đánh giá tiếp tục / dừng theo điều kiện dừng của lộ trình

| Điều kiện dừng (bước 4) | Hiện trạng | Kết luận |
|---|---|---|
| Rapfi gốc nhanh hơn WASM dưới ×1,3 mỗi luồng | Đo thật: ×3,35–3,37 (3 luật NNUE), ×1,39–1,44 (luật Việt Nam) trên x64 AVX2. CI sẽ đo lại trên máy GitHub | **Đạt**, với một lưu ý: luật Việt Nam sát ngưỡng, và chưa đo arm64 / Windows |
| Linux / WebKitGTK lỗi hiển thị không khắc phục được | Chạy được dưới Xvfb (phần mềm). Chưa thử NVIDIA / Wayland / máy thật | **Chưa biết.** Cần thử trên 2–3 máy Linux thật |
| Bên pháp lý chưa xác nhận GPL | Đã làm phần kỹ thuật (tiến trình riêng, kèm giấy phép và mã nguồn tương ứng). Chủ dự án chưa xác nhận | **Chưa đạt.** Chờ chủ dự án quyết định |

**Kết luận: tiếp tục có điều kiện.** Lý do kỹ thuật chính để làm bản desktop (engine mạnh hơn nhiều) đã được số đo xác
nhận rõ. Tuy vậy, **chưa nên phát hành** khi chưa có ba thứ:

1. chủ dự án xác nhận quyết định giấy phép;
2. ít nhất một lượt CI xanh trên cả ba hệ điều hành, và đã tự cài thử bộ cài Windows / macOS;
3. thử trên máy Linux thật, gồm cả NVIDIA / Wayland.

Nếu điều 1 không được duyệt thì dừng thí điểm. Phần desktop khi đó vẫn có thể giữ (vỏ Tauri chạy giao diện web), chỉ bỏ
sidecar Rapfi và dùng bản WASM như trên web.

## Bổ sung khi gộp (19/11/2026)

- **CSP cho cửa sổ app** (trước đây `csp: null`). `withGlobalTauri` mở cầu nối lệnh native cho mọi script trên trang, nên
  cần chặn script lạ. `scripts/build-web.js` sinh `src-tauri/tauri.csp.json` theo đúng `CARO_SERVER_URL` (giống CSP của
  máy chủ, thêm máy chủ online cho API / ảnh / WebSocket và kênh IPC `ipc:` / `http://ipc.localhost`). `tauri build` /
  `tauri dev` / CI ghép file này bằng `--config`. Đã dựng lại bản Linux với CSP và chạy tự kiểm: `CARO_SELFTEST ok`
  (gọi Rapfi gốc cho luật tiêu chuẩn và luật Việt Nam), trang nạp xong ~1,5 giây.

## 9. BOAT dùng Rapfi gốc trong ván cờ (20/11/2026)

**Đã nối.** Trong app desktop, BOAT (luật tự do / tiêu chuẩn / Renju / Việt Nam) đi nước bằng Rapfi gốc. Lỗi hay quá hạn
thì tự về Worker WASM như bản web. Web, Android và iOS không đổi gì: chỉ đi đường mới khi có `window.CaroNativeEngine` và
`available === true`, mà cầu nối này chỉ được chèn vào `desktop/www`.

### 9.1. Chỗ nối và file

| Phần | File |
|---|---|
| Hỏi bản gốc: dời toạ độ theo khung bàn Rapfi, canh hạn, bỏ câu trả lời cũ, tạm thôi bản gốc sau lỗi | `caro/native-boat.js` (`window.CaroNativeBoat`, ~70 dòng) |
| Chỗ nối: trong `think()` (nước không lấy từ sách), hỏi `CaroNativeBoat` trước, `null` thì đi đường WASM cũ | `caro/boat-rapfi.js` |
| Nạp module (trước `boat-rapfi.js`), thêm vào `FILES`, tăng `CACHE` lên `caro-v210` | `caro/index.html`, `caro/sw.js` |
| Bài thử Node: 8 ca, `CaroNativeEngine` và Worker WASM đều giả | `caro/tests/native-boat.test.js` |
| Tự kiểm app thật: BOAT đi một nước qua giao diện bằng bản gốc, rồi giả lỗi bản gốc để BOAT đi bằng WASM | `desktop/src-tauri/src/selftest.rs` |

Vì sao module nằm trong `caro/` mà không ở `desktop/www-extra/`: module dựa vào nội bộ của `boat-rapfi.js` (khung bàn
`place` của `rapfi-board.js`, dạng kết quả `{ move, margin }` mà phần kiểm thế sát mép dùng). Đặt cạnh nhau thì đổi một
bên mà quên bên kia sẽ làm đỏ bài thử của `caro/tests`, thay vì chỉ hỏng âm thầm trong app desktop. Ngoài app desktop,
module chỉ là một file ~4 KB không làm gì (`on()` luôn `false`). `desktop/www-extra/native-engine.js` vẫn là phần duy nhất
chỉ có ở desktop (cầu nối tới lệnh Tauri).

### 9.2. Cách một nước đi

1. Sách khai cuộc (≤ 7 quân) như cũ. Ngoài sách: `frame()` kiểm thế vừa bàn Rapfi. Thời gian nghĩ giống hệt bản WASM:
   `bots.js` `rapfi.ms` (2.500 ms), sát mép thì `max(800, ms − 800)`. Bản WASM với `PLAY = { hit: false, tm: false }`
   cũng gửi `INFO timeout_turn ms`, như lệnh Rust.
2. Có bản gốc: dời toạ độ bằng đúng khung `place(rule, moves)` của đường WASM (khung "dính", toạ độ 0..size-1, cỡ bàn
   20 / 15 / 15 / 20). Tên luật `free` / `std` / `renju` / `vn` truyền thẳng (`Rule::parse`). Lệnh Rust tự chọn
   `pbrain-rapfi-caro` cho luật `vn`.
3. Kết quả bản gốc được kiểm như kết quả WASM: phải trong bàn, ô trống, không phải nước cấm (Renju). Sát mép (cách mép < 4
   ô) thì engine của game vẫn kiểm lại như cũ.
4. **Dự phòng:** bản gốc báo lỗi (lệnh Tauri từ chối: tiến trình chết hai lần, luật lạ…), quá hạn **2 × thời gian nghĩ +
   5 giây** (10 giây với BOAT), trả nước ngoài bàn hay vào ô có quân. Khi đó nước này đi bằng Worker WASM (`ready(rule,
   1,5 s)` rồi `ask`, như bản web). WASM chưa sẵn sàng sau 1,5 giây thì dùng engine của game, như bản web khi mạng chưa
   tải xong. Sau một lỗi, bản gốc tạm nghỉ **60 giây**, để mỗi nước khỏi phải chờ hết hạn rồi mới đi WASM.
5. **Huỷ:** mỗi lượt hỏi có số thứ tự. Lượt hỏi mới, ván mới (`prepare` → `cancel()`), hay người chơi đã đi lại (thế trên
   bàn khác thế đã hỏi) thì câu trả lời đến sau bị bỏ (`{ stale: true }`). Khi đó không hỏi WASM cho thế cũ. `app-ai.js`
   cũng tự bỏ kết quả của thế cũ như trước. Rust chưa có lệnh dừng (`YXSTOP`), nên lượt cũ vẫn nghĩ nốt trong tiến trình
   và lượt sau xếp hàng chờ. Hạn 2 × ms + 5 s đã tính cho trường hợp này.
6. Bản gốc đi thì **không nghĩ trước bằng WASM**. Nước sau lại do bản gốc đi, nên bảng băm của WASM không dùng được mà còn
   tranh CPU với các luồng của bản gốc. Ván dùng bản gốc cũng không dựng Worker WASM lúc bắt đầu ván (đỡ tải ~10 MB mạng
   NNUE và RAM). Worker chỉ được dựng khi cần dự phòng hoặc khi phân tích.
7. Bộ đếm: `CaroRapfi.stats.native` (nước do bản gốc đi, cũng được tính vào `stats.rapfi` và huy hiệu BOAT–Rapfi),
   `CaroNativeBoat.stats` (`native`, `fail`, `timeout`, `stale`, `ms` của nước gần nhất, `last` là lỗi gần nhất).

**Vẫn chạy WASM:** nghĩ trước (`rapfi-ponder.js`) và phân tích ván (`rapfi-analysis.js`). Hai việc này cần những thứ lệnh
Rust chưa có: dừng giữa chừng, điểm đánh giá `ev`, dừng theo số nút (`max_node`), xoá bảng băm. Đó là việc của mục 7,
điểm 2. Không thêm chữ nào trên giao diện (không có nhãn "Rapfi gốc"), nên không cần chuỗi dịch mới.

**Sửa kèm:** `supported()` của `boat-rapfi.js` nay nhận cả giao thức `tauri:`. App desktop trên Linux / macOS chạy ở
`tauri://localhost` (Windows ở `http://tauri.localhost`), nên trước đây trên Linux / macOS, BOAT không dùng Rapfi nào cả,
chỉ dùng engine của game. Nay Worker WASM chạy được ở đó (tự kiểm đã thấy) và làm đường dự phòng, cũng như engine phân
tích. Giao thức `tauri:` chỉ có trong app desktop, nên web / Android / iOS không đổi.

### 9.3. Kiểm thử và số đo (máy dev: Xeon 2,1 GHz 4 lõi, Ubuntu 24.04, Xvfb dựng hình phần mềm)

- `node --test caro/tests/native-boat.test.js`: 8/8 đạt. Các ca: bản gốc được dùng khi có (cả 4 luật, không dựng Worker
  WASM); toạ độ dời đúng khung và nằm giữa bàn; truyền đúng luật và 2.500 ms; bị từ chối thì WASM đi, nghỉ 60 giây rồi hỏi
  lại; quá hạn thì WASM đi và câu trả lời muộn bị bỏ; trả ô có quân / ngoài bàn thì WASM đi; đi lại / ván mới / lượt hỏi
  mới thì câu trả lời cũ bị bỏ, không hỏi WASM; không có `CaroNativeEngine` hoặc `available = false` thì y như cũ (dựng
  Worker từ đầu ván, nghĩ trước).
- `cd server && npm test` 521/521 · `node --test caro/tests/*.test.js` 133/133 · e2e `boot`, `localhist`, `boat-rapfi`
  (`RAPFI_NETS`, Chromium): tất cả đạt.
- Tự kiểm app thật (dựng như CI: `build-rapfi.sh`, `build-web.js`, `rapfi-resources.js` có mạng NNUE, `tauri build
  --target x86_64-unknown-linux-gnu --config src-tauri/tauri.csp.json`; chạy bằng `xvfb-run -a`, hồ sơ trống), hai lần:

  ```
  CARO_SELFTEST ok std=8,6 vn=9,9 van-std=1,0 (Rapfi gốc 2017 ms, cả nước 2077 ms) wasm-vn=san-sang 643 ms loi-vn=0,-1 (wasm, 2501 ms) · trang nạp xong sau 1979 ms · tổng 8060 ms
  CARO_SELFTEST ok std=8,6 vn=9,9 van-std=1,0 (Rapfi gốc 2139 ms, cả nước 2186 ms) wasm-vn=san-sang 653 ms loi-vn=0,-1 (wasm, 2559 ms) · trang nạp xong sau 1945 ms · tổng 8212 ms
  ```

  Đọc như sau. `van-std`: BOAT đi nước thứ 10 trong giao diện bằng Rapfi gốc. `wasm-vn`: Worker WASM (Rapfi-CARO) nạp
  được trong WebKitGTK ở `tauri://`. `loi-vn`: bản gốc bị giả lỗi, BOAT vẫn đi, và đi bằng WASM. Một bản tự kiểm trước đó, chưa có
  bước nạp sẵn WASM, cho ra `engine, 4616 ms`: WASM chưa sẵn sàng sau 1,5 giây nên engine của game đi. Đúng thiết kế ở bước 4.
- **Thời gian một nước:** cả hai bản đều nghĩ theo cùng quỹ 2.500 ms. Bản gốc trả nước sau **~2,0–2,1 s** (luật tiêu
  chuẩn, 4 luồng; cả nước tính từ lúc bắt đầu ván tới khi quân hiện là ~2,1–2,2 s). Rapfi thôi mở lớp mới sau 0,75 × quỹ.
  Bản WASM trả sau **~2,5 s** (luật Việt Nam, 1 luồng, có cả thời gian kiểm và chờ). Hai số này **không cùng luật**, nên
  chỉ cho thấy độ trễ cỡ như nhau, vì độ trễ do quỹ giờ quyết định. Cái lợi nằm ở số nút tìm được trong cùng quỹ: ×3,35
  mỗi luồng (mục 4.1) nhân với số luồng. Chưa đo sức chơi bằng ván đấu (mục 7, điểm 4).
- **Chưa kiểm:** Windows / macOS (CI đã có bước tự kiểm mới, chưa chạy); máy Linux thật có GPU; bản gốc treo thật (mới
  giả lỗi bằng cách thay `bestMove`; treo thật đã có bài thử Rust ở `caro-rapfi`).
