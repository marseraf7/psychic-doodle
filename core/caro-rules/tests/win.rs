//! Port các ca kiểm thắng / bàn cờ / mã luật trong caro/tests/rules.test.js (và rules-board.test.js).
//! Chạy: cd core/caro-rules && cargo test

use caro_rules::*;

fn board_with(rule: Rule, stones: &[(i64, i64, u8)]) -> Board {
    let mut b = Board::new(rule);
    for &(x, y, p) in stones {
        b.play(x, y, p).expect("nước hợp lệ");
    }
    b
}
fn row(xs: &[i64], y: i64, p: u8) -> Vec<(i64, i64, u8)> {
    xs.iter().map(|&x| (x, y, p)).collect()
}
fn vn(stones: &[(i64, i64, u8)]) -> Board {
    board_with(Rule::Vn, stones)
}

#[test]
fn bon_quan_khong_bi_chan_thi_thang() {
    let b = vn(&row(&[0, 1, 2, 3], 0, X));
    assert_eq!(check_win(&b, 3, 0, X), Some(vec![(0, 0), (1, 0), (2, 0), (3, 0)]));
}

#[test]
fn bon_quan_bi_chan_mot_dau_chua_thang() {
    let mut s = row(&[0, 1, 2, 3], 0, X);
    s.push((-1, 0, O));
    assert_eq!(check_win(&vn(&s), 3, 0, X), None);
}

#[test]
fn nam_quan_bi_chan_mot_dau_thang() {
    let mut s = row(&[0, 1, 2, 3, 4], 0, X);
    s.push((-1, 0, O));
    assert!(check_win(&vn(&s), 4, 0, X).is_some());
}

#[test]
fn nam_va_sau_quan_bi_chan_hai_dau_khong_thang() {
    let mut s = row(&[0, 1, 2, 3, 4], 0, X);
    s.extend([(-1, 0, O), (5, 0, O)]);
    assert_eq!(check_win(&vn(&s), 2, 0, X), None);
    let mut s = row(&[0, 1, 2, 3, 4, 5], 0, X);
    s.extend([(-1, 0, O), (6, 0, O)]);
    assert_eq!(check_win(&vn(&s), 2, 0, X), None);
}

#[test]
fn ba_quan_chua_thang() {
    assert_eq!(check_win(&vn(&row(&[0, 1, 2], 0, X)), 2, 0, X), None);
}

#[test]
fn duong_cheo() {
    let b = vn(&[(0, 0, X), (1, 1, X), (2, 2, X), (3, 3, X)]);
    assert!(check_win(&b, 0, 0, X).is_some());
    let b = vn(&[(0, 0, X), (1, -1, X), (2, -2, X), (3, -3, X), (4, -4, X), (5, -5, O)]);
    assert_eq!(check_win(&b, 2, -2, X), Some(vec![(0, 0), (1, -1), (2, -2), (3, -3), (4, -4)]));
}

#[test]
fn toa_do_rat_xa() {
    let b = vn(&row(&[90000, 90001, 90002, 90003], -70000, O));
    assert!(check_win(&b, 90000, -70000, O).is_some());
}

#[test]
fn gomoku_tu_do() {
    let mut b = Board::new(Rule::Free);
    for x in 1..=4 {
        b.put(x, 0, X);
    }
    b.put(0, 0, O);
    b.put(6, 0, O);
    assert!(wins_if_placed(&mut b, 5, 0, X), "chặn hai đầu vẫn thắng");
    for x in [7, 8, 9, 10, 12] {
        b.put(x, 1, X);
    }
    assert!(wins_if_placed(&mut b, 11, 1, X), "quá năm vẫn thắng");
    let mut c = Board::new(Rule::Free);
    for x in 0..3 {
        c.put(x, 0, X);
    }
    assert!(!wins_if_placed(&mut c, 3, 0, X), "4 mở chưa phải thắng");
}

#[test]
fn gomoku_tieu_chuan() {
    let mut b = Board::new(Rule::Std);
    for x in [0, 1, 2, 3, 5] {
        b.put(x, 0, X);
    }
    assert!(!wins_if_placed(&mut b, 4, 0, X), "6 quân không thắng");
    assert!(wins_if_placed(&mut b, -1, 0, X), "phía kia thành đúng 5 thì thắng");
    let mut c = Board::new(Rule::Std);
    for x in 0..4 {
        c.put(x, 0, X);
    }
    c.put(-1, 0, O);
    assert!(wins_if_placed(&mut c, 4, 0, X), "đúng 5, bị chặn 1 đầu vẫn thắng");
    assert_eq!(check_win(&c, 3, 0, X), None, "4 quân chưa thắng");
}

#[test]
fn renju_x_khong_thang_voi_sau_quan_o_thi_co() {
    let mut b = Board::new(Rule::Renju);
    for x in [0, 1, 2, 4, 5] {
        b.put(x, 0, X);
    }
    assert!(!wins_if_placed(&mut b, 3, 0, X));
    let mut w = Board::new(Rule::Renju);
    for x in [0, 1, 2, 4, 5] {
        w.put(x, 0, O);
    }
    assert!(wins_if_placed(&mut w, 3, 0, O));
}

#[test]
fn wins_if_placed_khong_xoa_quan_dang_co() {
    let mut b = vn(&row(&[0, 1, 2, 3], 0, X));
    assert!(!wins_if_placed(&mut b, 2, 0, O));
    assert_eq!(b.get(2, 0), X);
}

#[test]
fn rule_of_luat_la_thanh_vn() {
    assert_eq!(rule_of("abc"), Rule::Vn);
    assert_eq!(rule_of(""), Rule::Vn);
    assert_eq!(rule_of("renju"), Rule::Renju);
    assert_eq!(rule_of("RENJU"), Rule::Vn, "phân biệt hoa thường như RULES.includes");
    for (i, name) in RULES.iter().enumerate() {
        assert_eq!(rule_of(name).id(), i as i32);
        assert_eq!(Rule::from_id(i as i32).name(), *name);
    }
    assert_eq!(Rule::from_id(99), Rule::Vn);
}

#[test]
fn win_len_tung_luat() {
    let t = || true;
    let f = || false;
    assert!(win_len(Rule::Vn, X, 4, t, t));
    assert!(!win_len(Rule::Vn, X, 4, t, f));
    assert!(win_len(Rule::Vn, X, 5, f, t));
    assert!(!win_len(Rule::Vn, X, 7, f, f));
    assert!(win_len(Rule::Free, O, 9, f, f));
    assert!(!win_len(Rule::Std, X, 6, t, t));
    assert!(!win_len(Rule::Renju, X, 6, t, t));
    assert!(win_len(Rule::Renju, O, 6, t, t));
    // Chỉ luật Việt Nam mới hỏi hai đầu
    let mut asked = 0;
    win_len(
        Rule::Free,
        X,
        5,
        || {
            asked += 1;
            true
        },
        || true,
    );
    assert_eq!(asked, 0);
}

#[test]
fn play_undo_va_loi() {
    let mut b = Board::new(Rule::Vn);
    assert_eq!(b.play(0, 0, X), Ok(()));
    assert_eq!(b.play(0, 0, O), Err(PlayError::Occupied));
    assert_eq!(b.play(LIM, 0, O), Err(PlayError::OutOfRange));
    assert_eq!(b.play(0, -LIM - 1, O), Err(PlayError::OutOfRange));
    assert_eq!(b.play(LIM - 1, -LIM, O), Ok(()));
    assert_eq!(b.moves.len(), 2);
    assert_eq!(b.undo(), Some(Move { x: LIM - 1, y: -LIM, p: O }));
    assert_eq!(b.get(LIM - 1, -LIM), EMPTY);
    assert_eq!(b.undo().map(|m| m.p), Some(X));
    assert_eq!(b.undo(), None);
}

#[test]
fn khoa_so_giong_js() {
    // Giá trị tính tay theo công thức JS: (x + 2^20) * 2^21 + (y + 2^20)
    assert_eq!(key(0, 0), (1i64 << 20) * (1 << 21) + (1 << 20));
    assert_eq!(key(-(1 << 20), -(1 << 20)), 0);
    // Ngoài khoảng hợp lệ khóa trùng nhau – đúng như chú thích H-E1 của rules.js: (0,0) trùng (1,-2097152)
    assert_eq!(key(0, 0), key(1, -2097152));
    assert_eq!(other(X), O);
    assert_eq!(other(O), X);
}
