# Văn phong và thuật ngữ – 4 ngôn ngữ (vi, en, ru, zh)

Quy tắc viết chữ giao diện cho Caro x Gomoku. Ai thêm hoặc sửa chuỗi trong `caro/i18n-*.js` thì đọc trước.
Tham khảo (chỉ học cách làm, không chép): Microsoft Localization Style Guides (tiếng Việt, Nga, Trung giản thể) và
Microsoft Terminology Collection; quy ước dịch thuật ngữ cờ của FIDE.

## Công cụ

| Việc | Lệnh |
| --- | --- |
| Bài thử tự động (chạy trong CI) | `cd server && node --test test/i18n-quality.test.js` |
| Soát chính tả – ngữ pháp en / ru / zh bằng LanguageTool | `node server/scripts/i18n-lt.js en,ru,zh --out bao-cao.md` |
| Sửa hàng loạt chuỗi từ file JSON `{ "vi": { "khoá": "chuỗi mới" } }` | `node server/scripts/i18n-set.js sua.json` |

- **LanguageTool** (mã nguồn mở, LGPL): mặc định gọi máy chủ công khai `api.languagetool.org` (giới hạn 20 lần/phút, công
  cụ tự chia nhỏ và chờ). Muốn chạy riêng: `docker run -p 8010:8010 erikvl87/languagetool` rồi thêm
  `--server http://localhost:8010`. Báo cáo có nhiều chỗ báo nhầm (tên khai cuộc tiếng Nhật, tên riêng, viết tắt cột như
  `BH`, `Поб`): chỉ sửa lỗi thật.
- LanguageTool **chưa hỗ trợ tiếng Việt**. Tiếng Việt được giữ chất lượng bằng bài thử (kiểu dấu thanh, thuật ngữ) và bảng
  thuật ngữ dưới đây.
- Bài thử `i18n-quality` bắt: thiếu khoá ở một ngôn ngữ, biến `{x}` lệch giữa các ngôn ngữ, khoá trùng tên giữa hai file
  với nghĩa khác nhau, khoảng trắng thừa, tiếng Việt lẫn hai kiểu dấu thanh, thuật ngữ cấm, tiếng Anh kiểu Anh, tiếng
  Trung dùng dấu câu nửa khổ, tiếng Nga lẫn chữ Latin trong một từ.

## Quy tắc chung

1. **Nói thẳng việc người dùng làm.** Câu ngắn, chủ động. Nút bắt đầu bằng động từ: "Tạo giải", "Lưu kết quả".
2. **Mỗi câu một ý.** Không dồn nhiều ý bằng dấu "/" hay "–" ("thêm / bớt", "đội / người"). Viết "thêm hoặc bớt",
   "đội hoặc người chơi", hoặc tách thành hai câu. Dấu "/" chỉ giữ ở nhãn cực ngắn (vd. "Điểm thắng / hoà / thua").
3. **Gợi ý (hint) trả lời câu hỏi "cái này để làm gì, khi nào dùng"**, không nhắc lại nhãn.
4. **Không nhắc tên sản phẩm khác** trong giao diện (Challonge, MyLeague…): người dùng không cần biết ta học từ đâu.
5. **Thông báo lỗi** nói rõ sai gì và cách sửa: "Link này đã có giải khác dùng. Hãy đổi link khác."
6. **Biến** viết `{tên}` và giữ nguyên ở cả 4 ngôn ngữ. Chuỗi bắt đầu bằng " · " là phần nối thêm, giữ khoảng trắng đầu.
7. Số viết bằng chữ số (3 trận, tối đa 10). Khoảng số dùng gạch ngang "–" (3–20 ký tự).

## Tiếng Việt

- **Kiểu dấu thanh cũ, thống nhất toàn bộ**: hoà, xoá, tuỳ, thuỷ, khoá, hoạ (không viết hòa, xóa, tùy). Ngoại lệ: tên
  riêng "Thụy Sĩ".
- Xưng "bạn" với người dùng. Lịch sự nhưng gọn: "Hãy…" chỉ dùng khi nhắc người dùng làm gì đó.
- Từ tiếng Anh chỉ giữ khi người Việt dùng quen hằng ngày: link, online, offline, set, Bo3, Elo, AI, PDF. Thuật ngữ thể
  thao khác thì dịch (xem bảng).
- Viết hoa chữ đầu nhãn và tiêu đề, không viết hoa từng chữ.

### Bảng thuật ngữ giải đấu

| Tiếng Anh | Tiếng Việt dùng | Không dùng |
| --- | --- | --- |
| tournament | giải đấu, giải | |
| match / game | trận / ván | |
| round | vòng; matchday: lượt đấu | |
| stage | giai đoạn | |
| group | bảng | |
| bracket | nhánh đấu | bracket |
| seed | hạt giống | seed |
| bye | miễn đấu | bye |
| tie-breaker | chỉ số phụ | hệ số phụ, tie-break (trừ "(tie-break)" của quần vợt) |
| standings | bảng xếp hạng | |
| round robin | vòng tròn | |
| single elimination | loại trực tiếp | |
| double elimination | nhánh thắng – nhánh thua | |
| grand final | chung kết tổng | |
| bracket reset | trận đấu thêm | trận reset |
| split (double elim.) | chia đôi | Split |
| Swiss | hệ Thụy Sĩ | |
| league phase | vòng phân hạng | League phase |
| placement match | trận tranh hạng | |
| check-in | điểm danh | check-in |
| walkover / forfeit | thắng vì đối thủ vắng mặt / xử thua | |
| quick advance | chỉ ghi người thắng | Quick advance |
| single race / time trial | đua 1 chặng / đua tính giờ | Single Race, Time Trial |
| heat | lượt (đua) | |
| suspension | treo giò | |
| organizer | ban tổ chức (BTC) | |
| co-organizer | người cùng tổ chức | đồng ban tổ chức |
| preview | xem trước | preview |
| in-person / over-the-board event | giải đấu ngoài đời (offline) | |
| tick (checkbox) | đánh dấu | tick |
| copy | sao chép | chép |

## Tiếng Anh

- **Tiếng Anh Mỹ**: color, analyze, center, defense, organizer, practice (động từ cũng viết practice). "cancelled" giữ
  nguyên (cả hai kiểu đều đúng).
- Sentence case cho nhãn và nút ("Create tournament", không "Create Tournament").
- Thuật ngữ cờ theo FIDE: tie-breaks, Buchholz, Sonneborn–Berger, bye, pairing.

## Tiếng Nga

- Gọi người dùng bằng "вы" (viết thường giữa câu).
- Dùng "ё" khi cần (счёт, ещё). Gạch ngang "—" có dấu cách hai bên trong câu; khoảng số "3–20" không dấu cách.
- Thuật ngữ: турнир, матч, партия (ván), тур (vòng), сетка (nhánh đấu), посев (hạt giống), дополнительные показатели
  (chỉ số phụ), швейцарская система, круговая система, гранд-финал.

## Tiếng Trung (giản thể)

- Dấu câu toàn khổ sau chữ Hán: ，。：；？！（）. Giữa chữ Hán và chữ Latin / số để một dấu cách (Bo3 赛制、共 16 队).
- Thuật ngữ: 比赛 / 赛事, 对阵图 (nhánh đấu), 种子 (hạt giống), 轮空 (miễn đấu), 同分排名规则 (chỉ số phụ), 瑞士制,
  单循环, 单败淘汰, 双败淘汰, 总决赛, 小组赛.
