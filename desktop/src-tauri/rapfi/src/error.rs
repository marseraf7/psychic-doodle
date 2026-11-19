//! Lỗi khi điều khiển Rapfi – thông điệp tiếng Việt, gửi nguyên văn sang JS (chuỗi lỗi của lệnh Tauri).

use std::fmt;
use std::io;

#[derive(Debug)]
pub enum EngineError {
    /// Đầu vào sai (nước ngoài bàn, trùng ô, luật lạ…): không thử lại
    InvalidInput(String),
    /// Không chạy được file Rapfi (thiếu file, không có quyền chạy…): không thử lại
    Spawn(io::Error),
    /// Rapfi không trả lời kịp (việc đang chờ)
    Timeout(&'static str),
    /// Tiến trình Rapfi đã thoát / đóng stdout
    Crashed,
    /// Lỗi ghi stdin (thường do tiến trình vừa chết)
    Io(io::Error),
    /// Rapfi báo lỗi hoặc trả lời không đọc được
    Engine(String),
}

impl EngineError {
    /// Lỗi do tiến trình (treo / chết / ống đứt): khởi động lại Rapfi rồi hỏi lại là hợp lý
    pub fn is_retryable(&self) -> bool {
        matches!(self, EngineError::Timeout(_) | EngineError::Crashed | EngineError::Io(_))
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::InvalidInput(m) => write!(f, "đầu vào không hợp lệ: {m}"),
            EngineError::Spawn(e) => write!(f, "không chạy được Rapfi: {e}"),
            EngineError::Timeout(what) => write!(f, "Rapfi không trả lời kịp ({what})"),
            EngineError::Crashed => write!(f, "tiến trình Rapfi đã dừng"),
            EngineError::Io(e) => write!(f, "lỗi gửi lệnh cho Rapfi: {e}"),
            EngineError::Engine(m) => write!(f, "Rapfi báo lỗi: {m}"),
        }
    }
}

impl std::error::Error for EngineError {}
