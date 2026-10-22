# Báo cáo Issue #62 — Đo tốc độ phân tích Rapfi theo số nút (PR #60)

## Kết luận

- **Phần máy tính đối chiếu: ĐÃ ĐO** trên máy ảo của Baxter (xem "Môi trường") bằng đúng script trong Issue, 2 lần (cache lạnh / cache nóng). Kết quả: `cham` từ **0,74 (Renju) đến 1,54 (Tự do)** ở cả hai lần; một thế theo số nút tối đa **417 ms** — còn xa giới hạn cứng 1.500 ms và vùng lo ngại `cham` > 3. Trên máy yếu hơn điện thoại tầm trung hiện nay thì chưa thể kết luận — đó là lý do phần điện thoại vẫn bắt buộc.
- **Phần điện thoại thật: CHƯA ĐO.** Baxter không có thiết bị thật (không máy nào ghép nối, không đường USB tới điện thoại). Theo đúng yêu cầu của Issue — dẫn chứng phải là quan sát thật trên máy, không ước lượng thay đo — phần này để trống kèm **bộ kit đo ở cuối báo cáo** để Minh hoặc Antigravity chạy tiếp trên máy thật. PR này **không** đóng Issue #62.

## Môi trường đã đo (phần máy tính)

| Hạng mục | Giá trị |
| --- | --- |
| Máy | Máy ảo Linux của Baxter — AMD EPYC 9D25, 2 vCPU (không phải máy tính cá nhân Windows 11 trong kế hoạch của Antigravity; số này chỉ để đối chiếu thêm) |
| Trình duyệt | Chromium 141.0.7390.37 (headless, qua Playwright), UA: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36 |
| Số lõi / bộ nhớ trang thấy | cores = 2, deviceMemory = 8 (giới hạn API) |
| crossOriginIsolated | `false` — ngữ cảnh headless không có cross-origin isolation nên Rapfi chạy **1 luồng** (`mt: false`); các số dưới đây là tốc độ 1 luồng |
| Mã nguồn | Nhánh `claude/elegant-volta-l9vci2` @ `f703137` (sau commit `5da9b4d` của PR #60, đúng yêu cầu Issue) |
| Máy chủ | `cd server && npm start` tại máy này, cổng 8080; trang mở ở `http://localhost:8080` |
| Điều kiện | Không cắm sạc (máy ảo); không áp dụng các bước giữ mát/tắt app của điện thoại |

## Kết quả — máy ảo của Baxter

**Lần 1 — profile mới (mạng Rapfi luật Việt Nam nạp từ file sẵn trong repo; mạng free/renju nạp từ bản sao đặt tại máy chủ local, xem ghi chú môi trường)**

| Luật | Số nước | Một thế theo số nút (ms) | Một thế theo giờ (ms) | `cham` | ms/thế khi chấm cả ván | Cả ván (giây) | Số thế chấm được |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Việt Nam | 30 | 298 | 234 | 1.1 | 500 | 17.9 | 31 |
| Tự do | 30 | 403 | 281 | 1.49 | 500 | 17.2 | 31 |
| Renju | 28 | 199 | 253 | 0.74 | 500 | 9 | 29 |

**Lần 2 — cùng profile, đã có cache**

| Luật | Số nước | Một thế theo số nút (ms) | Một thế theo giờ (ms) | `cham` | ms/thế khi chấm cả ván | Cả ván (giây) | Số thế chấm được |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Việt Nam | 30 | 269 | 249 | 1 | 500 | 16.7 | 31 |
| Tự do | 30 | 417 | 279 | 1.54 | 500 | 17.1 | 31 |
| Renju | 28 | 203 | 259 | 0.75 | 500 | 9.3 | 29 |


> **Ghi chú môi trường quan trọng (lần 1):** mạng NNUE cho luật **Tự do** và **Renju** không có sẵn trong repo. Bộ nạp thử theo thứ tự: (1) máy chủ game tại `/rapfi/nets/…` → **404** (máy chủ không chứa mạng — khớp phát hiện trước đây); (2) `cdn.jsdelivr.net` và (3) `raw.githubusercontent.com` → trình duyệt trên máy này đều lỗi `ERR_TUNNEL_CONNECTION_FAILED` (đường truyền qua proxy của máy ảo), dù tải bằng dòng lệnh trên cùng máy vẫn được (HTTP 200). Để đo được, 3 tệp mạng (tổng ~30 MB, đúng commit `e32ad77` như bộ nạp chỉ định) đã được tải bằng dòng lệnh và đặt vào thư mục `caro/rapfi/nets/` của bản checkout đo để máy chủ local tự phục vụ. Các trường số đo của script đều là **thời gian tính toán thuần** (thời gian tải mạng nằm ở bước chờ sẵn sàng, không tính vào `motThe_*` hay `caVan_*`), nên việc nạp mạng local không làm sai lệch các số đã báo; đổi lại "lần 1" ở đây không phản ánh thời gian chờ tải 40 MB qua mạng thật — điểm này chỉ ảnh hưởng trải nghiệm chờ, không ảnh hưởng quyết định về ngân sách nút. Luật **Việt Nam** dùng mạng sẵn trong repo (`model-caro.bin`) nên không liên quan.
> Tính lặp lại: dãy nước `van` của cả 3 luật **giống hệt nhau giữa lần 1 và lần 2**, và độ dài ván (30 / 30 / 28 nước) khớp đúng ván chuẩn trong Issue — phép đo theo số nút cho cùng một ván trên cùng một máy ở cả hai lần chạy.

Đối chiếu với số của Claude Code trong Issue (Chromium 141 headless, 4 lõi): Việt Nam `cham` 0,83–0,88; Tự do 1,30–1,61; Renju 0,75–0,81. Ván dùng để đo (`van` trong dòng `XONG`) phải giống nhau trên mọi máy — đã đối chiếu ở ghi chú dưới từng bảng.

**Đo bằng tay (bước 6):** chưa đo tay trên máy này (số đo tay là tiêu chí bắt buộc cho điện thoại; hàng đối chiếu của Claude Code trong Issue cũng không có số đo tay).

**Lỗi Console / sập trang khi đo:** Không có lỗi đỏ (pageerror) nào trong cả 2 lần chạy; trang không sập. Sự cố duy nhất nằm ở khâu tải mạng trước khi đo — xem ghi chú môi trường.

## Bảng tóm tắt (máy × luật)

| Máy | Luật | `cham` | Cả ván (giây) | Chạm giới hạn cứng 1.500 ms? |
| --- | --- | --- | --- | --- |
| Máy ảo Baxter (lần 1) | Việt Nam | 1,10 | 17,9 | Không (298 ms) |
| Máy ảo Baxter (lần 1) | Tự do | 1,49 | 17,2 | Không (403 ms) |
| Máy ảo Baxter (lần 1) | Renju | 0,74 | 9,0 | Không (199 ms) |
| Máy ảo Baxter (lần 2) | Việt Nam | 1,00 | 16,7 | Không (269 ms) |
| Máy ảo Baxter (lần 2) | Tự do | 1,54 | 17,1 | Không (417 ms) |
| Máy ảo Baxter (lần 2) | Renju | 0,75 | 9,3 | Không (203 ms) |
| Điện thoại Android tầm trung | — | **chưa đo** | **chưa đo** | — |
| Điện thoại Android yếu / RAM ≤ 4 GB | — | **chưa đo** | **chưa đo** | — |
| iPhone (Safari, nếu có) | — | **chưa đo** | **chưa đo** | — |

Đánh dấu ô `cham` > 3 bằng **đậm** khi điền số điện thoại.

## Dòng `XONG` nguyên văn (phần máy tính)

Lần 1 (cache lạnh):

```
{"ua":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36","cores":2,"mem":8,"iso":false,"rules":{"vn":{"nuoc":30,"soTheDo":3,"motThe_soNut_ms":298,"motThe_theoGio_ms":234,"cham":1.1,"caVan_ms_moiThe":500,"caVan_giay":17.9,"soThe":31,"van":"0,0 1,0 -1,-1 1,1 0,-1 1,-1 1,-2 0,1 -1,0 -2,1 -1,1 -1,2 -2,3 1,2 1,4 2,-3 2,-1 0,-3 0,2 -2,0 0,3 -3,3 0,5 -2,-1 -2,-3 -1,-2 1,-4 -3,0 -4,1 -3,2"},"free":{"nuoc":30,"soTheDo":3,"motThe_soNut_ms":403,"motThe_theoGio_ms":281,"cham":1.49,"caVan_ms_moiThe":500,"caVan_giay":17.2,"soThe":31,"van":"0,0 0,-1 -2,-1 -2,0 -1,-2 -3,0 -1,0 -1,1 -3,-1 -3,-2 -1,-3 -1,-4 -4,-1 -5,-1 1,-3 0,-3 1,-2 2,-2 1,-1 1,0 2,-4 0,-2 1,-5 1,-4 0,-4 -2,-2 0,-6 -1,-7 2,-6 3,-7"},"renju":{"nuoc":28,"soTheDo":3,"motThe_soNut_ms":199,"motThe_theoGio_ms":253,"cham":0.74,"caVan_ms_moiThe":500,"caVan_giay":9,"soThe":29,"van":"0,0 0,-2 -1,0 1,0 -2,-1 1,-1 0,1 1,2 1,1 -1,-3 2,0 1,-3 -1,-1 -2,-2 -3,-2 -4,-3 2,1 1,-2 1,-4 2,-2 -1,-2 3,-2 4,-2 -2,-4 -3,-5 3,1 0,-3 2,-5"}}}
```

Lần 2 (đã có cache):

```
{"ua":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36","cores":2,"mem":8,"iso":false,"rules":{"vn":{"nuoc":30,"soTheDo":3,"motThe_soNut_ms":269,"motThe_theoGio_ms":249,"cham":1,"caVan_ms_moiThe":500,"caVan_giay":16.7,"soThe":31,"van":"0,0 1,0 -1,-1 1,1 0,-1 1,-1 1,-2 0,1 -1,0 -2,1 -1,1 -1,2 -2,3 1,2 1,4 2,-3 2,-1 0,-3 0,2 -2,0 0,3 -3,3 0,5 -2,-1 -2,-3 -1,-2 1,-4 -3,0 -4,1 -3,2"},"free":{"nuoc":30,"soTheDo":3,"motThe_soNut_ms":417,"motThe_theoGio_ms":279,"cham":1.54,"caVan_ms_moiThe":500,"caVan_giay":17.1,"soThe":31,"van":"0,0 0,-1 -2,-1 -2,0 -1,-2 -3,0 -1,0 -1,1 -3,-1 -3,-2 -1,-3 -1,-4 -4,-1 -5,-1 1,-3 0,-3 1,-2 2,-2 1,-1 1,0 2,-4 0,-2 1,-5 1,-4 0,-4 -2,-2 0,-6 -1,-7 2,-6 3,-7"},"renju":{"nuoc":28,"soTheDo":3,"motThe_soNut_ms":203,"motThe_theoGio_ms":259,"cham":0.75,"caVan_ms_moiThe":500,"caVan_giay":9.3,"soThe":29,"van":"0,0 0,-2 -1,0 1,0 -2,-1 1,-1 0,1 1,2 1,1 -1,-3 2,0 1,-3 -1,-1 -2,-2 -3,-2 -4,-3 2,1 1,-2 1,-4 2,-2 -1,-2 3,-2 4,-2 -2,-4 -3,-5 3,1 0,-3 2,-5"}}}
```

---

## Bộ kit đo trên điện thoại thật (cho người cầm máy)

Làm đúng các bước của Issue #62; tóm tắt rút gọn:

1. Trên máy tính: lấy code nhánh `claude/elegant-volta-l9vci2`, chạy `cd server && npm ci && npm start` (cổng 8080).
2. Điện thoại Android: bật **Gỡ lỗi USB**, cắm cáp. Trên Chrome máy tính mở `chrome://inspect` → **Port forwarding** thêm `8080 → localhost:8080`. Trên điện thoại mở **`http://localhost:8080`** (bắt buộc localhost — mở bằng IP LAN sẽ sai số vì không có Cache Storage). Ở `chrome://inspect` bấm **inspect** vào đúng tab đó.
3. Trước khi đo: pin > 50% hoặc cắm sạc (ghi rõ), tắt app khác, để máy nguội ~5 phút, giữ màn hình sáng và tab ở trước suốt lúc đo.
4. Dán nguyên script đo trong Issue #62 vào Console, chờ dòng `XONG`. Chép nguyên dòng `XONG …` (hoặc gõ `copy(JSON.stringify(window.__phoneBench))`).
5. Tải lại trang, chạy lần 2, chép dòng `XONG` lần 2.
6. Đo tay: đấu với BOAT luật tự do ~20 nước → Xem lại → **Phân tích**, bấm giờ từ lúc bấm tới khi dòng "đang phân tích kỹ hơn" biến mất. Ghi số giây.
7. Chụp ảnh Console có dòng `XONG`.
8. Gửi lại cho Baxter (dán vào chat hoặc vào Issue): **tên máy, RAM, phiên bản Chrome, % pin, có cắm sạc không, 2 dòng `XONG` nguyên văn, số giây đo tay, ghi chú lỗi đỏ trong Console / trang sập / máy nóng giật, ảnh Console**. Baxter sẽ điền vào bảng tóm tắt, cập nhật báo cáo này và hoàn tất PR.

**Tiêu chí xong của Issue (nhắc lại):** mỗi máy đủ 2 dòng `XONG` + 1 số giây đo tay + thông tin máy; bảng tóm tắt đánh dấu ô `cham` > 3 và ô `motThe_soNut_ms` gần 1.500 ms; có ảnh Console.

Agent: baxter (phần máy tính + bộ kit); phần điện thoại: chờ người cầm máy thật.
