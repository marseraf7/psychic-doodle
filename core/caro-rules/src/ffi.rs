//! Giao diện C rất nhỏ cho bản WebAssembly (không dùng wasm-bindgen). Nạp bằng `js/rules-wasm.js`.
//!
//! Trao đổi dữ liệu qua một vùng đệm i32 cố định trong bộ nhớ tuyến tính (`caro_buf` trả về địa chỉ,
//! `caro_buf_cap` trả về số phần tử): JS ghi nước đi vào đó, Rust ghi kết quả (ô của chuỗi thắng…) vào đó.
//! Hai kiểu gọi:
//!  - Có trạng thái: `caro_board_new(luật)` trả về số hiệu bàn; các hàm `caro_get/put/remove/play/undo`,
//!    `caro_check_win`, `caro_wins_if_placed`, `caro_forbidden`… làm việc trên bàn đó (giống API của rules.js).
//!  - Không trạng thái: `caro_check_win_moves(luật, n)` / `caro_forbidden_moves(luật, n, x, y)` nhận n cặp (x,y)
//!    trong vùng đệm (X đi trước, xen kẽ) – dựng bàn tạm, trả kết quả.
//!
//! Mã luật: 0 vn, 1 free, 2 std, 3 renju (lạ -> vn). Mã cấm: 0 không, 1 quá năm, 2 bốn-bốn, 3 ba-ba.
//! Quân chỉ nhận 1 (X) hoặc 2 (O): giá trị khác bị từ chối (bản JS sẽ lặp vô hạn với quân 0).

use crate::board::{key, rule_of, Board, Rule, EMPTY, O, X};
use crate::renju::{forbidden, forbidden_at, may_forbid, Forbid};
use crate::win::{check_win, line_win, win_len, wins_if_placed, Cells};
use std::cell::RefCell;

/// Sức chứa vùng đệm (số i32): đủ 4096 nước dạng (x, y, quân).
const BUF_CAP: usize = 3 * 4096;

struct State {
    boards: Vec<Option<Board>>,
    buf: Vec<i32>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State { boards: Vec::new(), buf: vec![0; BUF_CAP] });
}

#[inline]
fn stone_ok(p: i32) -> bool {
    p == X as i32 || p == O as i32
}

/// Chạy `f` trên bàn số `h` (bàn không tồn tại -> trả `dflt`).
#[inline]
fn with_board<R>(h: i32, dflt: R, f: impl FnOnce(&mut Board, &mut Vec<i32>) -> R) -> R {
    STATE.with(|s| {
        let st = &mut *s.borrow_mut();
        match st.boards.get_mut(h as usize) {
            Some(Some(b)) if h >= 0 => f(b, &mut st.buf),
            _ => dflt,
        }
    })
}

/// Ghi các ô của chuỗi thắng vào vùng đệm dạng x0,y0,x1,y1…; trả về số ô (0 = không thắng).
fn write_cells(cells: Option<Cells>, buf: &mut [i32]) -> i32 {
    match cells {
        None => 0,
        Some(c) => {
            let n = c.len().min(buf.len() / 2);
            for (i, &(x, y)) in c.iter().take(n).enumerate() {
                buf[2 * i] = x as i32;
                buf[2 * i + 1] = y as i32;
            }
            n as i32
        }
    }
}

#[no_mangle]
pub extern "C" fn caro_buf() -> *mut i32 {
    STATE.with(|s| s.borrow_mut().buf.as_mut_ptr())
}

#[no_mangle]
pub extern "C" fn caro_buf_cap() -> i32 {
    BUF_CAP as i32
}

/// `ruleOf` cho chuỗi: n byte (UTF-8) đặt ở đầu vùng đệm -> mã luật.
#[no_mangle]
pub extern "C" fn caro_rule_of(n: i32) -> i32 {
    STATE.with(|s| {
        let st = s.borrow();
        let n = (n.max(0) as usize).min(BUF_CAP * 4);
        let bytes: Vec<u8> = st.buf.iter().flat_map(|v| v.to_le_bytes()).take(n).collect();
        match std::str::from_utf8(&bytes) {
            Ok(t) => rule_of(t).id(),
            Err(_) => Rule::Vn.id(),
        }
    })
}

/// `key(x, y)` trả về dạng số thực (giá trị luôn < 2^53 nên đúng từng bit như JS).
#[no_mangle]
pub extern "C" fn caro_key(x: i32, y: i32) -> f64 {
    key(x as i64, y as i64) as f64
}

#[no_mangle]
pub extern "C" fn caro_win_len(rule: i32, p: i32, len: i32, open_a: i32, open_b: i32) -> i32 {
    win_len(Rule::from_id(rule), p as u8, len as i64, || open_a != 0, || open_b != 0) as i32
}

/// Tạo bàn mới, trả về số hiệu (dùng lại chỗ của bàn đã giải phóng).
#[no_mangle]
pub extern "C" fn caro_board_new(rule: i32) -> i32 {
    STATE.with(|s| {
        let st = &mut *s.borrow_mut();
        let b = Board::new(Rule::from_id(rule));
        if let Some(i) = st.boards.iter().position(|v| v.is_none()) {
            st.boards[i] = Some(b);
            i as i32
        } else {
            st.boards.push(Some(b));
            (st.boards.len() - 1) as i32
        }
    })
}

#[no_mangle]
pub extern "C" fn caro_board_free(h: i32) {
    STATE.with(|s| {
        if let Some(slot) = s.borrow_mut().boards.get_mut(h.max(0) as usize) {
            *slot = None;
        }
    })
}

/// Mã luật của bàn (-1 nếu không có bàn).
#[no_mangle]
pub extern "C" fn caro_board_rule(h: i32) -> i32 {
    with_board(h, -1, |b, _| b.rule.id())
}

#[no_mangle]
pub extern "C" fn caro_get(h: i32, x: i32, y: i32) -> i32 {
    with_board(h, 0, |b, _| b.get(x as i64, y as i64) as i32)
}

#[no_mangle]
pub extern "C" fn caro_put(h: i32, x: i32, y: i32, p: i32) {
    with_board(h, (), |b, _| b.put(x as i64, y as i64, p as u8))
}

#[no_mangle]
pub extern "C" fn caro_remove(h: i32, x: i32, y: i32) {
    with_board(h, (), |b, _| b.remove(x as i64, y as i64))
}

/// Đánh một nước: 0 = được, 1 = 'out_of_range', 2 = 'occupied', -1 = không có bàn / quân sai.
#[no_mangle]
pub extern "C" fn caro_play(h: i32, x: i32, y: i32, p: i32) -> i32 {
    if !stone_ok(p) {
        return -1;
    }
    with_board(h, -1, |b, _| match b.play(x as i64, y as i64, p as u8) {
        Ok(()) => 0,
        Err(crate::board::PlayError::OutOfRange) => 1,
        Err(crate::board::PlayError::Occupied) => 2,
    })
}

/// Lùi nước cuối: 1 và ghi (x, y, quân) vào vùng đệm; 0 nếu không còn nước.
#[no_mangle]
pub extern "C" fn caro_undo(h: i32) -> i32 {
    with_board(h, 0, |b, buf| match b.undo() {
        Some(m) => {
            buf[0] = m.x as i32;
            buf[1] = m.y as i32;
            buf[2] = m.p as i32;
            1
        }
        None => 0,
    })
}

/// Số nước đã đánh; ghi tối đa sức chứa vùng đệm các bộ (x, y, quân) vào vùng đệm.
#[no_mangle]
pub extern "C" fn caro_moves(h: i32) -> i32 {
    with_board(h, 0, |b, buf| {
        let n = b.moves.len().min(BUF_CAP / 3);
        for (i, m) in b.moves.iter().take(n).enumerate() {
            buf[3 * i] = m.x as i32;
            buf[3 * i + 1] = m.y as i32;
            buf[3 * i + 2] = m.p as i32;
        }
        b.moves.len() as i32
    })
}

#[no_mangle]
pub extern "C" fn caro_check_win(h: i32, x: i32, y: i32, p: i32) -> i32 {
    if !stone_ok(p) {
        return 0;
    }
    with_board(h, 0, |b, buf| write_cells(check_win(b, x as i64, y as i64, p as u8), buf))
}

#[no_mangle]
pub extern "C" fn caro_line_win(h: i32, x: i32, y: i32, dx: i32, dy: i32, p: i32) -> i32 {
    if !stone_ok(p) || (dx == 0 && dy == 0) {
        return 0;
    }
    with_board(h, 0, |b, buf| write_cells(line_win(b, x as i64, y as i64, dx as i64, dy as i64, p as u8), buf))
}

#[no_mangle]
pub extern "C" fn caro_wins_if_placed(h: i32, x: i32, y: i32, p: i32) -> i32 {
    if !stone_ok(p) {
        return 0;
    }
    with_board(h, 0, |b, _| wins_if_placed(b, x as i64, y as i64, p as u8) as i32)
}

#[no_mangle]
pub extern "C" fn caro_forbidden(h: i32, x: i32, y: i32, p: i32) -> i32 {
    with_board(h, 0, |b, _| Forbid::code(forbidden(b, x as i64, y as i64, p as u8)))
}

/// Chỉ để kiểm tra: bước lọc nhanh `mayForbid` (1/0).
#[no_mangle]
pub extern "C" fn caro_may_forbid(h: i32, x: i32, y: i32) -> i32 {
    with_board(h, 0, |b, _| may_forbid(b, x as i64, y as i64) as i32)
}

/// Chỉ để kiểm tra: `forbiddenAt` không qua bước lọc nhanh (ô phải trống; ô có quân -> 0).
#[no_mangle]
pub extern "C" fn caro_forbidden_raw(h: i32, x: i32, y: i32) -> i32 {
    with_board(h, 0, |b, _| {
        if b.get(x as i64, y as i64) != EMPTY {
            return 0;
        }
        Forbid::code(forbidden_at(b, x as i64, y as i64))
    })
}

/// Dựng bàn tạm từ n cặp (x,y) trong vùng đệm (X đi trước, xen kẽ). None nếu có nước không hợp lệ.
fn board_from_pairs(rule: i32, n: i32, buf: &[i32]) -> Option<Board> {
    let n = (n.max(0) as usize).min(buf.len() / 2);
    let mut b = Board::new(Rule::from_id(rule));
    for i in 0..n {
        let p = if i % 2 == 0 { X } else { O };
        b.play(buf[2 * i] as i64, buf[2 * i + 1] as i64, p).ok()?;
    }
    Some(b)
}

/// Không trạng thái: nước cuối trong n cặp có thắng không? Trả về số ô thắng (ô ghi vào vùng đệm), 0 nếu không,
/// -1 nếu dãy nước không hợp lệ.
#[no_mangle]
pub extern "C" fn caro_check_win_moves(rule: i32, n: i32) -> i32 {
    STATE.with(|s| {
        let st = &mut *s.borrow_mut();
        let b = match board_from_pairs(rule, n, &st.buf) {
            Some(b) => b,
            None => return -1,
        };
        match b.moves.last() {
            None => 0,
            Some(m) => write_cells(check_win(&b, m.x, m.y, m.p), &mut st.buf),
        }
    })
}

/// Không trạng thái: sau n cặp nước trong vùng đệm, X đánh (x,y) có bị cấm không? Mã cấm, -1 nếu dãy sai.
#[no_mangle]
pub extern "C" fn caro_forbidden_moves(rule: i32, n: i32, x: i32, y: i32) -> i32 {
    STATE.with(|s| {
        let st = &mut *s.borrow_mut();
        match board_from_pairs(rule, n, &st.buf) {
            Some(mut b) => Forbid::code(forbidden(&mut b, x as i64, y as i64, X)),
            None => -1,
        }
    })
}

/// Chỉ để đo: gọi `check_win` `iters` lần ngay trong WASM (không qua ranh giới JS) – trả về tổng số ô.
#[no_mangle]
pub extern "C" fn caro_repeat_check_win(h: i32, x: i32, y: i32, p: i32, iters: i32) -> i32 {
    if !stone_ok(p) {
        return 0;
    }
    with_board(h, 0, |b, _| {
        let mut s = 0i32;
        for _ in 0..iters {
            let r = check_win(std::hint::black_box(&*b), x as i64, y as i64, p as u8);
            s = s.wrapping_add(r.map_or(0, |c| c.len() as i32));
        }
        s
    })
}

/// Chỉ để đo: gọi `forbidden` `iters` lần ngay trong WASM – trả về tổng mã cấm.
#[no_mangle]
pub extern "C" fn caro_repeat_forbidden(h: i32, x: i32, y: i32, p: i32, iters: i32) -> i32 {
    with_board(h, 0, |b, _| {
        let mut s = 0i32;
        for _ in 0..iters {
            let b = std::hint::black_box(&mut *b);
            s = s.wrapping_add(Forbid::code(forbidden(b, x as i64, y as i64, p as u8)));
        }
        s
    })
}
