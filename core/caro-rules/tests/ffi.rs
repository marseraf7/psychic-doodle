//! Kiểm giao diện C (gọi trực tiếp các hàm `caro_*` trên máy, không qua WASM).

use caro_rules::ffi::*;

fn write_pairs(pairs: &[(i32, i32)]) {
    let p = caro_buf();
    for (i, &(x, y)) in pairs.iter().enumerate() {
        unsafe {
            *p.add(2 * i) = x;
            *p.add(2 * i + 1) = y;
        }
    }
}
fn buf(i: usize) -> i32 {
    unsafe { *caro_buf().add(i) }
}

#[test]
fn ban_co_trang_thai() {
    let h = caro_board_new(0);
    assert_eq!(caro_board_rule(h), 0);
    for x in 0..4 {
        assert_eq!(caro_play(h, x, 0, 1), 0);
    }
    assert_eq!(caro_play(h, 0, 0, 2), 2, "occupied");
    assert_eq!(caro_play(h, 1 << 20, 0, 2), 1, "out_of_range");
    assert_eq!(caro_play(h, 5, 5, 0), -1, "quân sai");
    assert_eq!(caro_check_win(h, 3, 0, 1), 4);
    assert_eq!((buf(0), buf(1), buf(6), buf(7)), (0, 0, 3, 0));
    assert_eq!(caro_line_win(h, 3, 0, 0, 1, 1), 0);
    assert_eq!(caro_wins_if_placed(h, 4, 4, 1), 0);
    assert_eq!(caro_moves(h), 4);
    assert_eq!(caro_undo(h), 1);
    assert_eq!((buf(0), buf(1), buf(2)), (3, 0, 1));
    assert_eq!(caro_get(h, 3, 0), 0);
    caro_board_free(h);
    assert_eq!(caro_board_rule(h), -1, "bàn đã giải phóng");
    assert_eq!(caro_check_win(h, 0, 0, 1), 0);
}

#[test]
fn nuoc_cam_va_khong_trang_thai() {
    let h = caro_board_new(3);
    for (x, y) in [(1, 0), (2, 0), (0, 1), (0, 2)] {
        caro_put(h, x, y, 1);
    }
    assert_eq!(caro_forbidden(h, 0, 0, 1), 3);
    assert_eq!(caro_forbidden(h, 0, 0, 2), 0);
    assert_eq!(caro_may_forbid(h, 0, 0), 1);
    assert_eq!(caro_forbidden_raw(h, 0, 0), 3);
    caro_board_free(h);

    // Thế "lure": X (1,0) O (9,9) X (2,0) O (9,10) X (0,1) O (10,9) X (0,2) O (8,8)
    let seq = [(1, 0), (9, 9), (2, 0), (9, 10), (0, 1), (10, 9), (0, 2), (8, 8)];
    write_pairs(&seq);
    assert_eq!(caro_forbidden_moves(3, 8, 0, 0), 3);
    write_pairs(&seq);
    assert_eq!(caro_forbidden_moves(0, 8, 0, 0), 0, "luật vn không cấm");
    write_pairs(&[(0, 0), (0, 0)]);
    assert_eq!(caro_forbidden_moves(3, 2, 1, 1), -1, "dãy nước sai");

    write_pairs(&[(0, 0), (0, 5), (1, 0), (1, 5), (2, 0), (2, 5), (3, 0)]);
    assert_eq!(caro_check_win_moves(0, 7), 4);
    write_pairs(&[(0, 0), (0, 5), (1, 0), (1, 5), (2, 0), (2, 5), (3, 0)]);
    assert_eq!(caro_check_win_moves(1, 7), 0, "free cần 5");
}

#[test]
fn ma_luat_khoa_win_len() {
    let p = caro_buf() as *mut u8;
    for (i, b) in b"renju".iter().enumerate() {
        unsafe { *p.add(i) = *b };
    }
    assert_eq!(caro_rule_of(5), 3);
    assert_eq!(caro_rule_of(4), 0, "'renj' lạ -> vn");
    assert_eq!(caro_key(0, 0), ((1u64 << 41) + (1 << 20)) as f64);
    assert_eq!(caro_win_len(0, 1, 4, 1, 1), 1);
    assert_eq!(caro_win_len(2, 1, 6, 1, 1), 0);
    assert_eq!(caro_repeat_check_win(-5, 0, 0, 1, 3), 0);
}
