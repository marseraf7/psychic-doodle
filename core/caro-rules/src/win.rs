//! Kiểm thắng – port từ `winLen`, `lineWin`, `checkWin`, `winsIfPlaced` trong caro/rules.js.
//!
//! Luật Việt Nam 'vn' (chặn 2 đầu): chuỗi bị chặn 1 đầu cần >= 5 quân; không bị chặn đầu nào thì >= 4 quân là
//! thắng; bị chặn cả 2 đầu thì không tính (kể cả 5, 6 quân). 'free': >= 5. 'std': đúng 5. 'renju': X đúng 5, O >= 5.

use crate::board::{Board, Rule, DIRS, EMPTY, X};

/// Các ô của chuỗi thắng, theo thứ tự từ đầu "lùi" (-dx,-dy) sang đầu "tiến" (+dx,+dy) – giống mảng JS.
pub type Cells = Vec<(i64, i64)>;

/// Chuỗi liền `len` quân của `p` có thắng theo luật `rule` không? `open_a` / `open_b`: hỏi hai đầu có trống không.
/// Như JS: chỉ luật Việt Nam mới hỏi hai đầu (và hỏi cả hai).
pub fn win_len(rule: Rule, p: u8, len: i64, open_a: impl FnOnce() -> bool, open_b: impl FnOnce() -> bool) -> bool {
    match rule {
        Rule::Free => len >= 5,
        Rule::Std => len == 5,
        Rule::Renju => {
            if p == X {
                len == 5
            } else {
                len >= 5
            }
        }
        Rule::Vn => {
            let a = open_a();
            let b = open_b();
            (len >= 5 && (a || b)) || (len >= 4 && a && b)
        }
    }
}

/// Quân `p` đã nằm ở (x,y). Trả về các ô của chuỗi thắng theo hướng (dx,dy), hoặc None.
pub fn line_win(board: &Board, x: i64, y: i64, dx: i64, dy: i64, p: u8) -> Option<Cells> {
    let mut a = 1;
    while board.get(x - a * dx, y - a * dy) == p {
        a += 1;
    }
    let mut b = 1;
    while board.get(x + b * dx, y + b * dy) == p {
        b += 1;
    }
    let len = a + b - 1;
    if len < 4 {
        return None;
    }
    let win = win_len(
        board.rule,
        p,
        len,
        || board.get(x - a * dx, y - a * dy) == EMPTY,
        || board.get(x + b * dx, y + b * dy) == EMPTY,
    );
    if !win {
        return None;
    }
    let mut cells = Vec::with_capacity(len as usize);
    for i in -(a - 1)..=(b - 1) {
        cells.push((x + i * dx, y + i * dy));
    }
    Some(cells)
}

/// Nước vừa đánh ở (x,y) của `p` có thắng không? Trả về chuỗi thắng của hướng đầu tiên (theo `DIRS`) thắng.
pub fn check_win(board: &Board, x: i64, y: i64, p: u8) -> Option<Cells> {
    for &(dx, dy) in DIRS.iter() {
        if let Some(cells) = line_win(board, x, y, dx, dy, p) {
            return Some(cells);
        }
    }
    None
}

/// Đặt thử `p` vào (x,y) thì có thắng không? Ô đã có quân thì trả về false (không đặt chồng).
pub fn wins_if_placed(board: &mut Board, x: i64, y: i64, p: u8) -> bool {
    if board.get(x, y) != EMPTY {
        return false;
    }
    board.put(x, y, p);
    let w = check_win(board, x, y, p).is_some();
    board.remove(x, y);
    w
}
