/*
 * Chữ trên widget bàn cờ của connector MCP – đủ 4 ngôn ngữ (vi, en, ru, zh), theo docs/van-phong-4-ngon-ngu.md.
 * Chọn theo hostContext.locale của Claude; ngôn ngữ khác dùng tiếng Anh. Biến {x} giữ nguyên ở cả 4 ngôn ngữ.
 * Nạp vào widget.html (widget.js gộp thành một file HTML).
 */
globalThis.CARO_MCP_I18N = {
  en: {
    your_move: 'Your move', thinking: 'Computer is thinking…', you_win: 'You win!', you_lose: 'Computer wins',
    draw: 'Draw', undo: 'Undo', new_game: 'New game', full: 'Play full game', you: 'You: {side}', move_n: 'Move {n}',
    easy: 'Easy', normal: 'Normal', hard: 'Hard', rule_vn: 'Vietnamese Caro', rule_free: 'Freestyle', rule_std: 'Standard',
    rule_renju: 'Renju', puzzle: 'Puzzle #{id}', daily: 'Daily puzzle', goal: '{side} to move and win in {n}',
    tap_key: 'Tap the key move', correct: 'Correct! That is the key move.', wrong: 'Not quite. Try again.',
    reveal: 'Show solution', next: 'Next puzzle', solution: 'Solution: {move}', hint: 'Suggested move for {side}: {move}',
    play_here: 'Play from here', error: 'Something went wrong: {msg}', checking: 'Checking…',
    r_win: 'Wins at once by completing the line.', r_block: 'Blocks the opponent’s immediate win.',
    r_forced: 'Starts a forced win in {n} moves.', r_defend: 'Best defense, but the opponent has a forced win.',
    r_search: 'Strongest move found. Winning chance: {p}%.', r_opening: 'Opening move: start in the center.',
    board: 'Caro board', last: 'last move',
  },
  vi: {
    your_move: 'Lượt bạn', thinking: 'Máy đang nghĩ…', you_win: 'Bạn thắng!', you_lose: 'Máy thắng',
    draw: 'Hoà', undo: 'Đi lại', new_game: 'Ván mới', full: 'Chơi bản đầy đủ', you: 'Bạn: {side}', move_n: 'Nước {n}',
    easy: 'Dễ', normal: 'Vừa', hard: 'Khó', rule_vn: 'Caro Việt Nam', rule_free: 'Tự do', rule_std: 'Tiêu chuẩn',
    rule_renju: 'Renju', puzzle: 'Bài đố #{id}', daily: 'Bài đố của ngày', goal: '{side} đi, thắng trong {n} nước',
    tap_key: 'Chạm vào nước quyết định', correct: 'Đúng rồi! Đây là nước quyết định.', wrong: 'Chưa đúng. Thử lại nhé.',
    reveal: 'Xem lời giải', next: 'Bài tiếp theo', solution: 'Lời giải: {move}', hint: 'Nước gợi ý cho {side}: {move}',
    play_here: 'Chơi tiếp từ đây', error: 'Có lỗi: {msg}', checking: 'Đang kiểm tra…',
    r_win: 'Thắng ngay vì đủ hàng.', r_block: 'Chặn nước thắng ngay của đối thủ.',
    r_forced: 'Mở đầu chuỗi thắng chắc trong {n} nước.', r_defend: 'Cách thủ tốt nhất, nhưng đối thủ đã có chuỗi thắng chắc.',
    r_search: 'Nước mạnh nhất máy tìm được. Khả năng thắng: {p}%.', r_opening: 'Nước mở đầu: đánh vào giữa bàn.',
    board: 'Bàn cờ Caro', last: 'nước vừa đi',
  },
  ru: {
    your_move: 'Ваш ход', thinking: 'Компьютер думает…', you_win: 'Вы победили!', you_lose: 'Компьютер победил',
    draw: 'Ничья', undo: 'Отменить ход', new_game: 'Новая партия', full: 'Полная версия игры', you: 'Вы: {side}', move_n: 'Ход {n}',
    easy: 'Лёгкий', normal: 'Средний', hard: 'Сложный', rule_vn: 'Вьетнамское каро', rule_free: 'Свободные', rule_std: 'Стандартные',
    rule_renju: 'Рэндзю', puzzle: 'Задача {id}', daily: 'Задача дня', goal: 'Ход {side}. Ходов до победы: {n}',
    tap_key: 'Нажмите на ключевой ход', correct: 'Верно! Это ключевой ход.', wrong: 'Не совсем. Попробуйте ещё раз.',
    reveal: 'Показать решение', next: 'Следующая задача', solution: 'Решение: {move}', hint: 'Рекомендуемый ход для {side}: {move}',
    play_here: 'Играть с этой позиции', error: 'Ошибка: {msg}', checking: 'Проверяем…',
    r_win: 'Сразу выигрывает: линия готова.', r_block: 'Закрывает немедленный выигрыш соперника.',
    r_forced: 'Начинает форсированный выигрыш: ходов до победы — {n}.', r_defend: 'Лучшая защита, но у соперника форсированный выигрыш.',
    r_search: 'Сильнейший найденный ход. Шанс на победу: {p}%.', r_opening: 'Первый ход: в центр доски.',
    board: 'Доска каро', last: 'последний ход',
  },
  zh: {
    your_move: '轮到你', thinking: '电脑正在思考…', you_win: '你赢了！', you_lose: '电脑获胜',
    draw: '和棋', undo: '悔棋', new_game: '新对局', full: '玩完整版', you: '你：{side}', move_n: '第 {n} 手',
    easy: '简单', normal: '普通', hard: '困难', rule_vn: '越南卡罗', rule_free: '自由规则', rule_std: '标准规则',
    rule_renju: '连珠', puzzle: '题目 #{id}', daily: '每日一题', goal: '{side} 先走，{n} 步内取胜',
    tap_key: '点击关键一步', correct: '正确！这就是关键一步。', wrong: '不对，再试一次。',
    reveal: '查看答案', next: '下一题', solution: '答案：{move}', hint: '{side} 的推荐着法：{move}',
    play_here: '从此局面对局', error: '出错了：{msg}', checking: '正在检查…',
    r_win: '立即连成一线获胜。', r_block: '挡住对手的直接取胜。',
    r_forced: '开始必胜进攻，{n} 步内取胜。', r_defend: '最佳防守，但对手已有必胜进攻。',
    r_search: '找到的最强着法。胜率：{p}%。', r_opening: '开局：下在棋盘中央。',
    board: '卡罗棋盘', last: '上一手',
  },
};
