# Hồ sơ listing – connector "Caro x Gomoku" (thư mục connector của Claude)

Nội dung để dán vào cổng nộp <https://claude.ai/directory/manage> (bước **Listing** và **Use cases**). Tiếng Anh là bản
chính (người duyệt và thư mục dùng tiếng Anh); bản tiếng Việt bên dưới để chủ dự án đọc / đối chiếu.
Giới hạn của cổng: tên ≤ 100 ký tự, một dòng ≤ 200, mô tả ≤ 2.000, 1–5 hạng mục (đã đếm, xem cuối file).

## English (paste this)

**Server URL:** `https://caroxo.duckdns.org/mcp` · transport Streamable HTTP · authentication: none

**Name:** Caro x Gomoku

**One-liner:** Play Caro (Gomoku, five in a row) against the computer on an interactive board, solve daily puzzles and get move hints.

**Description:**

> Caro x Gomoku brings the classic five-in-a-row game into your Claude conversation. Ask Claude to start a game and an
> interactive board appears: click a cell to move, and the built-in engine answers in about a second. Choose Easy, Normal
> or Hard, play X or O, undo moves and start new games, with four rule sets: Vietnamese Caro (the "blocked at both ends"
> rule), freestyle Gomoku, standard Gomoku (exactly five) and Renju with forbidden moves.
>
> Stuck? Ask for a hint and Claude shows the best move on the board with a short reason (winning move, block, forced win
> or engine estimate). Want a challenge? Solve the daily puzzle or any of 363 tactics puzzles (VCF and VCT), check your
> answer on the board and reveal the solution only when you want it. Claude can also explain the rules of each variant
> and show the public leaderboard and player profiles of the Caro x Gomoku online server.
>
> The connector is free, needs no account and stores nothing: every game is just the list of moves sent with each call.
> Works in light and dark mode, on desktop and mobile, in English, Vietnamese, Russian and Chinese. For rated online
> games, 31 computer opponents and lessons, open the full game at caroxo.duckdns.org.

**Categories (choose up to 5 that the portal offers):** Games / Entertainment · Education / Learning · Lifestyle (only if
"Games" is not offered).

**Documentation URL:** <https://caroxo.duckdns.org/connector.html>

**Privacy policy URL:** <https://caroxo.duckdns.org/privacy.html#claude-en>

**Support contact:** <https://github.com/marseraf7/psychic-doodle/issues>

**Icon:** `docs/claude-directory/icon-512.png` (512 × 512 PNG, same as the app icon `caro/icon.svg`)

**URL slug (permanent):** `caro-x-gomoku`

### Use cases (step 4)

- **Primary use cases:** play a casual game of Caro / Gomoku against the computer inside Claude; get a hint for a
  position; solve daily tactics puzzles; learn the rules of Caro, Gomoku and Renju; look up public rankings.
- **What users need before connecting:** nothing – no account, no plan, no setup.
- **Reads or writes data:** reads only. All six tools are read-only (`readOnlyHint: true`); nothing is stored.

### Example prompts (≥ 3, all tested)

1. "Let's play Caro. I'll be X." → `play_caro` (board appears, user clicks to move)
2. "Play Gomoku with me on hard, freestyle rules, you go first." → `play_caro` (`rule: free`, `difficulty: hard`, `you_play: O`)
3. "Give me today's Caro puzzle." → `caro_puzzle`
4. "In this game X played [0,0],[1,1],[1,0] and O played [2,0],[0,1]. What should O play?" → `suggest_caro_move`
5. "What are the rules of Renju and how is it different from Vietnamese Caro?" → `caro_rules`
6. "Who are the top 5 blitz players on caroxo.duckdns.org?" → `caro_leaderboard`

### Screenshots (carousel, PNG 1120 px wide, cropped to the app) + paired prompt

| File | Prompt to paste |
| --- | --- |
| `1-play-light.png` | "Let's play Caro, I'll be X. Normal difficulty." |
| `2-win-dark.png` | "Play freestyle Gomoku with me on hard." |
| `3-puzzle-light.png` | "Give me Caro puzzle #42." |
| `4-suggest-dark.png` | "What's the best move for X in this position?" |
| `5-new-game-vi.png` | "Chơi Caro luật Renju mức khó với mình nhé." (Let's play Caro with Renju rules on hard.) |

## Tiếng Việt (để đối chiếu)

**Tên:** Caro x Gomoku

**Một dòng:** Chơi Caro (Gomoku, năm quân liền) với máy trên bàn cờ tương tác, giải bài đố hằng ngày và xin gợi ý nước đi.

**Mô tả:** Caro x Gomoku đưa trò năm quân liền vào cuộc trò chuyện với Claude. Bảo Claude bắt đầu ván, bàn cờ hiện ra:
chạm ô để đi, máy cờ đáp trong khoảng một giây. Chọn mức Dễ, Vừa hoặc Khó, cầm X hoặc O, đi lại, ván mới, với bốn luật:
Caro Việt Nam (chặn hai đầu), Gomoku tự do, Gomoku tiêu chuẩn (đúng năm) và Renju có nước cấm. Bí nước thì xin gợi ý:
Claude hiện nước tốt nhất trên bàn kèm lý do ngắn. Muốn thử sức thì giải bài đố của ngày hoặc một trong 363 bài (VCF,
VCT), kiểm nước trả lời ngay trên bàn, muốn mới xem lời giải. Claude cũng giải thích luật từng biến thể, xem bảng xếp hạng
và hồ sơ công khai trên máy chủ online. Miễn phí, không cần tài khoản, không lưu gì; sáng / tối, máy tính / điện thoại,
4 ngôn ngữ. Chơi xếp hạng online, 31 nhân vật máy và bài học: caroxo.duckdns.org.

## Đếm độ dài (kiểm lại nếu sửa)

- Tên: 13 / 100 · Một dòng (en): 119 / 200 · Mô tả (en): ~1.200 / 2.000 ký tự.
