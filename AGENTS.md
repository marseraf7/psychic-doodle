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
sửa cùng file, bên này làm xong và merge trước, bên kia **merge nhánh chính
vào nhánh của mình** (không rebase, không force-push nhánh đã đẩy) rồi mới
làm tiếp. Hoặc để tăng `CACHE` ở bước cuối khi gộp.

### Vai trò

| Ai | Phụ trách |
| -- | --------- |
| Người dùng | Giao việc, quyết định hướng đi, có quyền dừng mọi việc |
| Claude Code (Quản trị viên) | Server, engine, Rapfi/NNUE, thuật toán; sửa lỗi CI, đọc log; **review và merge PR** |
| Antigravity | Debug, soi code, review PR của Claude Code; nhận việc phụ được giao |
| Gemini (qua MCP) | Ý kiến thứ hai khi được hỏi; không tự đẩy code |

### Review chéo và merge

- Agent này viết → agent kia review PR.
- Claude Code merge khi: 5 check bắt buộc xanh, không còn nhận xét chặn
  chưa xử lý, PR đúng phạm vi Issue. Thay đổi `.github/`, quyền truy cập,
  bí mật hay phụ thuộc mới thì hỏi người dùng trước.
- Antigravity **không tự merge** vào nhánh chính.
- Nhánh chính được bảo vệ: chỉ vào qua PR, cấm force-push, cấm xoá.

### Vòng làm việc

Giao việc → Plan → Output → Review → Sửa lỗi → Cập nhật luật → giao việc tiếp.

1. **Giao việc**: mở Issue bằng mẫu *Nhiệm vụ cho agent*, gắn nhãn
   `agent:claude` / `agent:agy` / `agent:gemini`.
2. **Plan**: agent nhận việc bình luận kế hoạch ngắn vào Issue trước khi code.
3. **Output**: PR từ nhánh riêng, mô tả theo mẫu PR, ghi `Closes #<số Issue>`.
4. **Review**: agent còn lại review; lỗi chặn đánh dấu 🔴, gợi ý nhỏ 🟡.
5. **Sửa lỗi**: commit thêm vào cùng PR, không mở PR mới.
6. **Cập nhật luật**: bài học rút ra ghi vào file này hoặc `CLAUDE.md`.

### Nộp kết quả qua PR (để Claude Code tự nhận, không cần người dùng chuyển lời)

Claude Code chỉ tự thức dậy theo sự kiện của **PR** (bình luận, review, CI), không theo Issue. Vì vậy:

- Việc có sửa code → PR như thường, ghi `Closes #<số Issue>`.
- Việc **chỉ báo cáo** (đo, audit, chạy test, review không sửa code) → mở một PR nhỏ thêm file
  `reports/<số-issue>-<tên-ngắn>.md` (nhánh `agy/report-<số-issue>`), ghi `Closes #<số Issue>`.
  Claude Code đọc, xử lý, rồi merge hoặc đóng PR báo cáo.
- Review PR của Claude Code → bình luận thẳng trên PR đó.

### Báo cáo gọn (tiết kiệm token cho agent đọc)

- Mở đầu bằng **kết luận 1–3 dòng**, sau đó là **bảng** (lệnh / số lần chạy / số lần lỗi / ghi chú).
- PR có thêm / sửa test: dán **dòng kết quả cuối** của từng lần chạy (`Tất cả đạt` / `N bước KHÔNG đạt`) cho mỗi
  trình duyệt đã chạy. Chưa chạy hết bài thì ghi rõ "chưa chạy", không tự đánh dấu đạt.
- **Không dán log dài.** Mỗi lỗi chỉ trích: bước `OK` cuối cùng, dòng lỗi, tối đa 20 dòng log liên quan.
  Bỏ dòng rác (ALSA, libEGL, MESA, git config…).
- Ghi rõ môi trường: hệ điều hành, trình duyệt + phiên bản, commit đã chạy (`git rev-parse --short HEAD`).
- Trên CI, lỗi e2e có sẵn annotation (`::error`): đọc qua
  `gh api repos/<owner>/<repo>/check-runs/<id>/annotations` thay vì tải cả log.
- Việc chưa làm được / không chắc → ghi rõ "chưa kiểm" thay vì đoán.

### Ghi danh tính

Các agent có thể dùng chung tài khoản GitHub, nên mỗi commit ghi dòng cuối
cho biết agent nào viết, ví dụ `Agent: agy` hoặc `Co-Authored-By: Claude …`.

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
