//! Điều khiển Rapfi gốc (engine Gomoku / Renju, GPL-3 – https://github.com/dhbloo/rapfi, bản sao lưu
//! https://github.com/marseraf7/rapfi) chạy như một TIẾN TRÌNH RIÊNG (sidecar) của app desktop, nói chuyện qua
//! stdin / stdout bằng giao thức Piskvork / Gomocup. App không liên kết mã Rapfi vào mình (gói gộp – aggregate).
//!
//! - `proto`: luật, kiểm nước đi, dựng lệnh BOARD, đọc dòng trả lời (hàm thuần, không I/O);
//! - `process`: một tiến trình Rapfi sống lâu (`Engine`), bộ giám sát tự khởi động lại khi treo / chết (`Supervisor`),
//!   và chạy chế độ `bench` của Rapfi (`run_bench`).

mod error;
mod process;
mod proto;

pub use error::EngineError;
pub use process::{run_bench, Engine, EngineSpec, Supervisor};
pub use proto::{parse_bench, parse_move, validate_moves, BenchResult, Rule};
