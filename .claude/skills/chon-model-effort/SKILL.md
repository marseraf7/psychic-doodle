---
name: chon-model-effort
description: Kiểm model và mức effort người dùng đang đặt có hợp với việc sắp làm không, trước khi bắt đầu bất kỳ việc nào trong repo Cờ Caro. Đặt sai (yếu quá hoặc phí quá) thì KHÔNG làm, cảnh báo ngay và chỉ cách đổi (/model, /effort). Dùng ở đầu mỗi việc mới, khi người dùng đổi model / effort, khi giao việc cho subagent, và cho mọi model ra sau này (Claude 5.x, 6.x…).
---

# Chọn model và effort

Nguồn: "Choosing a Claude model and effort level in Claude Code" (claude.com, 7/2026); "Using Claude Code: Spending your
effort" (claude.dev, 25/9/2026); tài liệu Claude Platform "Effort", "Prompting Claude Opus 5.5".

## 0. Luật bắt buộc (người dùng yêu cầu)

Trước khi bắt đầu một việc mới, Claude Code phải đối chiếu **model + effort đang đặt** với **mức việc cần** (mục 3).
**Lệch thì dừng.** Không gọi công cụ nào làm thay đổi gì (sửa file, commit, push, mở PR/Issue, chạy lệnh tốn tài
nguyên). Trả lời ngay bằng một cảnh báo theo mẫu ở mục 4, rồi chờ.

- Lệch cả hai chiều đều phải cảnh báo:
  - **yếu quá** (model nhỏ hoặc effort thấp cho việc khó / quan trọng): dễ sai, bỏ sót.
  - **phí quá** (effort `xhigh`/`max` hoặc model lớn nhất cho việc vặt): tốn token, chậm.
- Chỉ làm tiếp khi người dùng đã đổi cho đúng, **hoặc** nói rõ "cứ làm với mức này". Khi đó ghi một dòng
  "Làm theo mức bạn chọn: …" rồi làm. Lời đồng ý này chỉ áp dụng cho việc đó, không áp dụng cho việc sau.
- Được phép trước khi cảnh báo: đọc file / tra cứu chỉ để **ước lượng** việc khó cỡ nào. Không làm phần việc thật.
- Việc đang làm dở mà người dùng đổi model / effort: kiểm lại ngay, lệch thì dừng ở bước an toàn gần nhất rồi cảnh báo.

## 1. Biết đang dùng model / effort nào

- **Model**: gọi `get_session` (máy chủ claude-code-remote, không truyền `session_id`), đọc `session_context.model` và
  `external_metadata.last_served_model`. Hai giá trị khác nhau nghĩa là đã bị chuyển model (fallback): nói cho người dùng biết.
  Không có công cụ này thì dùng ID model ghi trong prompt hệ thống và nói rõ model thực chạy có thể khác.
- **Effort**: lấy từ mức người dùng đặt (`/effort`, thanh trạng thái, cấu hình phiên). Không biết chắc thì không đoán.
  Với việc cần `high` trở lên (mục 3), hỏi người dùng xác nhận effort trước khi làm.

## 2. Hai núm khác nhau

- **Model là mức giỏi**: biết được bao nhiêu. **Effort là mức kỹ**: đọc bao nhiêu file, kiểm lại bao nhiêu, tự đi bao
  xa trước khi hỏi lại. Cùng lệnh "sửa test hỏng": effort thấp ~400 token (đọc test → sửa → xong); effort cao ~2.800
  token (đọc test, nguồn, cấu hình → nghĩ → sửa → chạy test → đọc lại kiểm), tức khoảng 7 lần token, đổi lại kết quả chắc hơn.
- Kết quả sai thì hỏi vì sao:
  - **Chưa đủ cố gắng** (bỏ sót file, không chạy test) → tăng effort.
  - **Chưa đủ hiểu biết** (đủ ngữ cảnh, đã thử, vẫn sai) → dùng model lớn hơn.
- Effort cao bắt được ca biên và lỗi sót, nhưng **không cứu được hướng làm sai**.
- Muốn cắt bớt suy nghĩ thì hạ effort trước; cách này chắc hơn là dặn trong prompt.
- Không mang nguyên mức effort đã dùng cho model cũ sang model mới. Model mới phải tự đo lại.
- Số liệu tham khảo (Terminal-Bench 3.0): Opus 5.5 ở `high` ≈ Fable 5.1 ở `max` (58,9% so với 58,0%), mà tốn một nửa token.
  Lên effort cao lời nhiều nhất ở Bảo mật (64→87%) và Phần cứng (34→75%); Phần mềm 43→56%; Vận hành chỉ 12→22%.

## 3. Mức nào cho việc nào (repo Cờ Caro)

| Effort | Khi nào | Ví dụ trong repo |
|---|---|---|
| `low` | Subagent, việc đơn giản / số lượng lớn | đổi tên, sửa chữ, tóm tắt log, tạo Issue theo mẫu, merge PR đã xanh |
| `medium` | **Mặc định**: bắt đầu từ đây và đặt rõ | tính năng giao diện nhỏ, chuỗi dịch, sửa lỗi đã rõ nguyên nhân, review báo cáo của Antigravity |
| `high` | Suy luận phức tạp, code khó | engine / Rapfi / NNUE / thuật toán, máy chủ có tranh chấp bất đồng bộ, **bảo mật / đăng nhập / mật khẩu / dữ liệu người dùng**, tìm nguyên nhân gốc CI, test chập chờn |
| `xhigh` | Việc dài hơi, **đã đo thấy có lợi** | điều tra nhiều vòng (như WebKit sập), tái cấu trúc nhiều file |
| `max` | Suy luận sâu nhất, **đã đo thấy có lợi** | chỉ khi `high`/`xhigh` đã thử mà vẫn chưa đủ |

Model, xếp theo **tầng** chứ không theo tên, để áp dụng được cho model ra sau này:
- **Tầng nhỏ** (họ Haiku, hoặc model mới tự giới thiệu là nhanh / rẻ): chỉ dùng cho việc `low`.
- **Tầng giữa** (họ Sonnet): việc `low`–`medium`; việc `high` thì nên lên tầng lớn.
- **Tầng lớn** (họ Opus, Fable): việc `medium` trở lên. Dùng cho việc vặt thì cảnh báo "phí quá".
- **Model mới, chưa rõ tầng**: xếp theo họ tên; số phiên bản lớn hơn thì mạnh hơn bản cũ cùng họ. Vẫn không rõ thì
  tra tài liệu (skill `claude-api`, mục model). Tra rồi vẫn không chắc thì cảnh báo, nêu điều chưa rõ, và hỏi
  người dùng trước khi làm việc `high`.

Quy tắc ghép:
- Việc `high` mà effort ≤ `medium`, **hoặc** model tầng nhỏ → yếu quá.
- Việc `low`/`medium` mà effort `xhigh`/`max` → phí quá. Đặt `xhigh`/`max` mà chưa có số đo cho thấy có lợi → nhắc.
- Cách làm gợi ý cho việc lớn: **dựng ở mức thấp, kiểm ở mức cao**. Hỏi rõ yêu cầu → làm ở `low`/`medium` → review → kiểm và
  chạy test ở `high`.
- Muốn ít phải theo dõi: `low` cho nhanh để làm nhiều vòng. Muốn tự làm được nhiều hơn: effort cao hơn, kèm theo model sẽ tự
  giả định nhiều hơn.
- Subagent (công cụ Agent): chỉ đặt `effort` khi người dùng yêu cầu. Việc giao subagent là việc `low`.

## 4. Mẫu cảnh báo

> ⚠️ **Chưa làm – model / effort chưa hợp với việc này.**
> - Đang đặt: `<model>` · effort `<mức>`
> - Việc: <một dòng> → cần `<mức>` (<lý do theo bảng mục 3>)
> - Rủi ro nếu giữ nguyên: <yếu quá: dễ bỏ sót … / phí quá: tốn ~N lần token>
> - Đổi: `/effort <mức>` và/hoặc `/model <model>`, rồi nhắn lại. Hoặc trả lời "cứ làm" để làm với mức hiện tại.

Ngắn gọn, đặt ở đầu câu trả lời, không kèm phần việc nào đã làm.
