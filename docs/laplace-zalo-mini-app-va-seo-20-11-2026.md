# Việc cho Laplace: nghiên cứu Zalo Mini App và rà soát SEO (20/11/2026)

Hai phần độc lập, làm song song được. Cả hai chỉ **nghiên cứu và soạn báo cáo**; Claude sẽ sửa code dựa trên báo cáo.
Minh chuyển hướng dẫn này cho Laplace và nhận báo cáo về.

## Quy tắc chung (cả hai phần)

- Nguồn chính thống trước (tài liệu chính thức của Zalo / Google / Bing). Mỗi điều khẳng định ghi **nguồn (link) + ngày đọc**.
  Điều không kiểm được từ nguồn chính thức: đánh dấu **[CHƯA XÁC MINH]**; số suy luận: **[ƯỚC LƯỢNG]**.
- **Không** tạo tài khoản, đăng ký, nộp duyệt, xác minh quyền sở hữu, hay đăng gì dưới tên Minh khi chưa có Minh đồng ý.
  Cần bước đó thì soạn hướng dẫn để Minh tự làm.
- **Không** đưa khoá / token / mật khẩu / mã xác minh vào báo cáo hay ảnh chụp (che trước khi gửi).
- **Không** sửa code; chỉ mở trang công khai và gọi API công khai bằng trình duyệt.
- Báo cáo bằng tiếng Việt; chuỗi giao diện trích nguyên văn (en / ru / zh) giữ nguyên ngôn ngữ gốc.

---

# Phần 1 – Zalo Mini App: khả thi và kế hoạch thử

## 1.1 Mục tiêu

Biết **có nên và làm được không** việc đưa Cờ Caro thành Mini App trong Zalo, tốn bao nhiêu công / tiền / thời gian, và
**bên ta phải sửa gì**. Chưa làm bản chạy thật; chỉ khảo sát (và vẽ màn hình nếu muốn).

## 1.2 Bối cảnh hiện có trong repo (đã kiểm)

- `caro/index.html`: `<html lang="vi">`, `<title>Caro x Gomoku</title>`, một `meta description`; có `manifest.webmanifest`
  (PWA, `start_url "./"`, `scope "./"`). Viewport khoá zoom, `viewport-fit=cover`.
- **Chơi không cần đăng nhập** (khách chơi được với máy lẫn online); đăng nhập Google chỉ là tuỳ chọn (CSP cho
  `accounts.google.com/gsi`). Chủ dự án **không muốn thêm cách đăng nhập mới**.
- CSP trong `server/src/web.js` (khoảng dòng 36-47): `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval'` + Google GSI;
  `connect-src 'self' ws: wss:` + nguồn mạng Rapfi; `frame-ancestors 'none'` và `X-Frame-Options: DENY`
  => **trang chính không nhúng được vào iframe**; chỉ trang nhúng giải (`embed.html`) được `frame-ancestors *`.
- Kiểm Origin WebSocket: `wsOriginAllowed` trong `server/src/web-net.js` cho `https://localhost`, `capacitor://localhost`,
  `tauri://localhost`, `https://marseraf7.github.io`, `https://caroxo.ddnsgeek.com`, Origin trùng host, `PUBLIC_URL`, và biến
  môi trường `WS_ALLOWED_ORIGINS` (phân tách bằng dấu phẩy). Origin lạ bị từ chối; không có Origin thì cho qua.
- CORS: API công khai (`/api/replay/*`, `/api/rum`…) trả `access-control-allow-origin: *`.
- `caro/config.js`: bản GitHub Pages tự trỏ `CARO_SERVER` về `https://caroxo.duckdns.org` => đã có mô hình "giao diện tĩnh
  ở nơi khác + máy chủ chính", rất gần mô hình Mini App.
- Chia sẻ: `caro/share.js` dùng `navigator.share({files})` (PNG / GIF ván cờ), `caro/otour-share.js` cho giải; link xem lại
  `/?replay=<mã>` có thẻ `og:*` + ảnh `/api/replay/<mã>.png` (1200x630) do `serveIndex` trong `web.js` tạo. Từ A3
  (sau khi viết hướng dẫn này): cả `?room=` `?t=` `?o=` `?club=` `?u=` (hồ sơ) cũng có thẻ `og:*` 4 ngôn ngữ
  (`server/src/og-meta.js` + `server/src/hub/og.js`, ảnh `/api/og/card.png`, `/api/og/room/<mã>.png`); nút chia sẻ chung
  `caro/share-link.js`.
- Không dùng `confirm()` / `prompt()` / `alert()` gốc (đã có `CaroConfirm`) vì WebView Zalo / Messenger chặn chúng.
- Mẫu hồ sơ nộp cổng duyệt khác: `docs/claude-directory/` (connector MCP của Claude: `listing.md`, `SUBMISSION.md`, ảnh chụp,
  mô tả 4 ngôn ngữ). Tốc độ tải: `docs/do-toc-do-tai-laplace-19-11-2026.md` và `GET /api/rum`.

## 1.3 Việc cần làm (theo bước)

1. **Nền tảng và điều kiện** (từ `mini.zalo.me`, `developers.zalo.me`): ghi rõ
   - loại tài khoản nhà phát triển cần có (cá nhân / doanh nghiệp), giấy tờ, có xác minh không;
   - công cụ: ZMP SDK, `zmp-cli`, trình mô phỏng; framework bắt buộc (React? Vue?);
   - quy trình đăng ký, gửi duyệt, thời gian duyệt, chính sách và điều khoản nội dung;
   - **danh mục Game**: quy định riêng (độ tuổi, mô tả, ảnh, giấy phép / xếp hạng nội dung nếu có), quy định quảng cáo; mua
     trong ứng dụng ta **không** cần, chỉ ghi có / không bắt buộc;
   - **giới hạn dung lượng gói** (tổng, từng file, số file) và tải lúc chạy (ta có WASM engine; mạng Rapfi ~10 MB tải khi
     chơi BOAT, xem `rapfiNetSources()` trong `web.js`).
2. **Cách chạy mã của ta**, trả lời từng ý có nguồn:
   - (a) Mini App có cho **mở một URL web bất kỳ trong WebView** không, hay chỉ tên miền đã đăng ký, hay bị cấm?
   - (b) Nếu bắt buộc **khung ZMP** (ZaUI, React): nhúng cả game bằng cách nào (iframe? web component? viết lại UI)? Khối
     lượng so với ~240 file JS hiện có.
   - (c) Môi trường chạy là WebView Zalo hay riêng: có WebAssembly, Web Worker, WebSocket, `localStorage`, IndexedDB,
     Service Worker không? (ta cần WASM + Worker + WS; thiếu Service Worker thì mất cache offline).
   - (d) Danh sách **tên miền được gọi ra** (request / socket) và cách đăng ký; `wss://caroxo.duckdns.org` có được không?
     Có đòi tên miền riêng / HTTPS chuẩn (DuckDNS có bị từ chối?) không?
3. **Đăng nhập**: Mini App có buộc / khuyến khích đăng nhập Zalo? Có **cho khách chơi không đăng nhập** mà vẫn qua duyệt?
   Nếu dùng đăng nhập Zalo thì lấy được gì (id theo Mini App, tên, ảnh), có **liên kết được với tài khoản Google hiện có**
   không. Chủ dự án muốn không thêm đăng nhập mới; nếu duyệt buộc thì nêu rõ điều khoản nào.
4. **Ảnh hưởng tới máy chủ ta** (đối chiếu 1.2): nêu Origin / Referer thật mà Mini App gửi (nếu tài liệu nói), từ đó chốt
   - giá trị cần thêm vào `WS_ALLOWED_ORIGINS` (chỉ cấu hình, chưa cần sửa code);
   - có cần mở `frame-ancestors` / bỏ `X-Frame-Options` cho Zalo không (rủi ro clickjacking: nêu rõ, đề xuất mức tối thiểu);
   - cookie / `localStorage` bên thứ ba có bị chặn không (ta lưu tên, cấu hình, token khách ở `localStorage`).
5. **Chia sẻ vào chat Zalo**: Mini App có API chia sẻ (link / ảnh vào hội thoại, mời bạn)? Link `?replay=` có hiện ảnh xem
   trước (og) trong tin Zalo không? Thử: gửi `https://caroxo.duckdns.org/?replay=<mã thật>` cho chính mình, chụp (che thông tin
   riêng). Ghi: hiện ảnh / chỉ chữ / chặn.
6. **Official Account (OA)**: có bắt buộc gắn OA không? Quy trình tạo và xác thực, chi phí, tin OA gửi người chơi (ZNS, tin
   quảng bá) có phí không. Làm Mini App **không** cần OA được không?
7. **Chi phí và thời gian**: phí đăng ký / duyệt / duy trì, phí theo lượt dùng / băng thông (nếu có), có chia sẻ doanh thu
   hay buộc quảng cáo không. Công sức (ngày công) cho 3 phương án: (A) bọc WebView, (B) viết lại bằng ZMP, (C) không làm, chỉ
   tối ưu chia sẻ link vào Zalo. Đánh dấu **[ƯỚC LƯỢNG]** rõ.
8. **(Tuỳ chọn)** 3 màn hình mockup (vào game, bàn cờ trong khung Mini App, chia sẻ ván).

## 1.4 Cách đo / kiểm

- Mỗi kết luận có link tài liệu chính thức và ngày đọc; tài liệu mâu thuẫn nhau thì ghi cả hai.
- Phần "WebView có WASM / Worker / WS": ưu tiên **thử thật**: gửi cho chính mình link `https://caroxo.duckdns.org/` rồi mở trong
  trình duyệt tích hợp của Zalo, ghi: có vào ván với máy (WASM chạy)? chơi online (WebSocket) được? lưu tên (`localStorage`)
  được? Phép thử này không cần tài khoản nhà phát triển.

## 1.5 Tiêu chí đạt

- Trả lời đủ 7 câu ở mục 1.3 (hoặc ghi "tài liệu không nói" kèm [CHƯA XÁC MINH]).
- Có **kết luận một dòng** cho từng phương án A / B / C (nên / không nên / chờ) và lý do.
- Có **danh sách thay đổi bên ta** (bảng C) đủ cụ thể để Claude làm không phải hỏi lại.

## 1.6 Mẫu báo cáo Phần 1

Bảng A. Điều kiện nền tảng

| Hạng mục | Kết luận (ngắn) | Nguồn (link) | Ngày đọc | Đã xác minh / CHƯA XÁC MINH |
|---|---|---|---|---|
| Tài khoản nhà phát triển | | | | |
| Công cụ (ZMP SDK, zmp-cli) | | | | |
| Duyệt / chính sách / thời gian | | | | |
| Danh mục Game, quy định riêng | | | | |
| Giới hạn dung lượng | | | | |
| WebView: WASM / Worker / WS / Storage | | | | |
| Tên miền được phép / HTTPS | | | | |
| Đăng nhập Zalo, có cho khách không | | | | |
| Chia sẻ vào chat, xem trước link | | | | |
| OA: bắt buộc? chi phí | | | | |

Bảng B. Phương án

| Phương án | Làm được? | Công sức (ngày, ƯỚC LƯỢNG) | Chi phí | Rủi ro chính | Khuyến nghị |
|---|---|---|---|---|---|
| A. Bọc WebView | | | | | |
| B. Viết lại bằng ZMP | | | | | |
| C. Không làm, chỉ tối ưu link Zalo | | | | | |

Bảng C. Việc cần Claude sửa bên ta

| Việc | File / chỗ nghi ngờ | Vì sao (nguồn) | Ưu tiên (P0 / P1 / P2) |
|---|---|---|---|
| Thêm Origin Zalo vào `WS_ALLOWED_ORIGINS` (cấu hình) | `server/src/web-net.js` | | |
| Nới `frame-ancestors` cho Mini App (nếu cần) | `server/src/web.js` | | |
| Ẩn / đổi nút theo môi trường Zalo (không có `navigator.share`…) | `caro/share.js` | | |

Kèm: ảnh chụp thử mở link trong Zalo (che thông tin riêng) và 3-5 dòng "rủi ro / điều bất ngờ chưa rõ".

## 1.7 Giới hạn và điều KHÔNG được làm (Phần 1)

- Không đăng ký tài khoản nhà phát triển / OA, không tạo Mini App thử trên cổng, không nộp duyệt khi Minh chưa đồng ý. Câu hỏi
  nào **bắt buộc** có tài khoản mới trả lời được: dừng, ghi vào báo cáo, hỏi Minh.
- Không đưa App ID / secret / token / mã QR đăng nhập của cổng Zalo vào báo cáo hay ảnh.
- Không gửi link game cho người lạ hay nhóm công khai để "thử"; chỉ gửi cho chính mình.
- Không đề xuất thêm đăng nhập Zalo như mặc định; chỉ nêu như phương án khi nền tảng **buộc**.
- Blog / video không chính thức không phải nguồn xác minh.

---

# Phần 2 – SEO: rà soát và kế hoạch

## 2.1 Mục tiêu

Để người Việt gõ "cờ caro online", "caro 5 nước chặn 2 đầu", "gomoku"… tìm thấy `https://caroxo.duckdns.org`. Cần: (1) rà
hiện trạng, (2) bảng từ khoá có số liệu, (3) danh sách thay đổi **ưu tiên, theo file** cho Claude, (4) mốc đo trước / sau.

## 2.2 Bối cảnh hiện có trong repo (đã kiểm)

- `caro/index.html` (SPA, `lang="vi"` cố định): `<title>Caro x Gomoku</title>`; **một** `meta description` (tiếng Anh + một
  câu tiếng Việt); **chưa có** `og:*`, `twitter:*`, `canonical`, `hreflang`, JSON-LD (đếm `og:` trong file = 0). Ngôn ngữ đổi
  bằng JS (`caro/i18n.js`, khoá `caro.lang` ở `localStorage`) nên bot chỉ thấy một bản; vi / en / ru / zh dùng chung một URL.
- Thẻ `og:*` do `serveIndex` trong `server/src/web.js` thêm khi mở link chia sẻ: `/?replay=<mã>` (ảnh `/api/replay/<mã>.png`)
  và, từ A3, `?room=` `?t=` `?o=` `?club=` `?u=<tên đăng nhập>` (chữ 4 ngôn ngữ theo `?lang=` / Accept-Language –
  `server/src/og-meta.js`; chỉ phần khách chưa đăng nhập xem được – `server/src/hub/og.js`). Trang gốc `/` vẫn không có.
- `caro/manifest.webmanifest`: `name "Caro x Gomoku"`, `short_name "Caro"`, `lang "vi"`, mô tả tiếng Anh.
- **Không có** `robots.txt` và `sitemap.xml` trong `caro/`, và `web.js` không có route nào cho chúng (đã tìm `robots|sitemap`:
  không khớp). `/robots.txt` có thể rơi về trang chính hoặc 404: **Laplace kiểm thực tế**.
- Không có `noindex` ở trang chính; chỉ `caro/embed.html` có `<meta name="robots" content="noindex">`.
- Route tham số do JS xử lý: `/?t=<mã giải>`, `/?o=`, `/?club=`, `/?replay=<mã>` (`caro/tour.js`, `caro/online.js`,
  `caro/embed-run.js`). Hồ sơ người chơi: từ A3 có URL `/?u=<tên đăng nhập>` (`caro/share-link.js`, `caro/profile.js`).
- `caro/privacy.html` (+ `privacy.js`): trang riêng tư, đã có.
- Hai bản cùng nội dung: `https://caroxo.duckdns.org` (máy chủ chính) và GitHub Pages `https://marseraf7.github.io/…`
  (`.github/workflows/pages.yml` đăng thư mục `caro/`; `caro/config.js` trỏ API về máy chủ chính); thêm tên miền phụ
  `caroxo.ddnsgeek.com`. **Nội dung trùng, chưa có canonical** => nguy cơ trùng lặp / chia điểm.
- Tốc độ: `GET /api/rum` công khai (p50 / p75 / p95 theo trình duyệt, bản gộp / từng file; `server/src/rum.js`) và
  `docs/do-toc-do-tai-laplace-19-11-2026.md`. Lấy số này làm nền, **không** đo lại bằng cách tải nặng máy chủ.
- `docs/claude-directory/listing.md`: mô tả sản phẩm 4 ngôn ngữ, dùng làm nguồn từ ngữ.

## 2.3 Việc cần làm (theo bước)

**Bước 1. Rà hiện trạng** (chỉ trang công khai; điền bảng 2.6-A):
- Với `/`, `/?t=<mã giải thật>`, `/?o=<id thật>`, `/?replay=<mã>`, `/privacy.html`, bản GitHub Pages: đọc `<title>`,
  `meta description`, `canonical`, `hreflang`, `og:*`, `twitter:*`, JSON-LD, `robots`. Dùng "Xem nguồn trang" (Inspect cho DOM
  sau JS) **và** "URL Inspection > Test live URL" của Search Console (khi Minh đã xác minh, bước 5) để biết Google thấy gì
  sau khi chạy JS.
- Kiểm `https://caroxo.duckdns.org/robots.txt` và `/sitemap.xml`: mã HTTP, loại nội dung.
- Google: `site:caroxo.duckdns.org`, `site:marseraf7.github.io caro`, `site:caroxo.ddnsgeek.com`: ghi số kết quả, trang nào đã
  vào chỉ mục, bản nào xếp trên. Bing tương tự.
- Công cụ miễn phí (ghi tên + ngày chạy): PageSpeed Insights (di động) cho `/`, Rich Results Test, Lighthouse SEO.
- Gửi link `/?t=` và `/?o=` vào Zalo / Messenger / Facebook, ghi thẻ xem trước có đúng không (không kiểm được thì ghi "chưa kiểm").

**Bước 2. Từ khoá** (bảng 2.6-B). Tối thiểu: `cờ caro online`, `chơi cờ caro`, `caro online`, `cờ caro 5 nước chặn 2 đầu`,
`luật chơi cờ caro`, `cờ caro với máy`, `caro 2 người`, `gomoku`, `gomoku online`, `five in a row`, `renju`, `cờ ca rô`,
`cờ caro vô hạn`, cộng 4-5 cụm en / ru / zh (`гомоку онлайн`, `五子棋 在线`) và cụm tìm thấy thêm. Mỗi cụm ghi:
- lượng tìm / tháng: **Google Keyword Planner** (Minh tự đăng nhập Google Ads miễn phí, không nhập thẻ; tài khoản chưa chạy
  quảng cáo thường chỉ cho khoảng số => **[ƯỚC LƯỢNG theo khoảng]**) và **Google Trends** (Việt Nam, 12 tháng, xu hướng tương
  đối). Ahrefs / Semrush bản miễn phí chỉ để tham khảo, ghi rõ;
- ý định (chơi ngay / học luật / tải app) và mức cạnh tranh (nhìn SERP, không bịa điểm số).

**Bước 3. Đối thủ**: với 10 cụm đầu ghi top 5 Google VN (tab ẩn danh, chưa đăng nhập): tên miền, loại trang (game / tin /
kho app), title + mô tả đang hiện, có rich result không. Chọn 3-5 đối thủ chính, ghi họ có gì ta chưa có (trang luật, trang
theo ngôn ngữ, bài hướng dẫn, schema).

**Bước 4. Đề xuất thay đổi cho Claude** (bảng 2.6-C), có ưu tiên, mỗi dòng nêu **file** và nội dung cụ thể. Xác nhận hay bác
bỏ bằng bằng chứng các hạng mục dự kiến sau:
- `canonical` về `https://caroxo.duckdns.org/` và xử lý bản GitHub Pages / `ddnsgeek` (canonical chéo hay `noindex` cho bản phụ;
  nói rõ chọn gì, vì sao) => `caro/index.html`, có thể `server/src/web.js`;
- `hreflang` vi / en / ru / zh + `x-default`: vì 4 ngôn ngữ chung một URL, nêu có cần URL riêng (`/en/`, `?lang=`) không và ảnh
  hưởng lên SPA / service worker / Pages;
- `title` và `description` **theo ngôn ngữ** (hiện một cặp); độ dài đề xuất (title ≤ ~60, description ≤ ~155 ký tự);
- `og:*` + `twitter:card` cho trang gốc; ảnh xem trước 1200x630 (có thể dùng lại ảnh `docs/claude-directory/`);
- JSON-LD `WebApplication` hoặc `VideoGame`: nên loại nào theo hướng dẫn Google, kèm `inLanguage`, `offers` miễn phí, `genre`;
- `robots.txt` (cho `/`, chặn `/api/`, `/embed.html`; trỏ sitemap) và `sitemap.xml` (gốc, `privacy.html`, trang nội dung mới nếu
  có): cần route trong `server/src/web.js` và, cho bản Pages, file trong `caro/`;
- **trang nội dung tĩnh lập chỉ mục được** (vd "Luật cờ caro", "Caro và Gomoku khác nhau thế nào", "Chiến thuật mở đầu"): SPA
  một URL khó xếp hạng theo từ khoá; nêu trang nào đáng làm, dựa vào bảng 2.6-B;
- `/?t=`, `/?o=`, `/?replay=`: `noindex` hay để index (trùng nội dung, vô hạn URL); hồ sơ người chơi có nên có URL công khai
  (cân nhắc riêng tư: **mặc định KHÔNG**, chỉ hỏi Minh);
- mô tả `manifest.webmanifest` bằng tiếng Việt; có `<h1>` và văn bản đọc được khi chưa chạy JS (khung tĩnh / `<noscript>`); tốc độ
  (từ RUM).

**Bước 5. Hướng dẫn cho Minh (Search Console / Bing)**: **Minh sở hữu việc xác minh; Laplace chỉ soạn hướng dẫn** từng bước
kèm ảnh minh hoạ (che thông tin riêng):
- Google Search Console: tạo property kiểu **Tiền tố URL** `https://caroxo.duckdns.org/` (DuckDNS là tên miền phụ nên không xác minh qua
  DNS được); ghi cách xác minh bằng **thẻ `meta`** hoặc **tệp HTML** và nói rõ phần Claude phải thêm vào repo / máy chủ, với chỗ
  trống `<MÃ DO MINH CUNG CẤP>`; thêm tương tự cho `ddnsgeek` và GitHub Pages nếu cần; gửi sitemap khi có; chỉ ra các báo cáo
  "Hiệu suất", "Lập chỉ mục trang", "Trải nghiệm trang", "Dữ liệu có cấu trúc".
- Bing Webmaster Tools: thêm site (có nhập từ Search Console), xác minh, gửi sitemap; ghi IndexNow có đáng dùng không.
- Mã xác minh **chỉ gửi riêng cho Claude qua Minh** để đưa vào code; không để trong báo cáo chung.

## 2.4 Cách đo / kiểm

- **Đường cơ sở ngay bây giờ (tuần 0)**: Minh xác minh Search Console, xuất số liệu 28 ngày (hoặc ghi "chưa có dữ liệu"); ghi số
  trang đã lập chỉ mục, hiển thị, nhấp, CTR, vị trí trung bình cho 10 từ khoá chính.
- **Đo lại sau 4 tuần** kể từ ngày Claude đưa bản sửa lên (Claude báo ngày): cùng bảng, cùng cách lấy số; thêm số trang vào
  chỉ mục, rich result hợp lệ, bản trùng còn trong chỉ mục.
- Không kết luận sớm hơn 4 tuần; ghi rõ nếu giữa chừng có việc khác làm lệch số (đăng bài, chiến dịch…).

## 2.5 Tiêu chí đạt

- Bảng hiện trạng đủ các URL ở bước 1 (không bỏ ô trống; "không có" cũng là một giá trị).
- Bảng từ khoá >= 15 cụm, mỗi cụm có nguồn + dấu **[ƯỚC LƯỢNG]** khi là khoảng / suy luận.
- Danh sách thay đổi có **P0 / P1 / P2**, mỗi dòng có file và nội dung cụ thể; P0 tối đa ~6 dòng (làm được trong 1 PR).
- Hướng dẫn Search Console / Bing: người không chuyên làm theo được trong < 30 phút.
- Có kế hoạch đo (2.4) với ô "tuần 0" đã điền hoặc ghi lý do chưa có.

## 2.6 Mẫu báo cáo Phần 2

A. Hiện trạng (mỗi URL một dòng)

| URL | title | description | canonical | hreflang | og / twitter | JSON-LD | robots | Đã vào chỉ mục? (site:) |
|---|---|---|---|---|---|---|---|---|
| `/` | | | | | | | | |
| `/?t=…` | | | | | | | | |
| `/?replay=…` | | | | | | | | |
| `/privacy.html` | | | | | | | | |
| Bản GitHub Pages | | | | | | | | |
| `/robots.txt`, `/sitemap.xml` | (mã HTTP / nội dung) | | | | | | | |

B. Từ khoá

| Cụm | Lượng tìm / tháng VN | Nguồn + ngày | Số thật / ƯỚC LƯỢNG | Xu hướng (Trends) | Ý định | Cạnh tranh (SERP) | Trang ta nên nhắm tới |
|---|---|---|---|---|---|---|---|
| cờ caro online | | | | | | | |

C. Thay đổi đề xuất cho Claude

| # | Ưu tiên | Việc | File | Bằng chứng / nguồn | Rủi ro |
|---|---|---|---|---|---|
| 1 | P0 | Thêm `canonical` + `og:*` cho trang gốc | `caro/index.html` | | |
| 2 | P0 | Thêm `robots.txt` + `sitemap.xml` | `server/src/web.js`, `caro/` | | |

D. Đối thủ: top 5 mỗi cụm (tên miền, loại trang, title, mô tả, rich result).

E. Đo lường

| Chỉ số | Tuần 0 (ngày) | Tuần 4 (ngày) | Ghi chú |
|---|---|---|---|
| Trang đã lập chỉ mục | | | |
| Hiển thị / nhấp / CTR (28 ngày) | | | |
| Vị trí TB "cờ caro online" | | | |
| Bản trùng còn trong chỉ mục | | | |

## 2.7 Giới hạn và điều KHÔNG được làm (Phần 2)

- Không xác minh quyền sở hữu, không đăng nhập thay Minh vào Search Console / Bing / Google Ads, không tạo tài khoản dưới tên Minh.
- Không mua / đặt backlink, không đăng bình luận hay bài quảng cáo, không dùng dịch vụ "tăng hạng", không nhồi từ khoá.
- Không đề xuất ẩn chữ, cloaking (trả nội dung khác cho Googlebot) hay trang cổng chỉ để SEO; mọi trang mới phải thật sự có ích.
- Không chạy công cụ quét tự động nặng vào máy chủ chính (đo vài lần ở trang công khai); không gọi dồn `/api/rum`.
- Không đưa tên thật, email, ID người chơi (hồ sơ, ván đã lưu) vào báo cáo; số liệu Search Console chỉ gộp tổng.
- Không chốt lượng tìm từ một công cụ: ghi nguồn, ngày, và gắn **[ƯỚC LƯỢNG]** nếu là khoảng.

---

## Nộp lại

Hai mục riêng: "Báo cáo Zalo Mini App" (bảng 1.6) và "Báo cáo SEO" (bảng 2.6), kèm ảnh chụp. Kẹt vì cần tài khoản / quyền của
Minh thì **dừng phần đó, ghi rõ, làm tiếp phần còn lại**. Claude đọc báo cáo, mở các mục P0 thành PR và báo ngày để Laplace đo
lại sau 4 tuần.
