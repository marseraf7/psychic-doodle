# Hướng dẫn cho mọi AI agent làm việc trên repo này

> File này dành cho cả Claude Code, Antigravity (Gemini), và bất kỳ agent nào
> khác mở thư mục dự án. Nội dung dưới đây là **bắt buộc**.

## 1. Đọc luật dự án trước khi làm bất cứ gì

- Đọc [`CLAUDE.md`](CLAUDE.md) – luật chính, áp dụng cho mọi agent.
- Đọc [`.claude/skills/chia-file-hub/SKILL.md`](.claude/skills/chia-file-hub/SKILL.md) – quy tắc chia file và hub.
- Trả lời / báo cáo bằng **tiếng Việt**; chú thích code bằng tiếng Việt.

## 2. Quy tắc cộng tác nhiều agent

### Nhánh

| Agent | Tiền tố nhánh | Ví dụ |
| ----- | ------------- | ----- |
| Claude Code | `claude/…` | `claude/adoring-ritchie-ra610s` |
| Antigravity | `agy/…` | `agy/fix-mobile-layout` |

- **Không bao giờ** hai agent cùng đẩy lên một nhánh.
- Mỗi việc một PR nhỏ, chỉ một chủ đề. CI là trọng tài chung.

### Vùng file – tránh xung đột

Các file dễ xung đột nhất:

| File | Lý do |
| ---- | ----- |
| `caro/sw.js` | Số `CACHE` phải tăng mỗi lần đổi file trong `caro/` |
| `caro/index.html` | Thứ tự `<script>` |
| `caro/i18n-*.js` | Chuỗi dịch 4 ngôn ngữ |

Quy tắc: **mỗi lúc chỉ một agent được sửa một vùng**. Nếu cả hai cần
sửa cùng file, bên này làm xong và merge trước, bên kia rebase rồi mới
làm tiếp. Hoặc để tăng `CACHE` ở bước cuối khi gộp.

### Review chéo

- Agent này viết → agent kia review PR.
- Người dùng (bạn) là người quyết định merge cuối cùng.
- **Không tự merge** nếu người dùng chưa cho phép.

### Viết nhiệm vụ rõ ràng

Khi giao việc cho agent, nêu rõ:
1. File nào được sửa.
2. Tiêu chí xong là gì.
3. Lệnh kiểm thử: `cd server && npm run coverage`, `node caro/tests/e2e/<tên>.e2e.js`.

## 3. Bản quyền

- **Không** chép mã AGPL (ví dụ: Lichess).
- Giữ giấy phép GPL cho Rapfi.
- Nếu dùng thư viện bên ngoài, kiểm tra giấy phép trước.

## 4. Bảo mật

- Không bao giờ ghi mật khẩu, khoá bí mật, hay token vào file trong repo.
- Dùng biến môi trường hoặc GitHub Secrets cho thông tin nhạy cảm.
