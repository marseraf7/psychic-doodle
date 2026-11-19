//! Nước cấm Renju (chỉ quân X / đen) – port từ `runLen`, `fiveSpots`, `foursOnLine`, `threeOnLine`,
//! `forbiddenAt`, `runLen2`, `mayForbid`, `forbidden` trong caro/rules.js.
//!
//! Định nghĩa theo luật RIF (như chú thích bản JS):
//!  - Năm: đúng 5 quân liền. Thắng luôn được ưu tiên hơn nước cấm.
//!  - Bốn: một đường mà thêm 1 quân là thành đúng 5. "Bốn thẳng" (_XXXX_) có 2 ô thành 5 nhưng chỉ là 1 bốn;
//!    hai ô thành 5 cách nhau không phải 5 ô (vd. X_XXX_X) là 2 bốn trên cùng một đường.
//!  - Ba (ba mở): một đường mà thêm 1 quân (ở ô không bị cấm, xét đệ quy tới độ sâu 2) thành bốn thẳng.
//!  - Cấm: quá năm (>= 6 quân), hai bốn trở lên (4-4), hai ba trở lên (3-3).

use crate::board::{Board, Rule, DIRS, EMPTY, X};

/// Lý do cấm: cùng chuỗi với JS ('overline' | '44' | '33'); mã số 1 | 2 | 3 ở giao diện C (0 = không cấm).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Forbid {
    Overline = 1,
    FourFour = 2,
    ThreeThree = 3,
}

impl Forbid {
    pub fn as_str(self) -> &'static str {
        match self {
            Forbid::Overline => "overline",
            Forbid::FourFour => "44",
            Forbid::ThreeThree => "33",
        }
    }
    /// Mã số cho giao diện C: None -> 0.
    pub fn code(f: Option<Forbid>) -> i32 {
        match f {
            None => 0,
            Some(v) => v as i32,
        }
    }
}

/// Ô (x,y) đang trống (hoặc đã có đen): độ dài chuỗi đen liền qua (x,y) theo hướng (dx,dy) nếu đen nằm ở đó.
/// Bản JS có hai hàm giống hệt nhau (`runLen` cho ô trống, `runLen2` cho ô đã có đen) – ở đây dùng chung một hàm.
fn run_len(board: &Board, x: i64, y: i64, dx: i64, dy: i64) -> i64 {
    let mut a = 1;
    while board.get(x - a * dx, y - a * dy) == X {
        a += 1;
    }
    let mut b = 1;
    while board.get(x + b * dx, y + b * dy) == X {
        b += 1;
    }
    a + b - 1
}

/// Tối đa 8 chỉ số k (k = -4..4, bỏ 0), giữ thứ tự tăng dần như mảng `out` của JS.
struct Spots {
    k: [i64; 8],
    n: usize,
}

/// Đen (đã nằm ở (x,y)) có những ô nào trên đường (dx,dy) mà đánh vào thành đúng 5 (chuỗi phải chứa (x,y))?
fn five_spots(board: &mut Board, x: i64, y: i64, dx: i64, dy: i64) -> Spots {
    let mut out = Spots { k: [0; 8], n: 0 };
    for k in -4..=4i64 {
        if k == 0 {
            continue;
        }
        let (cx, cy) = (x + k * dx, y + k * dy);
        if board.get(cx, cy) != EMPTY {
            continue;
        }
        board.put(cx, cy, X);
        let mut a = 1;
        while board.get(cx - a * dx, cy - a * dy) == X {
            a += 1;
        }
        let mut b = 1;
        while board.get(cx + b * dx, cy + b * dy) == X {
            b += 1;
        }
        board.remove(cx, cy);
        if a + b - 1 == 5 && k - (a - 1) <= 0 && k + (b - 1) >= 0 {
            out.k[out.n] = k;
            out.n += 1;
        }
    }
    out
}

/// Hai ô thành 5 cách nhau đúng 5 ô: đó là một "bốn thẳng".
#[inline]
fn is_straight_pair(f: &Spots) -> bool {
    f.n == 2 && (f.k[1] - f.k[0]).abs() == 5
}

/// Số "bốn" trên một đường (bốn thẳng tính là 1).
fn fours_on_line(board: &mut Board, x: i64, y: i64, dx: i64, dy: i64) -> i64 {
    let f = five_spots(board, x, y, dx, dy);
    if is_straight_pair(&f) {
        return 1;
    }
    f.n as i64
}

/// Đường (dx,dy) qua (x,y) có "ba mở" không: thêm 1 quân ở ô không cấm thì thành bốn thẳng.
fn three_on_line(board: &mut Board, x: i64, y: i64, dx: i64, dy: i64, depth: i32) -> bool {
    for k in -4..=4i64 {
        if k == 0 {
            continue;
        }
        let (cx, cy) = (x + k * dx, y + k * dy);
        if board.get(cx, cy) != EMPTY {
            continue;
        }
        board.put(cx, cy, X);
        let f = five_spots(board, x, y, dx, dy);
        let straight = is_straight_pair(&f) && run_len(board, cx, cy, dx, dy) == 4;
        board.remove(cx, cy);
        if straight && (depth <= 0 || forbidden_at_depth(board, cx, cy, depth - 1).is_none()) {
            return true;
        }
    }
    false
}

/// Đặt đen vào ô trống (x,y) có phải nước cấm không? Độ sâu mặc định 2 như JS.
pub fn forbidden_at(board: &mut Board, x: i64, y: i64) -> Option<Forbid> {
    forbidden_at_depth(board, x, y, 2)
}

/// Như `forbidden_at` với độ sâu đệ quy cho phép (độ sâu dùng khi xét ô bốn của một đường ba có hợp lệ không).
pub fn forbidden_at_depth(board: &mut Board, x: i64, y: i64, depth: i32) -> Option<Forbid> {
    board.put(x, y, X);
    let r = forbidden_placed(board, x, y, depth);
    // Tương đương khối `finally` của JS: luôn gỡ quân đặt thử
    board.remove(x, y);
    r
}

/// Thân của `forbiddenAt` khi đen đã nằm ở (x,y).
fn forbidden_placed(board: &mut Board, x: i64, y: i64, depth: i32) -> Option<Forbid> {
    let (mut five, mut over) = (false, false);
    for &(dx, dy) in DIRS.iter() {
        let n = run_len(board, x, y, dx, dy);
        if n == 5 {
            five = true;
        } else if n > 5 {
            over = true;
        }
    }
    if five {
        return None;
    }
    if over {
        return Some(Forbid::Overline);
    }
    let (mut fours, mut threes) = (0, 0);
    for &(dx, dy) in DIRS.iter() {
        let f = fours_on_line(board, x, y, dx, dy);
        fours += f;
        if f == 0 && three_on_line(board, x, y, dx, dy, depth) {
            threes += 1;
        }
    }
    if fours >= 2 {
        return Some(Forbid::FourFour);
    }
    if threes >= 2 {
        return Some(Forbid::ThreeThree);
    }
    None
}

/// Lọc nhanh: (x,y) chỉ có thể là nước cấm nếu >= 2 hướng có >= 2 quân đen gần (<= 4 ô, chưa bị chặn) hoặc một
/// hướng có >= 3, hoặc có thể thành quá năm.
pub fn may_forbid(board: &Board, x: i64, y: i64) -> bool {
    let mut lines = 0;
    for &(dx, dy) in DIRS.iter() {
        let mut n = 0;
        for k in 1..=4 {
            let v = board.get(x + k * dx, y + k * dy);
            if v == X {
                n += 1;
            } else if v != EMPTY {
                break;
            }
        }
        for k in 1..=4 {
            let v = board.get(x - k * dx, y - k * dy);
            if v == X {
                n += 1;
            } else if v != EMPTY {
                break;
            }
        }
        if n >= 3 {
            return true; // có thể 4-4 trên cùng một đường (X_XXX_X)
        }
        if n >= 2 {
            lines += 1;
        }
        if lines >= 2 {
            return true;
        }
        if run_len(board, x, y, dx, dy) >= 6 {
            return true;
        }
    }
    false
}

/// `p` đánh vào ô trống (x,y) có bị cấm không (chỉ luật Renju, chỉ quân X)? Trả về lý do hoặc None.
pub fn forbidden(board: &mut Board, x: i64, y: i64, p: u8) -> Option<Forbid> {
    if board.rule != Rule::Renju || p != X || board.get(x, y) != EMPTY {
        return None;
    }
    if !may_forbid(board, x, y) {
        return None;
    }
    forbidden_at(board, x, y)
}
