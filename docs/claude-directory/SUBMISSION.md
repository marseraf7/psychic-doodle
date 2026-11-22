# Nộp connector "Caro x Gomoku" vào thư mục connector của Claude – từng bước cho chủ dự án

Tài liệu gốc (đọc lại 20/11/2026): claude.com/docs/connectors/building/submission, …/review-criteria,
…/authentication, …/mcp-apps/getting-started, …/mcp-apps/design-guidelines. Nội dung để dán: `listing.md` (cùng thư mục).

## 0. Trước khi nộp (bắt buộc)

1. **Triển khai máy chủ mới** (nhánh có `server/src/mcp/`): `cd server && npm ci --omit=dev` (thêm 4 gói:
   `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/ext-apps` 2.0.4, `@modelcontextprotocol/client` 2.4.0,
   `zod` 4.6.7) rồi khởi động lại như thường lệ. Không cần biến môi trường mới. Tuỳ chọn:
   - `CARO_MCP=0` tắt connector; `CARO_MCP_WORKERS` (mặc định 1) số luồng máy cờ; `CARO_MCP_RATE` (mặc định 240)
     lần / phút / IP; `CARO_MCP_ORIGINS` thêm Origin được phép; `CARO_MCP_URL` nếu địa chỉ công khai không phải
     `https://caroxo.duckdns.org/mcp` (dùng để tính `ui.domain`).
   - Caddy / nginx: chỉ cần chuyển tiếp `POST /mcp` như các đường dẫn khác (không cần WebSocket, không SSE dài hạn).
2. **Kiểm từ ngoài vào** (máy bất kỳ):
   ```bash
   curl -s https://caroxo.duckdns.org/mcp -H 'content-type: application/json' \
     -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
   ```
   Phải thấy `"serverInfo":{"name":"caro-x-gomoku"…}`. Mở `https://caroxo.duckdns.org/connector.html` và
   `https://caroxo.duckdns.org/privacy.html#claude-en` trên trình duyệt.
3. **Thử bằng MCP Inspector**: `npx @modelcontextprotocol/inspector` → Transport "Streamable HTTP", URL ở trên →
   Connect → Tools: gọi đủ 6 tool (dùng các câu mẫu bên dưới).
4. **Thử trong Claude như custom connector** (cổng nộp hỏi xác nhận việc này ở bước Test & launch):
   Claude → Settings → Connectors → **Add custom connector** → tên `Caro x Gomoku`, URL `https://caroxo.duckdns.org/mcp`.
   Mở cuộc trò chuyện mới, bật connector, chạy lần lượt 6 câu mẫu; với `play_caro` chạm vài ô trên bàn cờ, bấm Đi lại,
   Ván mới, đổi mức; với bài đố bấm Xem lời giải. Thử cả giao diện sáng / tối và trên điện thoại.
   - Nếu Claude báo lỗi thay vì hiện bàn cờ: xem mục "ui.domain" ở dưới.

## 1. Điền cổng nộp – claude.ai/directory/manage → Submit new → MCP connector

| Bước | Điền |
| --- | --- |
| 1. Connection | URL `https://caroxo.duckdns.org/mcp` (một URL cho mọi người dùng) |
| 2. Tools | Tự đồng bộ: 6 tool, tất cả nhóm **read-only**, đều có `title` – không có cảnh báo thiếu chú thích |
| 3. Listing | Tên, một dòng, mô tả, hạng mục, Documentation URL, Privacy policy URL, Support contact, icon, slug: chép từ `listing.md`. Icon: `icon-512.png` |
| 4. Use cases | Chép mục "Use cases" trong `listing.md`; chọn **Reads data** |
| 5. Company | Tên: Caro x Gomoku (cá nhân); website `https://caroxo.duckdns.org`; người liên hệ: email của chủ dự án (chỉ Anthropic thấy, không công khai) |
| 6. Authentication | **No authentication** (dữ liệu công khai, không có tài khoản) |
| 7. Data handling | API của chính mình (first-party); không xử lý dữ liệu sức khoẻ; không có nội dung tài trợ |
| 8. Test & launch | Xác nhận đã chạy mọi tool qua MCP Inspector và custom connector (bước 0.3–0.4). Không ghi mật khẩu nào |
| 9. Compliance | Đánh dấu đủ 7 mục: không chuyển tiền, không tạo ảnh / video / âm thanh bằng AI, không chèn lệnh cho mô hình, không thu thập hội thoại, có tài liệu công khai… – đều đúng với connector này |
| Ảnh carousel | 5 file `1-…png` – `5-…png` (PNG rộng 1120 px, đã cắt sát ứng dụng, không kèm câu hỏi); câu hỏi đi kèm từng ảnh: bảng trong `listing.md` |
| Allowed link URIs (tuỳ chọn) | `https://caroxo.duckdns.org` (nút "Play full game" mở link này – khai báo để người dùng không phải xác nhận) |

## 2. Câu mẫu để thử (đều đã chạy được trên máy thử, xem báo cáo kiểm thử)

1. "Let's play Caro. I'll be X." → bàn cờ trống, chạm ô để đi.
2. "Play Gomoku with me on hard, freestyle rules, you go first." → máy đi [0,0].
3. "Give me today's Caro puzzle." → bài của ngày; chạm ô trả lời; "Show solution".
4. "In this game X played [0,0],[1,1],[1,0] and O played [2,0],[0,1]. What should O play?" → gợi ý + lý do.
5. "What are the rules of Renju and how is it different from Vietnamese Caro?"
6. "Who are the top 5 blitz players on caroxo.duckdns.org?" (máy chủ thật phải có người chơi xếp hạng; chưa có thì
   tool trả "…: no ranked players yet.").

## 3. Người duyệt sẽ kiểm gì (và connector đáp ứng thế nào)

- **Chú thích tool**: mọi tool có `title` + `readOnlyHint: true` (kèm `destructiveHint: false`); tên ≤ 64 ký tự;
  không có tool "gọi API tuỳ ý".
- **Mô tả**: nói tool làm gì và khi nào dùng, khớp hành vi; không có câu kiểu "luôn gọi…", "bỏ qua…", không quảng cáo.
  (Dòng link về game ở cuối kết quả là thông tin, không phải lệnh cho mô hình.)
- **Chất lượng**: tham số hợp lệ luôn trả kết quả; sai thì lời nhắn rõ (vd. "Move 2 [0,0] is on an occupied cell.",
  "The Caro engine is busy… try again in a few seconds."), không bao giờ "Internal Server Error" trơn; kết quả gọn
  (bàn chữ cắt quanh các quân, bảng xếp hạng tối đa 20 dòng).
- **Không thu thập hội thoại / dữ liệu người dùng**: không đăng nhập, không lưu gì, không ghi log IP.
- **Tên miền khớp dịch vụ**: máy chủ MCP nằm trên chính tên miền của game.
- **MCP App**: tài nguyên `ui://caro/board-v1.html` (`text/html;profile=mcp-app`), dựng bằng `registerAppTool` /
  `registerAppResource` của `@modelcontextprotocol/ext-apps`; widget dùng lớp `App` của SDK, biến màu của Claude, hỗ trợ
  sáng / tối, nút ≥ 44 px, không tải gì từ mạng (CSP rỗng).

## 4. `ui.domain` (khung cô lập của Claude)

Claude yêu cầu `_meta.ui.domain` = 32 ký tự hex đầu của SHA-256(địa chỉ máy chủ MCP) + `.claudemcpcontent.com`.
Với `https://caroxo.duckdns.org/mcp` là `27dc7540d83edbb744a080c849b084aa.claudemcpcontent.com` (máy chủ tự tính –
`server/src/mcp/widget.js`). Nếu nộp bằng địa chỉ khác (vd. có `/` ở cuối, hoặc tên miền khác) thì đặt `CARO_MCP_URL`
đúng y như địa chỉ đã dán vào cổng, khởi động lại máy chủ.

## 5. Rủi ro đã biết

- **Tên miền**: tên miền phụ miễn phí (DuckDNS) làm người duyệt đánh giá thấp độ tin cậy; mất tài khoản DuckDNS thì
  connector chết và người khác có thể chiếm tên. Khi đã mua tên miền riêng: làm theo `docs/doi-ten-mien.md`
  (`bash scripts/set-domain.sh <tên-miền>` sửa cả file này, kể cả `ui.domain` ở mục 4), rồi nộp / sửa listing bằng URL
  mới (slug và URL khó đổi sau khi đã đăng). Connector ở địa chỉ cũ vẫn chạy trong lúc chuyển (máy chủ nhận cả tên cũ).
- **Tải máy chủ**: mọi người dùng Claude gọi tới từ vài IP của Anthropic, nên giới hạn theo IP để rộng (240 / phút);
  việc tốn CPU bị chặn bằng hàng đợi máy cờ (1 luồng, tối đa 6 việc chờ, mỗi việc ≤ 1,3 giây nghĩ, huỷ cứng sau 6 giây).
  Khi đông, người dùng thấy "engine is busy" thay vì làm chậm ván online. Máy chủ mạnh hơn thì tăng `CARO_MCP_WORKERS`.
- **Biểu tượng riêng của app trong Claude** (serverInfo.icons, PNG 128 px dạng data:) chỉ hiện khi listing được nhãn
  Verified; bản Community dùng icon của listing.
- **Chưa xác nhận được**: danh sách hạng mục thực tế của cổng (tài liệu không liệt kê) – chọn gần nhất với Games /
  Education; giao thức Claude dùng khi gọi (máy chủ phục vụ cả đời 2025 không phiên lẫn đời 2026-07-28).

## 6. Sau khi nộp

Theo dõi trạng thái ở claude.ai/directory/manage. Sửa connector: chỉ cần cập nhật máy chủ (tool đồng bộ tự động); đổi
mô tả / ảnh: sửa listing trong cổng. Liên hệ khi kẹt: mcp-review@anthropic.com.
