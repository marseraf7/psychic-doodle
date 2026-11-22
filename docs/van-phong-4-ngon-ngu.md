# Văn phong và thuật ngữ – 4 ngôn ngữ gốc (vi, en, ru, zh) + ngôn ngữ thư mục (zh-Hant, ja, ko, cs)

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
  `BH`, `Поб`): chỉ sửa lỗi thật. Báo nhầm đã soát thì thêm vào `server/scripts/i18n-lt-allow.json` (`rules`: tắt hẳn một quy
  tắc cho một ngôn ngữ; `words`: từ đúng; `skip`: `ngôn-ngữ.khoá.QUY_TẮC`) để lần sau báo cáo chỉ còn chỗ mới.
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

### Bảng thuật ngữ chơi cờ

| Tiếng Anh | Tiếng Việt dùng | Không dùng |
| --- | --- | --- |
| engine (AI chơi cờ) | máy cờ | engine |
| bot (nhân vật máy) | nhân vật máy, máy | bot |
| app | ứng dụng | app |
| hot-seat / local 2 players | 2 người chung máy | 2 người một máy, 2 người trên một máy |
| open three / open four | 3 mở / 4 mở (3, 4 quân hai đầu còn trống) | |
| double threat | nước đôi | đa tuyến |
| forbidden move (Renju) | nước cấm | |
| overline | quá năm | |
| takeback | đi lại | |
| premove | đặt sẵn nước đi | đặt trước nước đi |

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

## Thêm ngôn ngữ (ngôn ngữ thư mục: zh-Hant, ja, ko, cs)

Danh sách ngôn ngữ ở **một chỗ**: `caro/langs.js` (mã, tên tự gọi, `<html lang>`, hreflang, Intl, ngôn ngữ dự phòng) –
trình duyệt, bản gộp, SEO, og, thư, widget MCP đều đọc từ đó. 4 ngôn ngữ gốc (vi, en, ru, zh = giản thể) vẫn nằm chung trong
`caro/i18n*.js`; mỗi ngôn ngữ thư mục chỉ sửa **file của riêng nó** (các nhánh dịch song song không đụng nhau):

| Phần | File của ngôn ngữ `<mã>` | Ghi chú |
| --- | --- | --- |
| Chuỗi lõi (`caro/i18n.js`) | `caro/i18n/<mã>/core.js` | Khoá `i18n_files`: tên các chủ đề đã dịch, cách nhau dấu cách (trang từng file chỉ tải các file này – không lỗi 404); đủ hết thì `'all'` (= complete: bài thử đòi đủ mọi khoá) |
| Chuỗi theo chủ đề | `caro/i18n/<mã>/<chủ đề>.js` | Soi gương `caro/i18n-<chủ đề>.js`: cùng tên, cùng khoá; chỉ `window.I18N.extend('<mã>', { … })` |
| Máy chủ: og, chuyển tên miền, thư, widget MCP | `server/src/i18n/<mã>.js` | Mẫu: `server/src/i18n/ja.js` (mục `og`, `move`, `mail`, `widget`) |
| Trang tĩnh privacy / connector / licenses | thay dòng `<!-- @lang-slot <mã> … -->` | `<section id="<mã>" lang="<html lang>" data-label="…">`, dịch từ mục `en` |
| Trang API | `server/scripts/api-html/<mã>.json` | rồi `python3 server/scripts/gen-api-html.py caro/api.html` |
| Thuật ngữ | mục "Thuật ngữ – <tên ngôn ngữ>" dưới đây | điền cột của ngôn ngữ mình trước khi dịch |

- **Không cần đăng ký thêm ở đâu**: không thêm thẻ `<script>` vào `index.html`, không thêm vào `FILES` của `sw.js` (bản gộp tự
  xếp `caro/i18n/<mã>/*.js` vào gói `b/i18n-<mã>-….js`; trang từng file `?bundle=0`, `embed.html`, `broadcast.html` do
  `i18n.js` tự chèn). Tăng `CACHE` trong `sw.js` để lúc gộp nhánh (trùng dòng thì giữ số lớn nhất + 1).
- **Khoá thiếu hiện tiếng Anh** (không phải tiếng Việt). Vẫn phải dịch đủ: bài thử `server/test/i18n-langs.test.js` bắt khoá
  thiếu ở ngôn ngữ `complete` (`i18n_files: 'all'`), `i18n_files` không khớp các file đã có, khoá thừa (đã xoá ở file gốc), biến `{x}` lệch, thẻ HTML lạ, khoảng trắng, chữ Việt / chữ Anh
  còn sót (chuỗi giống hệt tiếng Anh), dấu câu nửa khổ sau chữ Hán / kana (ja, zh-Hant), chữ phía máy chủ sai khoá / biến.
- Dịch từ bản **tiếng Anh** (đối chiếu tiếng Việt khi nghĩa chưa rõ). Giữ nguyên `{biến}`, thẻ `<b>…</b>`, emoji, chuỗi bắt
  đầu bằng " · " (phần nối thêm). Tên riêng (nhân vật máy "Khá Bảnh", "Cờ Caro") giữ như bản tiếng Anh.
- Thêm khoá mới vào file gốc sau này: thêm luôn vào `caro/i18n/<mã>/<chủ đề>.js` của mọi ngôn ngữ `complete`.
- Soát chính tả: `node server/scripts/i18n-lt.js ja` (LanguageTool có tiếng Nhật; chưa có tiếng Hàn, tiếng Séc chỉ ở máy chủ
  LanguageTool riêng) – soát tay theo bảng thuật ngữ. Người bản ngữ duyệt trước khi giới thiệu công khai.
- Kiểm trên trình duyệt: `E2E_LANGS=<mã> node caro/tests/e2e/ui-nowrap.e2e.js`, `E2E_LANG=<mã> node caro/tests/e2e/otour-ui.e2e.js`
  (0 lỗi hiển thị ở 390px), `node caro/tests/e2e/bundle-load.e2e.js`.

### Thuật ngữ – 日本語 (ja)

- Văn phong: câu đầy đủ dùng です／ます (gợi ý, thông báo, lỗi); nhãn, nút, tiêu đề cột viết gọn kiểu danh từ / động từ gốc
  ("大会を作成", "保存", "順位表"). Câu hỏi xác nhận: "…しますか？". Gọi người dùng là "あなた" chỉ khi cần (thường bỏ chủ ngữ).
- Dấu câu toàn khổ sau chữ Hán / kana: 、。：；？！（）「」. Số đếm viết liền đơn vị, không dấu cách ("{n}局", "第{n}局",
  "{n}人", "{n}秒"); trước mã / tên / số đo để một dấu cách cho dễ đọc ("ルーム {code}", "スコア {score}", "10 KB"). Chữ Latin
  (Bo{bo}, Elo, Swap2) viết liền với chữ Nhật. Khoảng số "3–20"; "từ…đến" trong câu: "{lo}～{hi}".
  Mẫu người dùng gõ (trong 「…」, vd. 「チーム名: 点数」) giữ dấu nửa khổ đúng như phải gõ.
- Tên game "Caro x Gomoku" giữ nguyên. "Caro" (biến thể Việt Nam) giữ chữ Latin "Caro" / "ベトナム式Caro" (không phiên âm カロ –
  người Nhật không biết tên này; mô tả lần đầu: "Caro（ベトナム式五目並べ）"). Tên nhân vật máy (Chị Bảy, Khá Bảnh…) giữ như
  bản tiếng Anh. "X" / "O" giữ nguyên (trong luật Renju: 黒 = X, 白 = O).
- Tên 26 khai cuộc Renju dùng chữ Hán chuẩn (寒星, 渓月, 疎星, 花月, 残月, 雨月, 金星, 松月, 丘月, 新月, 瑞星, 山月, 遊星 /
  長星, 峡月, 恒星, 水月, 流星, 雲月, 浦月, 嵐月, 銀月, 明星, 斜月, 名月, 彗星), gọi chung là 珠型.

| English | 日本語 | Không dùng / ghi chú |
| --- | --- | --- |
| Gomoku (game) | 五目並べ | ゴモク |
| Renju | 連珠 | レンジュ |
| Caro (Vietnamese variant – "blocked at both ends" does not win) | ベトナム式Caro | カロ |
| Freestyle / standard Gomoku | 自由ルールの五目並べ / 標準ルールの五目並べ | フリースタイル |
| stone / piece; Black / White (X / O) | 石; 黒 / 白 (X / O giữ nguyên) | 駒 |
| first player / second player | 先手 / 後手 | |
| move (a stone placed) | 手, 着手; "{n}手目" (nước thứ n) | ムーブ |
| forbidden move (Renju) | 禁じ手; ô cấm: 禁点 | 禁止手 |
| double three (3×3) | 三三 | ダブルスリー |
| double four (4×4) | 四四 | |
| overline (6+) | 長連 | オーバーライン |
| four-three (4×3) | 四三 | |
| open three / open four | 三 (両端が空いた三) / 達四, 両端が空いた四 | 活三, 活四 (tiếng Trung) |
| VCF / VCT (forcing win) | 四追い（VCF） / 三追い（VCT）; 追い詰め | |
| opening (26 Renju openings, Swap2, Soosõrv…) | 珠型, 開局, 開局ルール; Swap2, ソーソルブ, タラグチ | オープニング |
| takeback | 待った | アンドゥ |
| resign / draw / time out | 投了 / 引き分け / 時間切れ | 降参 |
| time control, increment, byo-yomi | 持ち時間, 加算, 秒読み; "1手の持ち時間" | |
| rating (Elo) | レーティング (Elo) | 段級 |
| engine (AI) / computer opponent (bot character) | エンジン / CPU, CPUキャラクター | ボット (chỉ trong tên riêng) |
| puzzle | 詰め問題 (Puzzle Storm: パズルストーム) | パズル (đứng riêng) |
| replay / game review / analysis | 再生 / 振り返り / 解析 | リプレイ |
| tournament | 大会 | トーナメント (= loại trực tiếp) |
| match / game | マッチ / 対局 (thể thao khác: 試合) | ゲーム |
| round / matchday | ラウンド, 回戦 (loại trực tiếp: "{n}回戦") / 節 | |
| stage / group | ステージ / グループ | |
| bracket | トーナメント表 (nhánh: 勝者側 / 敗者側) | ブラケット (trừ tên riêng "Winners Bracket" của giải) |
| seed | シード | |
| bye | 不戦勝（バイ） | |
| tie-breaker | タイブレーク; chỉ số: ブッフホルツ, ゾンネボルン–ベルガー | |
| standings | 順位表 | ランキング (= bảng xếp hạng kỳ thủ) |
| round robin | 総当たり | ラウンドロビン |
| single elimination | シングルエリミネーション | |
| double elimination | ダブルエリミネーション | |
| grand final / bracket reset | グランドファイナル / リセットマッチ | |
| Swiss | スイス式 | |
| check-in | チェックイン | |
| walkover / forfeit | 不戦勝 / 不戦敗, 棄権 | |
| organizer | 主催者 (người cùng tổ chức: 共同主催者) | 運営 |
| club | クラブ | サークル |

### Thuật ngữ – 한국어 (ko)

- Văn phong: câu trong giao diện (gợi ý, thông báo, lỗi, hộp xác nhận) dùng **해요체** lịch sự, hiện đại ("저장했어요",
  "다시 시도하세요", câu hỏi xác nhận "…할까요?"); nhãn, nút, tiêu đề cột viết gọn kiểu danh từ ("대회 만들기", "저장",
  "순위표"). Trang tĩnh trang trọng (privacy, connector, licenses, api) và thư gửi người dùng dùng **합니다체** ("…합니다").
  Thường bỏ chủ ngữ; khi cần gọi người dùng: "나" / "내" (nhãn: "내 차례", "내 대회"), lời nhân vật máy nói "당신".
- Dấu câu nửa khổ như tiếng Anh (Hàn Quốc dùng , . ? ! : bình thường), ngoặc kép “…”. Số đếm viết liền đơn vị, không dấu
  cách ("{n}판", "{n}수", "{n}명", "{n}팀", "{n}초", "{n}라운드", "{n}위"); trước mã / tên / số đo để một dấu cách ("방 {code}",
  "레이팅 {r}", "10 KB"). Khoảng số "3–20"; "từ…đến" trong câu: "{lo}~{hi}".
- **Tiểu từ sau biến**: tiếng Hàn đổi tiểu từ theo âm cuối (이/가, 을/를, 은/는, 와/과, (으)로). Không viết tiểu từ dính sau
  `{biến}` chứa tên / số; dùng dạng ghép "{name}이(가)", "{name}을(를)", "{x}(으)로", hoặc đổi câu sang "{name}님", "{name}의",
  "{name}: …", "{x}에서 / {x}에게" (không phụ thuộc âm cuối).
- Tên game "Caro x Gomoku" giữ nguyên. "Caro" (biến thể Việt Nam) giữ chữ Latin: "베트남식 Caro" (không phiên âm 카로 – người Hàn
  không biết tên này; mô tả lần đầu: "Caro(베트남식 오목)"). Tên nhân vật máy (Chị Bảy, Khá Bảnh…) giữ như bản tiếng Anh.
  "X" / "O" giữ nguyên (trong luật Renju: 흑 = X, 백 = O).
- Tên 26 khai cuộc Renju (주형) đọc âm Hán–Hàn: 한성, 계월, 소성, 화월, 잔월, 우월, 금성, 송월, 구월, 신월, 서성, 산월, 유성(遊星) /
  장성, 협월, 항성, 수월, 유성(流星), 운월, 포월, 남월, 은월, 명성, 사월, 명월, 혜성. Hai chữ "유성" trùng âm nên luôn kèm chữ Hán.
- Thuật ngữ e-sport / thể thao khác dùng từ mượn quen thuộc ở Hàn (밴픽, 피어리스, 시드, 플레이 인, 승자조 / 패자조, 와일드카드);
  "trận" trong giải thể thao khác (otour) là "경기", trong giải cờ là "매치" (cả loạt) / "대국" (một ván).

| English | 한국어 | Không dùng / ghi chú |
| --- | --- | --- |
| Gomoku (game) | 오목 | 고모쿠 |
| Renju | 렌주 | 연주 |
| Caro (Vietnamese variant – "blocked at both ends" does not win) | 베트남식 Caro | 카로 |
| Freestyle / standard Gomoku | 자유 규칙 오목 / 표준 규칙 오목 | 프리스타일 |
| stone / piece; Black / White (X / O) | 돌; 흑 / 백 (X / O giữ nguyên) | 말, 피스 |
| first player / second player | 선공 / 후공 | 선수 / 후수 (dễ nhầm "cầu thủ") |
| move (a stone placed) | 수, 착수; "{n}수" | 무브 |
| forbidden move (Renju) | 금수; ô cấm: 금수점 | 금지수 |
| double three (3×3) | 삼삼 | 쌍삼 (khẩu ngữ – chỉ khi giải thích) |
| double four (4×4) | 사사 | 쌍사 |
| overline (6+) | 장목 | 오버라인 |
| four-three (4×3) | 사삼 | |
| open three / open four | 열린 삼 / 열린 사 (bài nhập môn: "양쪽이 열린 3목 / 4목") | 활삼, 활사 |
| VCF / VCT (forcing win) | VCF(연속 사) / VCT(연속 위협); 강제 수순, 필승 수순 | |
| opening (26 Renju openings, Swap2, Soosõrv…) | 주형 (26가지 주형), 개국, 개국 규칙; 포석 (cách khai cuộc trong ván); 스왑2, 수소르브, 타라구치 | 오프닝 |
| takeback | 무르기 | 언두, 되돌리기 (chỉ cho kết quả / dữ liệu) |
| resign / draw / time out | 기권 / 무승부 / 시간 초과 | 항복 |
| time control, increment, byo-yomi | 시간 설정, 제한 시간; 추가 시간 ("한 수마다 추가 시간"); 초읽기 | |
| rating (Elo) | 레이팅 (Elo); provisional: 임시 레이팅 | 급수, 단 |
| engine (AI) / computer opponent (bot character) | 엔진 / 컴퓨터, 컴퓨터 캐릭터; play style: 기풍 | 봇 (chỉ trong tên riêng) |
| puzzle | 퍼즐 (Puzzle Storm: 퍼즐 스톰) | 묘수풀이 (của cờ vây) |
| replay / game review / analysis | 다시 보기 / 복기 / 분석 | 리플레이 |
| tournament | 대회 | 토너먼트 (= loại trực tiếp) |
| match / game | 매치 / 대국 (thể thao khác: 경기); đếm ván: "{n}판" | 게임 |
| round / matchday | 라운드, "{n}라운드" / 경기일, "{n}주 차" | 회전 |
| stage / group | 스테이지 / 조 ("A조"), 그룹 (giải e-sport) | 단계 (chỉ cho tie-break ladder) |
| bracket | 대진표 (nhánh: 승자조 / 패자조) | 브래킷 |
| seed | 시드 ("1번 시드") | |
| bye | 부전승 | 바이 |
| tie-breaker | 타이브레이크, 동점 처리; chỉ số: 부크홀츠, 존네본-베르거, 승자승 (head-to-head) | |
| standings | 순위표 | 랭킹 (= bảng xếp hạng kỳ thủ) |
| round robin | 리그전 (풀리그) | 라운드 로빈 |
| single elimination | 싱글 엘리미네이션 (giải thích: 한 번 지면 탈락) | 단판 토너먼트 |
| double elimination | 더블 엘리미네이션 | |
| grand final / bracket reset | 그랜드 파이널 / 리셋 매치 | |
| Swiss | 스위스 방식 | 스위스 시스템 |
| check-in | 체크인 | |
| walkover / forfeit | 부전승 / 몰수패, 기권 | |
| organizer | 주최자 (người cùng tổ chức: 공동 주최자) | 운영자 (= moderator của máy chủ) |
| club | 클럽 (chủ: 클럽장, ban điều hành: 운영진) | 동호회 |

### Thuật ngữ – Čeština (cs)

| English | Čeština | Không dùng / ghi chú |
| --- | --- | --- |
| Gomoku (game) |  |  |
| Renju |  |  |
| Caro (Vietnamese variant – "blocked at both ends" does not win) |  |  |
| Freestyle / standard Gomoku |  |  |
| stone / piece; Black / White (X / O) |  |  |
| first player / second player |  |  |
| move (a stone placed) |  |  |
| forbidden move (Renju) |  |  |
| double three (3×3) |  |  |
| double four (4×4) |  |  |
| overline (6+) |  |  |
| four-three (4×3) |  |  |
| open three / open four |  |  |
| VCF / VCT (forcing win) |  |  |
| opening (26 Renju openings, Swap2, Soosõrv…) |  |  |
| takeback |  |  |
| resign / draw / time out |  |  |
| time control, increment, byo-yomi |  |  |
| rating (Elo) |  |  |
| engine (AI) / computer opponent (bot character) |  |  |
| puzzle |  |  |
| replay / game review / analysis |  |  |
| tournament |  |  |
| match / game |  |  |
| round / matchday |  |  |
| stage / group |  |  |
| bracket |  |  |
| seed |  |  |
| bye |  |  |
| tie-breaker |  |  |
| standings |  |  |
| round robin |  |  |
| single elimination |  |  |
| double elimination |  |  |
| grand final / bracket reset |  |  |
| Swiss |  |  |
| check-in |  |  |
| walkover / forfeit |  |  |
| organizer |  |  |
| club |  |  |

### Thuật ngữ – 繁體中文 (zh-Hant)

| English | 繁體中文 | Không dùng / ghi chú |
| --- | --- | --- |
| Gomoku (game) |  |  |
| Renju |  |  |
| Caro (Vietnamese variant – "blocked at both ends" does not win) |  |  |
| Freestyle / standard Gomoku |  |  |
| stone / piece; Black / White (X / O) |  |  |
| first player / second player |  |  |
| move (a stone placed) |  |  |
| forbidden move (Renju) |  |  |
| double three (3×3) |  |  |
| double four (4×4) |  |  |
| overline (6+) |  |  |
| four-three (4×3) |  |  |
| open three / open four |  |  |
| VCF / VCT (forcing win) |  |  |
| opening (26 Renju openings, Swap2, Soosõrv…) |  |  |
| takeback |  |  |
| resign / draw / time out |  |  |
| time control, increment, byo-yomi |  |  |
| rating (Elo) |  |  |
| engine (AI) / computer opponent (bot character) |  |  |
| puzzle |  |  |
| replay / game review / analysis |  |  |
| tournament |  |  |
| match / game |  |  |
| round / matchday |  |  |
| stage / group |  |  |
| bracket |  |  |
| seed |  |  |
| bye |  |  |
| tie-breaker |  |  |
| standings |  |  |
| round robin |  |  |
| single elimination |  |  |
| double elimination |  |  |
| grand final / bracket reset |  |  |
| Swiss |  |  |
| check-in |  |  |
| walkover / forfeit |  |  |
| organizer |  |  |
| club |  |  |
