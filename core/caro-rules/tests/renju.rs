//! Port các ca nước cấm Renju trong caro/tests/rules.test.js (kể cả ca 3-3 thật / giả theo RIF 9.3).
//! Sơ đồ thế cờ xem chú thích trong file JS đó.

use caro_rules::*;

fn mk(xs: &[(i64, i64)], os: &[(i64, i64)]) -> Board {
    let mut b = Board::new(Rule::Renju);
    for &(x, y) in xs {
        b.put(x, y, X);
    }
    for &(x, y) in os {
        b.put(x, y, O);
    }
    b
}
fn fb(b: &mut Board) -> Option<&'static str> {
    forbidden(b, 0, 0, X).map(|f| f.as_str())
}

#[test]
fn ba_ba_co_ban() {
    assert_eq!(fb(&mut mk(&[(1, 0), (2, 0), (0, 1), (0, 2)], &[])), Some("33"));
    assert_eq!(fb(&mut mk(&[(1, 0), (3, 0), (0, 1), (0, 2)], &[])), Some("33"), "ba gãy (có khe) cũng tính");
    assert_eq!(fb(&mut mk(&[(1, 0), (2, 0), (0, 1), (0, 2)], &[(3, 0)])), None, "một đường ba bị chặn");
}

#[test]
fn bon_bon_qua_nam_bon_ba() {
    let mut b = mk(&[(1, 0), (2, 0), (3, 0), (0, 1), (0, 2), (0, 3)], &[(-1, 0), (0, -1)]);
    assert_eq!(fb(&mut b), Some("44"));
    assert_eq!(fb(&mut mk(&[(-3, 0), (-1, 0), (1, 0), (3, 0)], &[])), Some("44"), "4-4 trên cùng một đường");
    assert_eq!(fb(&mut mk(&[(1, 0), (2, 0), (3, 0), (0, 1), (0, 2)], &[(-1, 0)])), None, "4-3 được phép");
    assert_eq!(fb(&mut mk(&[(1, 0), (2, 0), (3, 0), (-1, 0), (-2, 0)], &[])), Some("overline"));
    let mut five = mk(&[(1, 0), (2, 0), (3, 0), (4, 0), (0, 1), (0, 2), (0, 3)], &[(0, -1)]);
    assert_eq!(fb(&mut five), None, "thành năm thì thắng, không cấm");
}

#[test]
fn o_va_luat_khac_khong_bi_cam() {
    let mut b = mk(&[(1, 0), (2, 0), (0, 1), (0, 2)], &[]);
    assert_eq!(forbidden(&mut b, 0, 0, O), None);
    let mut vn = Board::new(Rule::Vn);
    for (x, y) in [(1, 0), (2, 0), (0, 1), (0, 2)] {
        vn.put(x, y, X);
    }
    assert_eq!(forbidden(&mut vn, 0, 0, X), None, "luật Việt Nam không có nước cấm");
    assert_eq!(forbidden(&mut b, 1, 0, X), None, "ô đã có quân");
}

#[test]
fn ba_ba_that_gia_theo_rif_9_3() {
    let mut fake = mk(&[(1, 0), (2, 0), (0, 1), (0, 2), (-1, -3), (-1, -1), (-2, -2), (-3, -2), (-3, -1)], &[]);
    assert_eq!(fb(&mut fake), Some("33"), "thế 'giả' cũ: thật ra là 3-3 thật theo RIF 9.3");
    assert_eq!(fb(&mut mk(&[(1, 0), (2, 0), (0, 1), (0, 2)], &[(0, 3)])), None, "ba dọc bị chặn một đầu");
    let mut fake44 = mk(&[(1, 0), (2, 0), (0, 1), (0, 2), (1, -1), (2, -1), (3, -1)], &[(0, 4)]);
    assert_eq!(fb(&mut fake44), None, "3-3 giả: ô bốn duy nhất của ba dọc là điểm 4-4");
    let mut real43 = mk(&[(1, 0), (2, 0), (0, 1), (0, 2), (1, -1), (2, -1)], &[(0, 4)]);
    assert_eq!(fb(&mut real43), Some("33"), "ô bốn là điểm 4-3 hợp lệ: vẫn là 3-3 thật");
    let mut fake33 = mk(&[(1, 0), (2, 0), (0, 1), (0, 2), (1, -1), (2, -1), (1, -2), (2, -3)], &[(0, 4)]);
    assert_eq!(fb(&mut fake33), None, "3-3 giả đệ quy: ô bốn duy nhất là điểm 3-3");
    let mut real33 = mk(&[(1, 0), (2, 0), (0, 1), (0, 2), (1, -1), (2, -1), (1, -2)], &[(0, 4)]);
    assert_eq!(fb(&mut real33), Some("33"), "bỏ (2,-3): ô bốn hợp lệ, 3-3 thật");
}

#[test]
fn the_du_ai_ba_ba() {
    // Thế "lure" trong rules.test.js (phần AI không port, chỉ kiểm ô cấm)
    let mut b = Board::new(Rule::Renju);
    let seq = [(1, 0), (9, 9), (2, 0), (9, 10), (0, 1), (10, 9), (0, 2), (8, 8)];
    for (i, &(x, y)) in seq.iter().enumerate() {
        b.play(x, y, if i % 2 == 1 { O } else { X }).unwrap();
    }
    assert_eq!(fb(&mut b), Some("33"));
}

#[test]
fn ham_cam_khong_lam_doi_ban() {
    let mut b = mk(&[(1, 0), (2, 0), (0, 1), (0, 2), (1, -1), (2, -1), (1, -2)], &[(0, 4)]);
    let before: Vec<u8> = (-6..=6).flat_map(|x| (-6..=6).map(move |y| (x, y))).map(|(x, y)| b.get(x, y)).collect();
    for x in -6..=6 {
        for y in -6..=6 {
            let _ = forbidden(&mut b, x, y, X);
            if b.get(x, y) == EMPTY {
                let _ = forbidden_at(&mut b, x, y);
            }
        }
    }
    let after: Vec<u8> = (-6..=6).flat_map(|x| (-6..=6).map(move |y| (x, y))).map(|(x, y)| b.get(x, y)).collect();
    assert_eq!(before, after);
}

#[test]
fn loc_nhanh_khong_bo_sot_cac_ca_mau() {
    // Mọi ca cấm ở trên đều phải qua được bước lọc nhanh
    for xs in [
        vec![(1, 0), (2, 0), (0, 1), (0, 2)],
        vec![(-3, 0), (-1, 0), (1, 0), (3, 0)],
        vec![(1, 0), (2, 0), (3, 0), (-1, 0), (-2, 0)],
    ] {
        let mut b = mk(&xs, &[]);
        assert!(forbidden_at(&mut b, 0, 0).is_some());
        assert!(may_forbid(&b, 0, 0));
    }
}
