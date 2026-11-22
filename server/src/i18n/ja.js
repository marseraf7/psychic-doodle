/*
 * Chữ phía máy chủ – tiếng Nhật (ja). Mẫu cho ngôn ngữ thư mục khác (ko, cs, zh-Hant): một file server/src/i18n/<mã>.js với
 * đúng các mục dưới đây, cùng khoá và cùng biến {x} như bản tiếng Anh (server/src/langs.js; bài thử i18n-langs.test.js).
 *   og     – thẻ xem trước link chia sẻ (og-meta.js, bảng S.en)
 *   move   – trang chuyển tên miền (domain-move.js): [chữ, nút có {host}]
 *   mail   – thư mã xác minh / đặt lại mật khẩu (hub/shared.js): body(u = tên, c = mã)
 *   widget – widget bàn cờ của connector MCP (mcp/ui/widget-i18n.js, bảng en)
 */
'use strict';

module.exports = {
  og: {
    won: '{name}の勝ち', draw: '引き分け', unfinished: '未終局の対局', moves: '{n}手',
    replay_d: '{result} · {n}手 · 一手ずつ再生、ログイン不要',
    live_t: '対局中：{x} vs {o}', live_d: '{n}手 · タップしてライブ観戦、ログイン不要',
    room_t: '五目並べへの招待 · ルーム {code}', room_d: 'タップしてルームに入り、すぐに対局。登録不要',
    tour_d: '五目並べの大会 · {n}人 · 日程、結果、参加登録',
    ot_d: '大会 · {n}チーム／人 · トーナメント表と結果',
    club_t: '{name}クラブ', club_d: '五目並べクラブ · メンバー{n}人',
    user_d: 'レーティング {r} · {g}局 · プレイヤーのプロフィール',
    bc_t: '中継：{name}', bc_d: '{n}局が進行中 · ライブ観戦、順位表、結果',
    cls_d: '五目並べの教材 · {n}章 · 局面、変化、コメント',
    home_d: '友達やCPUと無料で五目並べ。ブラウザーですぐに遊べます',
  },
  move: ['Caro x Gomokuは新しいアドレスに移転しました。データ（ログイン、進み具合、設定）を引き継いでいます…', '{host}を開く'],
  mail: {
    verify: {
      subject: 'Caro x Gomoku メールアドレスの確認コード',
      body: (u, c) => `${u} さん\n\nメールアドレスの確認コードは ${c} です。\nこのコードの有効期限は30分です。\n\nCaro x Gomokuのアカウントにこのメールアドレスを追加した覚えがない場合は、このメールを無視してください。`,
    },
    reset: {
      subject: 'Caro x Gomoku パスワード再設定コード',
      body: (u, c) => `${u} さん\n\nパスワード再設定コードは ${c} です。\nこのコードの有効期限は15分です。\n\nお心当たりがない場合は、このメールを無視してください。`,
    },
  },
  widget: {
    your_move: 'あなたの番', thinking: 'CPUが思考中…', you_win: 'あなたの勝ち！', you_lose: 'CPUの勝ち',
    draw: '引き分け', undo: '待った', new_game: '新しい対局', full: 'フル版で遊ぶ', you: 'あなた：{side}', move_n: '{n}手目',
    easy: 'やさしい', normal: 'ふつう', hard: 'むずかしい', rule_vn: 'ベトナム式Caro', rule_free: '自由ルール', rule_std: '標準ルール',
    rule_renju: '連珠', puzzle: '問題 #{id}', daily: '今日の1問', goal: '{side}の番、{n}手で勝ち',
    tap_key: '決め手をタップ', correct: '正解！それが決め手です。', wrong: '違います。もう一度どうぞ。',
    reveal: '答えを見る', next: '次の問題', solution: '答え：{move}', hint: '{side}への推奨手：{move}',
    play_here: 'ここから対局', error: 'エラーが発生しました：{msg}', checking: '確認中…',
    r_win: '列が完成してすぐに勝ちます。', r_block: '相手のすぐの勝ちを止めます。',
    r_forced: '{n}手の必勝手順の始まりです。', r_defend: '最善の守りですが、相手には必勝手順があります。',
    r_search: '見つかった最強の手です。勝率：{p}%。', r_opening: '初手：盤の中央から始めます。',
    board: '五目並べの盤面', last: '最後の手',
  },
};
