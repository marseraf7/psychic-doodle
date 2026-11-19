//! Lõi luật chơi Cờ Caro – port nguyên ý từ `caro/rules.js` (file JS đó là bản đặc tả).
//!
//! - `board`  : mã luật (`RULES`, `rule_of`), bàn cờ vô hạn và khóa số `key()`.
//! - `win`    : `win_len`, `line_win`, `check_win`, `wins_if_placed`.
//! - `renju`  : nước cấm Renju cho quân X (đen): `forbidden`, `forbidden_at`, `may_forbid` và các hàm phụ.
//! - `ffi`    : giao diện C rất nhỏ (không wasm-bindgen) cho bản WebAssembly, nạp bằng `js/rules-wasm.js`.
//!
//! Toạ độ dùng `i64` bên trong để phép cộng `x + k*dx` không bao giờ tràn, giống số thực của JS với mọi toạ độ i32.
//! Thí điểm: chưa nối vào trò chơi hay máy chủ đang chạy.

pub mod board;
pub mod ffi;
pub mod renju;
pub mod win;

pub use board::{key, other, rule_of, Board, Move, PlayError, Rule, DIRS, EMPTY, LIM, O, RULES, X};
pub use renju::{forbidden, forbidden_at, forbidden_at_depth, may_forbid, Forbid};
pub use win::{check_win, line_win, win_len, wins_if_placed, Cells};
