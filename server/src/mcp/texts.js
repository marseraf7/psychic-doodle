/*
 * Connector MCP – chữ gửi cho mô hình (tiếng Anh: Claude tự trả lời người dùng bằng ngôn ngữ của họ): luật 4 biến thể,
 * dòng link về game đầy đủ, mức độ khó. Chữ trên widget (4 ngôn ngữ) ở ui/widget-i18n.js.
 */
'use strict';

const Site = require('../site.js');

const SITE = Site.DEFAULT_ORIGIN;

/** Địa chỉ trang game (tên miền mới MOVED_TO / PUBLIC_URL nếu máy chủ đặt, không thì tên miền chính – site.js). */
function site() {
  return Site.canonicalOrigin();
}

/** Dòng cuối của mỗi kết quả: link chơi bản đầy đủ (phễu về web / ứng dụng). */
function footer() {
  return `Play the full game (online rated games, 31 computer opponents, puzzles, lessons): ${site()}`;
}

// Mức độ khó → nhân vật máy (caro/bots.js). Máy chủ chặn thời gian nghĩ ≤ 1,5 giây.
const DIFFICULTY = {
  easy: { bot: 'ti', label: 'Easy (~900 Elo)' },
  normal: { bot: 'sach', label: 'Normal (~1500 Elo)' },
  hard: { bot: 'goat', label: 'Hard (~2350 Elo)' },
};

const COMMON = 'Board: unlimited grid; this connector uses coordinates [x, y] from -30 to 30, x to the right, y downward, '
  + 'center [0,0]. X always moves first, players alternate.';

const RULES_TEXT = {
  vn: 'Vietnamese Caro (rule "vn", default): 5 or more in a row wins if at least one end is open; an open four (4 in a row '
    + 'with both ends empty) also wins at once; a line blocked at both ends by the opponent never wins ("blocked both ends").',
  free: 'Freestyle Gomoku ("free"): 5 or more stones in a row (horizontal, vertical or diagonal) wins. Blocked ends do not matter.',
  std: 'Standard Gomoku ("std"): exactly 5 in a row wins; an overline (6 or more) does not count.',
  renju: 'Renju ("renju"): X (Black, first player) wins only with exactly 5 and may not play forbidden moves: double three '
    + '(a move making two open threes), double four (two fours) or overline (6+). A move that makes exactly five is always '
    + 'allowed. O (White) has no restrictions and wins with 5 or more.',
};

function rulesText(rule) {
  const list = rule ? [rule] : Object.keys(RULES_TEXT);
  return [COMMON, ...list.map((r) => '- ' + RULES_TEXT[r])].join('\n');
}

module.exports = { site, footer, DIFFICULTY, rulesText, RULES_TEXT, SITE };
