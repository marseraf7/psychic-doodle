# Reddit / Discord – nguyên tắc và bài nháp (25/11/2026)

Đợt 2 của `docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md` ("bài thảo luận Reddit / Discord"), theo mục 2.6 của báo cáo
Laplace (21/11/2026). Claude soạn; **Minh tự đăng**, tự chọn lúc đăng. Bài nháp bằng tiếng Anh (thêm tiếng Nga / tiếng Việt
cho thông báo Giải tuần), dán thẳng được – chỉ thay chỗ trống `<…>`.

Quy ước: **[CHƯA XÁC MINH]** = Claude chưa đọc được luật / số liệu hiện tại của nơi đó – Minh đọc trước khi đăng.

## 1. Nguyên tắc chung

1. **Đọc luật của từng sub / server trước khi đăng** (thanh bên, wiki, bài ghim). Luật đổi theo thời gian; mọi điều ghi về
   luật dưới đây là [CHƯA XÁC MINH] ở thời điểm đăng.
2. **Thảo luận trước, link sau.** Đa số sub cờ / board game cấm tự quảng cáo thuần. Bài mở bằng nội dung có giá trị tự thân
   (luật, thế cờ, câu đố), link game để cuối bài hoặc chỉ đưa khi có người hỏi. Nói thẳng "I made this" – không giả làm
   người chơi khác, không nhờ người khác upvote.
3. **Tài khoản nên có lịch sử.** Tài khoản mới, ít karma thường bị AutoModerator lọc im lặng [CHƯA XÁC MINH từng sub]. Nên
   dùng tài khoản đã bình luận thật trong các sub này vài tuần trước khi đăng bài có link.
4. **Một bài một sub, cách nhau vài ngày**; không đăng cùng nội dung hàng loạt (crosspost chỉ khi sub cho phép).
5. **Trả lời mọi bình luận trong 24 giờ đầu**, ghi lại góp ý vào Issue; góp ý về luật / engine là phần quý nhất.
6. **Không hứa thưởng tiền**, không thu phí, không cá cược. Không dùng tên đội / ảnh / kết quả giải thật của người khác.
7. Link: trang chính `https://<tên miền>/` (hoặc trang itch.io khi đã có) kèm `?ref=reddit` / `?ref=discord` để bảng
   "Nguồn người chơi" thấy mã giới thiệu (`src-track.js` nhận `?ref=`).
8. Ảnh minh hoạ: lấy từ game thật – trong ván "2 players, 1 device" bày thế cờ rồi dùng "Board image" (ảnh PNG, `share.js`),
   hoặc ảnh / video từ `node server/scripts/portal-media.js` (`--frame win` để có đường thắng).

## 2. Từng nơi

| Nơi | Hợp với | Cách đăng | Chưa xác minh |
| --- | --- | --- | --- |
| r/gomoku | Bài 1 (luật), bài 3 (câu đố) | Thảo luận, link cuối bài | Số thành viên, độ hoạt động, luật tự quảng cáo |
| r/renju | Bài 1 (phần so với Renju), bài 3 | Như trên; người đọc giỏi Renju – nói đúng thuật ngữ (Black/White, forbidden move) | Như trên |
| r/boardgames | Bài 1 rút gọn (góc "biến thể dân gian Việt Nam") | Chỉ thảo luận; sub lớn, thường rất chặt với tự quảng cáo – có thể không đưa link | Luật về self-promotion, ngày cho phép quảng bá |
| r/WebGames | Bài 2 | Game chơi ngay trên trình duyệt, không đăng ký (bản web chính chơi khách được) | Luật tiêu đề, flair, giới hạn đăng |
| r/playmygame | Bài 2 | Sub dành cho nhà phát triển xin góp ý – nói rõ muốn góp ý gì | Luật tiêu đề (thẻ nền tảng), flair bắt buộc, yêu cầu tối thiểu |

## 3. Bài nháp

### Bài 1 – Thảo luận luật: "blocked five doesn't win" (r/gomoku, r/renju; bản rút gọn cho r/boardgames)

Ảnh gợi ý: 3 ảnh "Board image" của ba thế cờ dưới đây (bàn gỗ), hoặc chỉ dùng sơ đồ chữ.

```
Title: Vietnamese Caro: a five blocked at both ends doesn't win – how does it change Gomoku?

In Vietnam, five-in-a-row is played as "Caro" (cờ caro), usually on squared paper with no board edge. The rule that surprises most Gomoku players: a line of five only wins if at least one end is open. If the opponent has stones on both ends, it doesn't count and the game goes on.

Three positions to compare (X = first player / Black, O = second player / White):

**1. Five blocked at both ends**

        a b c d e f g h i
      2 . O X X X X X O .

- Freestyle Gomoku, Standard Gomoku, Renju: X wins.
- Vietnamese Caro: no win – X has to build another line.

**2. Six in a row, open**

        a b c d e f g h i
      2 . . X X X X X X .

- Freestyle Gomoku: X wins.
- Standard Gomoku: no win (exactly five needed).
- Renju: overline is a forbidden move for Black (X); White would win with it.
- Vietnamese Caro: X wins (five or more with an open end).

**3. Open four**

        a b c d e f g h i
      2 . . X X X X . . .

- Everywhere it's decisive, since it can't be blocked on both sides in one move. Some Vietnamese apps (including the one I made) end the game right here instead of waiting for the fifth stone.

What I find interesting is how the blocked-five rule changes defence: a "dead" four (blocked on one side) is still a threat, but a block on the far end of a three can kill a whole line in advance. In practice Caro games feel closer to Renju than to Freestyle – the first-move advantage is smaller, and the usual explanation in Vietnam is exactly this rule.

Questions for people who know Renju/Gomoku theory better than me:
- Has anyone looked at how much the blocked-five rule reduces the first-player advantage (compared with, say, Swap2 or Renju restrictions)?
- Does a "four blocked at one end + three" combination count as a real double threat for you when the five could end up blocked?
- Any other regional rule sets like this one?

(Disclosure: I built a free web game that implements Vietnamese Caro, Freestyle/Standard Gomoku and Renju side by side – happy to share the link if anyone wants to test positions: <link>?ref=reddit)
```

Bản r/boardgames (ngắn hơn, không link trong bài – chỉ đưa khi có người hỏi):

```
Title: TIL-style folk rule: in Vietnamese five-in-a-row, a five blocked at both ends doesn't count

Vietnamese "Caro" is five-in-a-row played on squared paper. Unlike Gomoku, a line of five wins only if at least one end is still open – O X X X X X O is not a win, the game just continues. Players say it reduces the first-player advantage, which in freestyle Gomoku is huge.

Does your family/school play five-in-a-row with any house rule like this? Curious how other countries handle the first-move problem without a formal opening rule.
```

### Bài 2 – "I built…" (r/playmygame, r/WebGames)

Theo khuôn thường gặp của sub cho nhà phát triển: nói game là gì, nền tảng, miễn phí, muốn góp ý gì; link rõ ràng. Thẻ / flair
trong tiêu đề theo luật thật của sub [CHƯA XÁC MINH].

```
Title: [Web] I built a free Caro/Gomoku web game with Renju, Swap2 and a Rapfi-powered boss – feedback welcome

Hi! I'm a solo developer and this is Caro x Gomoku, a five-in-a-row game you play in the browser – no download, no sign-up needed (guest play), no ads.

What's in it:
- 4 rule sets: Vietnamese Caro (a five blocked at both ends doesn't win), Freestyle Gomoku, Standard Gomoku, Renju (forbidden moves for Black).
- 31 computer opponents with different styles (attacker, defender, double threat, trickster, all-round), unlocked level by level; the final boss runs the Rapfi engine in WebAssembly.
- Daily puzzle, rated puzzles, Puzzle Storm, short lessons, move-by-move analysis.
- Online play: quick pairing from bullet to classical, private rooms with the Swap2 opening, watching live games, tournaments (tournaments need a free account).
- 8 languages.

Play: <link>?ref=reddit

What I'd love feedback on:
1. First 2 minutes: is it clear how to start a game against the computer?
2. Board controls on your device (drag, zoom, tap to place) – anything awkward?
3. Difficulty curve of the computer opponents – where did you get stuck or bored?

Thanks for trying it!
```

Bản r/WebGames (nếu sub chỉ nhận tiêu đề + link): tiêu đề `Caro x Gomoku – five in a row with Vietnamese Caro, Gomoku and Renju rules, 31 computer opponents, puzzles (free, no sign-up)`;
bình luận đầu tiên của Minh: 2–3 câu "I made this, feedback welcome" + câu hỏi 1–3 ở trên.

### Bài 3 – Câu đố tuần (r/gomoku, r/renju, Discord #puzzles)

Bài đố lấy từ chính bộ câu đố của game (`caro/puzzles.json`, bài #137, độ khó 920, kiểu VCT); lời giải đã kiểm bằng engine
của game (thắng chắc trong 3 nước của X). Tuần sau thay bài khác: chọn bài trong `puzzles.json`, kiểm lời giải như vậy.
Reddit giấu lời giải bằng `>!…!<`, Discord bằng `||…||`.

```
Title: Weekly Caro puzzle #1 – X to move and win (Vietnamese Caro rules)

Vietnamese Caro rules: five wins only if at least one end is open; an open four (both ends empty) also wins.

        a b c d e f g h
      8 . . . . . . . .
      7 . . . . . . . .
      6 . . . X . X . .
      5 . . X O X . . .
      4 . . . O . O . .
      3 . . . . O . . .
      2 . . . . . . . .
      1 . . . . . . . .

X to move. The win takes 3 X moves against any defence.

Solution: >!1. e7 (open three on the c5–d6–e7 diagonal) – O must block, best f8. 2. e6 – two threes at once: e5–e6–e7 and d6–e6–f6. O blocks the column with e4. 3. c6 – open four c6–d6–e6–f6, which wins.!<

From the puzzle set of a free Caro/Gomoku web game I'm building – more like this there: <link>?ref=reddit
```

### Bài 4 – Thông báo Giải tuần

Giải: **Chủ nhật 20:00 giờ Việt Nam (UTC+7) = 13:00 UTC = 16:00 Moskva**, Arena 60 phút, luật Caro Việt Nam, đồng hồ 3+2
(mặc định – `docs/giai-tuan.md`). Máy chủ **tự tạo** giải mỗi tuần với tên `Cúp tuần Caro #N · Weekly Cup` (Minh không phải
tạo bằng tay); thẻ "Giải tuần" ở Trang chủ có nút **Chia sẻ** / trang giải có link `/?t=<mã giải>` để điền `<link giải>`.
Thưởng **danh hiệu** trên hồ sơ cho hạng 1–3 ("Vô địch / Á quân / Hạng ba Cúp tuần Caro #N"; tiếng Anh "Weekly Cup #N
champion / runner-up / third place", tiếng Nga «Победитель / Второе место / Третье место турнира недели #N») và tên trong bài
kết quả, **không thu phí, không thưởng tiền**. Tham gia giải cần tài khoản miễn phí trên trang chính (khách chỉ xem được;
bản CrazyGames / itch.io không có đăng nhập nên không vào giải được). Đổi giờ / luật / đồng hồ bằng biến `WEEKLY_CUP_*` thì
sửa các chỗ tương ứng trong bài.

Tiếng Anh (Reddit bình luận / Discord #announcements, #weekly-cup):

```
Weekly Cup #<N> – Sunday 13:00 UTC (20:00 Vietnam, 16:00 Moscow)

Format: Arena, 60 minutes – play as many games as you like, you are paired again as soon as your game ends; wins and streaks score points.
Rules: Vietnamese Caro (five blocked at both ends does not win), 3+2 clock, rated.
Prize: places 1–3 get a title on their profile ("Weekly Cup #<N> champion", "runner-up", "third place") and a shout-out in the results post. Free to enter – no entry fee, no money prizes.
How to join: open <tournament link>, sign in with a free account and press Join (you can join any time while it runs). Guests can watch.
Fair play: no engine help; flagged games are reviewed.
See you on the board!
```

Tiếng Nga (VK, Telegram):

```
Турнир недели #<N> – воскресенье, 16:00 по Москве (13:00 UTC, 20:00 по Вьетнаму)

Формат: Арена, 60 минут – играйте сколько угодно партий, новая пара подбирается сразу после окончания партии; очки за победы и серии побед.
Правила: вьетнамское каро (пятёрка, закрытая с двух сторон, не выигрывает), контроль 3+2, на рейтинг.
Награда: места 1–3 получают звание в профиле («Победитель турнира недели #<N>», «Второе место», «Третье место») и упоминание в итогах турнира. Участие бесплатное – без взноса, без денежных призов.
Как участвовать: откройте <ссылка на турнир>, войдите в бесплатный аккаунт и нажмите «Участвовать» (можно присоединиться в любой момент, пока турнир идёт). Гости могут смотреть.
Честная игра: без помощи программ; подозрительные партии проверяются.
До встречи за доской!
```

Tiếng Việt (Group Facebook):

```
Cúp tuần Caro #<N> – 20:00 tối Chủ nhật (giờ Việt Nam)

Thể thức: Arena 60 phút – đánh bao nhiêu ván cũng được, hết ván là được ghép đối thủ mới ngay; thắng và thắng liên tiếp được cộng điểm.
Luật: Caro Việt Nam (năm quân bị chặn hai đầu không thắng), đồng hồ 3+2, tính Elo.
Phần thưởng: hạng 1–3 nhận danh hiệu trên hồ sơ ("Vô địch / Á quân / Hạng ba Cúp tuần Caro #<N>") và tên trong bài tổng kết. Không thu phí, không thưởng tiền.
Cách tham gia: mở <link giải>, đăng nhập tài khoản (miễn phí) rồi bấm Tham gia – vào lúc nào cũng được khi giải đang chạy. Khách vào xem được.
Chơi đẹp: không dùng phần mềm trợ giúp; ván có dấu hiệu bất thường sẽ được xem lại.
Hẹn gặp mọi người trên bàn cờ!
```

Cách tính điểm Arena trong game (`server/src/hub/arena.js`): thắng 2, hoà 1, thua 0; thắng 2 ván liền thì các ván sau được
nhân đôi tới khi hoà / thua – khớp câu "wins and streaks score points". Giải có đồng hồ tổng còn có Berserk (+1 điểm khi
thắng) – muốn giải thích thì thêm một dòng.

## 4. Discord

### 4.1 Server riêng của game

Kênh:

| Kênh | Dùng để | Ai viết |
| --- | --- | --- |
| #welcome | Tin chào + luật + cách chọn ngôn ngữ | Chỉ quản trị |
| #announcements | Bản cập nhật, Giải tuần | Chỉ quản trị (bật Announcement channel nếu muốn người khác theo dõi) |
| #weekly-cup | Link giải, kết quả, hỏi đáp về giải | Mọi người |
| #puzzles | Câu đố tuần (lời giải trong `||…||`), thế cờ hay | Mọi người |
| #find-a-game | Hẹn đấu: luật, thời gian, mã phòng | Mọi người |
| #feedback | Lỗi, góp ý (Minh / Claude gom vào Issue) | Mọi người |
| #vietnamese | Trò chuyện tiếng Việt | Vai trò Tiếng Việt |
| #русский | Trò chuyện tiếng Nga | Vai trò Русский |

Vai trò: **Admin** (Minh), **Moderator** (người tin cậy, khi server đông), **Tournament host** (tạo / điều hành giải),
**Player** (mặc định khi đồng ý luật), **Tiếng Việt** / **Русский** (tự chọn ở Onboarding hoặc bấm biểu tượng ở #welcome –
mở kênh ngôn ngữ tương ứng). Bật Community + Onboarding + Rules Screening + AutoMod chặn từ tục / spam link của Discord (tên
mục có thể khác theo bản Discord – làm theo giao diện thật). Bot không bắt buộc; chỉ thêm khi thật cần (ví dụ bot nhắc giờ
giải) và chỉ bot có tiếng.

Luật cộng đồng (dán vào Rules Screening và #welcome):

```
1. Be kind. No insults, harassment, hate speech or NSFW content.
2. No cheating: don't use engines or outside help in rated games or tournaments.
3. No spam or advertising. Sharing your own Gomoku/Renju content is fine in the right channel.
4. Use English in general channels; #vietnamese and #русский are for chatting in those languages.
5. Report problems to a moderator instead of arguing in public.
Breaking the rules can lead to a warning, a mute or a ban.
```

Tin chào (#welcome):

```
Welcome to the Caro x Gomoku community! 👋
Caro x Gomoku is a free five-in-a-row game in your browser: Vietnamese Caro, Gomoku and Renju, computer opponents, puzzles and online play.

- Play: <link>?ref=discord
- Weekly Cup every Sunday 13:00 UTC → #weekly-cup
- Weekly puzzle → #puzzles
- Looking for an opponent? → #find-a-game
- Found a bug or have an idea? → #feedback
Pick your language role in Onboarding (or react here): 🇻🇳 Tiếng Việt · 🇷🇺 Русский.
```

### 4.2 Tham gia cộng đồng Gomoku / Renju có sẵn (lịch sự)

1. Vào server như một người chơi: đọc luật, giới thiệu ngắn ở kênh giới thiệu (nếu có), **chưa đưa link**.
2. Đóng góp trước: chơi giải của họ, trả lời câu hỏi về luật Caro Việt Nam, chia sẻ thế cờ / câu đố hay.
3. Muốn giới thiệu game: **hỏi quản trị viên trước** bằng tin nhắn riêng, ngắn: game là gì, miễn phí, không quảng cáo, có
   Renju / Swap2, xin phép đăng một lần ở kênh họ chỉ định. Họ từ chối thì thôi, không đăng nơi khác trong server đó.
4. Không gửi tin nhắn riêng hàng loạt cho thành viên, không mời người sang server của mình khi chưa được phép.
5. Mời hợp tác giải giao hữu (giải của họ chạy trên game – trang nhúng / giải offline có sẵn) chỉ sau khi đã quen.

Mẫu tin hỏi quản trị viên:

```
Hi! I'm the developer of Caro x Gomoku, a free browser game with Gomoku, Renju (forbidden moves) and the Swap2 opening, plus Vietnamese Caro rules. No ads, guest play without sign-up. Would it be OK to share it once in a channel of your choice? If not, no problem at all – thanks for running this community.
```

### 4.3 Discord Activities – để Đợt 3

Chạy game ngay trong kênh Discord (Activities) cần làm tích hợp riêng (Embedded App SDK, xác thực, nhúng iframe) – theo kế
hoạch là Đợt 3, sau khi có cộng đồng lõi. Không làm trong đợt này.

## 5. Ghi lại sau mỗi bài

| Ngày | Nơi | Bài | Link bài | Điểm / bình luận sau 48 giờ | Người mới `?ref=` (bảng Nguồn người chơi) | Góp ý đáng làm |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
