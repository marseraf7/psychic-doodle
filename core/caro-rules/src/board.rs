//! Mã luật và bàn cờ vô hạn – port từ `RULES`, `ruleOf`, `key`, `other`, lớp `Board` trong caro/rules.js.
//! Bàn chỉ lưu các ô đã đánh, tra bằng khóa số giống hệt bản JS (kể cả chỗ khóa trùng khi toạ độ ra ngoài
//! khoảng [-2^20, 2^20) – `play()` chặn khoảng này như JS).

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

pub const EMPTY: u8 = 0;
pub const X: u8 = 1;
pub const O: u8 = 2;
/// Bốn hướng: ngang, dọc, chéo xuôi, chéo ngược – cùng thứ tự với `DIRS` của JS (thứ tự này quyết định
/// `check_win` trả về đường nào khi có nhiều đường thắng).
pub const DIRS: [(i64, i64); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];

const OFF: i64 = 1 << 20;
const SPAN: i64 = 1 << 21;
/// Toạ độ hợp lệ cho `play()`: -LIM <= x, y < LIM.
pub const LIM: i64 = 1 << 20;

/// Khóa số của ô (x,y): (x + 2^20) * 2^21 + (y + 2^20). Với toạ độ i32 giá trị luôn dưới 2^53 nên trùng khớp
/// từng bit với số thực JS tính ra.
#[inline]
pub fn key(x: i64, y: i64) -> i64 {
    (x + OFF) * SPAN + (y + OFF)
}

/// Quân của đối thủ (X <-> O).
#[inline]
pub fn other(p: u8) -> u8 {
    3u8.wrapping_sub(p)
}

/// Bốn luật: Việt Nam (chặn 2 đầu, mặc định), Gomoku tự do, Gomoku tiêu chuẩn, Renju.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Rule {
    Vn = 0,
    Free = 1,
    Std = 2,
    Renju = 3,
}

/// Tên luật theo thứ tự mã số (mã số = chỉ số trong mảng, dùng ở giao diện C).
pub const RULES: [&str; 4] = ["vn", "free", "std", "renju"];

impl Rule {
    /// Mã số lạ -> luật Việt Nam (giống `ruleOf` với chuỗi lạ).
    pub fn from_id(id: i32) -> Rule {
        match id {
            1 => Rule::Free,
            2 => Rule::Std,
            3 => Rule::Renju,
            _ => Rule::Vn,
        }
    }
    pub fn id(self) -> i32 {
        self as i32
    }
    pub fn name(self) -> &'static str {
        RULES[self as usize]
    }
}

/// `ruleOf`: tên luật có trong `RULES` thì giữ, không thì là 'vn'.
pub fn rule_of(r: &str) -> Rule {
    match r {
        "free" => Rule::Free,
        "std" => Rule::Std,
        "renju" => Rule::Renju,
        _ => Rule::Vn,
    }
}

/// Hàm băm cho khóa i64: bộ trộn cuối của MurmurHash3 (fmix64). Viết tay để không cần crate ngoài; nhanh hơn
/// SipHash mặc định nhiều mà các bit thấp vẫn đủ đều (HashMap của std chọn ô theo bit thấp).
#[derive(Default)]
pub struct KeyHasher(u64);

impl Hasher for KeyHasher {
    #[inline]
    fn finish(&self) -> u64 {
        let mut h = self.0;
        h ^= h >> 33;
        h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
        h ^= h >> 33;
        h = h.wrapping_mul(0xc4ce_b9fe_1a85_ec53);
        h ^ (h >> 33)
    }
    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        // Chỉ dùng khi băm kiểu khác i64 (không xảy ra trong crate này); vẫn viết cho đúng.
        for &b in bytes {
            self.0 = (self.0.rotate_left(8)) ^ b as u64;
        }
    }
    #[inline]
    fn write_i64(&mut self, v: i64) {
        self.0 = v as u64;
    }
}

type CellMap = HashMap<i64, u8, BuildHasherDefault<KeyHasher>>;

/// Một nước đã đánh.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Move {
    pub x: i64,
    pub y: i64,
    pub p: u8,
}

/// Lỗi của `play()`: cùng tên với lỗi JS ném ra ('out_of_range', 'occupied').
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlayError {
    OutOfRange,
    Occupied,
}

impl PlayError {
    pub fn as_str(self) -> &'static str {
        match self {
            PlayError::OutOfRange => "out_of_range",
            PlayError::Occupied => "occupied",
        }
    }
}

/// Bàn cờ vô hạn: `cells` (khóa số -> quân), `moves` (các nước theo thứ tự), `rule`.
#[derive(Clone, Debug)]
pub struct Board {
    cells: CellMap,
    pub moves: Vec<Move>,
    pub rule: Rule,
}

impl Board {
    pub fn new(rule: Rule) -> Board {
        Board { cells: CellMap::default(), moves: Vec::new(), rule }
    }

    #[inline]
    pub fn get(&self, x: i64, y: i64) -> u8 {
        match self.cells.get(&key(x, y)) {
            Some(&v) => v,
            None => EMPTY,
        }
    }

    /// Đặt quân không kiểm tra gì (như `put` của JS; dùng cho đặt thử và dựng thế cờ).
    #[inline]
    pub fn put(&mut self, x: i64, y: i64, p: u8) {
        self.cells.insert(key(x, y), p);
    }

    #[inline]
    pub fn remove(&mut self, x: i64, y: i64) {
        self.cells.remove(&key(x, y));
    }

    /// Đánh một nước: chặn toạ độ ngoài [-2^20, 2^20) (khóa số hết đơn ánh) và ô đã có quân, giống JS.
    pub fn play(&mut self, x: i64, y: i64, p: u8) -> Result<(), PlayError> {
        if !((-LIM..LIM).contains(&x) && (-LIM..LIM).contains(&y)) {
            return Err(PlayError::OutOfRange);
        }
        if self.get(x, y) != EMPTY {
            return Err(PlayError::Occupied);
        }
        self.put(x, y, p);
        self.moves.push(Move { x, y, p });
        Ok(())
    }

    /// Lùi nước cuối (nếu có) và trả về nước đó.
    pub fn undo(&mut self) -> Option<Move> {
        let m = self.moves.pop();
        if let Some(m) = m {
            self.remove(m.x, m.y);
        }
        m
    }

    /// Xoá sạch bàn (giữ luật) – dùng khi nạp lại thế cờ qua giao diện C.
    pub fn clear(&mut self) {
        self.cells.clear();
        self.moves.clear();
    }
}
