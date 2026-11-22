/*
 * Chữ phía máy chủ – tiếng Trung phồn thể (zh-Hant, Đài Loan / Hồng Kông). Cùng mục, cùng khoá và cùng biến {x} như
 * server/src/i18n/ja.js (bản tiếng Anh: server/src/langs.js; bài thử i18n-langs.test.js).
 *   og     – thẻ xem trước link chia sẻ (og-meta.js, bảng S.en)
 *   move   – trang chuyển tên miền (domain-move.js): [chữ, nút có {host}]
 *   mail   – thư mã xác minh / đặt lại mật khẩu (hub/shared.js): body(u = tên, c = mã)
 *   widget – widget bàn cờ của connector MCP (mcp/ui/widget-i18n.js, bảng en)
 */
'use strict';

module.exports = {
  og: {
    won: '{name} 獲勝', draw: '和棋', unfinished: '對局未結束', moves: '{n} 手',
    replay_d: '{result} · {n} 手 · 逐手重播，無需登入',
    live_t: '正在對局：{x} vs {o}', live_d: '{n} 手 · 點一下觀看直播，無需登入',
    room_t: '五子棋邀請 · 房間 {code}', room_d: '點一下進入房間立即對弈，無需註冊',
    tour_d: '五子棋比賽 · {n} 名棋手 · 賽程、結果與報名',
    ot_d: '比賽 · {n} 支隊伍 / 棋手 · 對陣圖與結果',
    club_t: '{name} 俱樂部', club_d: '五子棋俱樂部 · {n} 名成員',
    user_d: '等級分 {r} · {g} 局 · 查看棋手資料',
    bc_t: '直播：{name}', bc_d: '{n} 局進行中 · 即時觀看、排名與結果',
    cls_d: '五子棋課程 · {n} 章 · 局面、變化與評註',
    home_d: '在瀏覽器中免費與好友或電腦下五子棋',
  },
  move: ['Caro x Gomoku 已遷移到新網址。正在轉移你的資料（登入、進度、設定）…', '開啟 {host}'],
  mail: {
    verify: {
      subject: 'Caro x Gomoku 電子郵件驗證碼',
      body: (u, c) => `${u}，你好：\n\n你的電子郵件驗證碼是：${c}\n驗證碼 30 分鐘內有效。\n\n如果你沒有在 Caro x Gomoku 帳號中新增此電子郵件地址，請忽略此郵件。`,
    },
    reset: {
      subject: 'Caro x Gomoku 重設密碼驗證碼',
      body: (u, c) => `${u}，你好：\n\n你的重設密碼驗證碼是：${c}\n驗證碼 15 分鐘內有效。\n\n如果這不是你本人的操作，請忽略此郵件。`,
    },
  },
  widget: {
    your_move: '輪到你', thinking: '電腦正在思考…', you_win: '你贏了！', you_lose: '電腦獲勝',
    draw: '和棋', undo: '悔棋', new_game: '新對局', full: '玩完整版', you: '你：{side}', move_n: '第 {n} 手',
    easy: '簡單', normal: '普通', hard: '困難', rule_vn: '越南 Caro', rule_free: '自由規則', rule_std: '標準規則',
    rule_renju: '連珠', puzzle: '題目 #{id}', daily: '每日一題', goal: '{side} 先走，{n} 步內取勝',
    tap_key: '點選關鍵一步', correct: '正確！這就是關鍵一步。', wrong: '不對，再試一次。',
    reveal: '查看答案', next: '下一題', solution: '答案：{move}', hint: '{side} 的推薦著法：{move}',
    play_here: '從此局面對局', error: '出錯了：{msg}', checking: '正在檢查…',
    r_win: '立即連成一線獲勝。', r_block: '擋住對手的直接取勝。',
    r_forced: '開始必勝進攻，{n} 步內取勝。', r_defend: '最佳防守，但對手已有必勝進攻。',
    r_search: '找到的最強著法。勝率：{p}%。', r_opening: '開局：下在棋盤中央。',
    board: '五子棋棋盤', last: '上一手',
  },
};
