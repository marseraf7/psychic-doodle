//! Phần thuần của giao thức Piskvork / Gomocup (không I/O): luật, kiểm nước đi, lệnh BOARD, đọc trả lời.
//! Cùng quy ước với caro/rapfi/worker.js: toạ độ 0..size-1, quân đen (X) đi trước, cỡ bàn theo luật.

use crate::EngineError;
use std::collections::HashSet;

/// Luật chơi, cùng tên với worker.js (`free`, `std`, `renju`, `vn`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Rule {
    Free,
    Std,
    Renju,
    /// Luật Việt Nam (chặn hai đầu) – chỉ bản Rapfi-CARO (bản vá caro/rapfi/build/rapfi-caro.patch) có
    Vn,
}

impl Rule {
    pub fn parse(s: &str) -> Option<Rule> {
        match s {
            "free" => Some(Rule::Free),
            "std" => Some(Rule::Std),
            "renju" => Some(Rule::Renju),
            "vn" => Some(Rule::Vn),
            _ => None,
        }
    }
    /// Mã luật trong lệnh `INFO rule` (worker.js · RULE_N; 8 = caro của Rapfi-CARO)
    pub fn code(self) -> u8 {
        match self {
            Rule::Free => 0,
            Rule::Std => 1,
            Rule::Renju => 4,
            Rule::Vn => 8,
        }
    }
    /// Cỡ bàn đúng với mạng NNUE đã học (worker.js · SIZE)
    pub fn board_size(self) -> u32 {
        match self {
            Rule::Free | Rule::Vn => 20,
            Rule::Std | Rule::Renju => 15,
        }
    }
    /// Luật cần bản Rapfi-CARO (sidecar pbrain-rapfi-caro) thay cho Rapfi nguyên bản
    pub fn needs_caro_build(self) -> bool {
        self == Rule::Vn
    }
}

/// Kiểm nước đi: trong bàn, không trùng ô, bàn chưa đầy.
pub fn validate_moves(moves: &[[u32; 2]], size: u32) -> Result<(), EngineError> {
    if moves.len() >= (size * size) as usize {
        return Err(EngineError::InvalidInput("bàn đã đầy".into()));
    }
    let mut seen = HashSet::with_capacity(moves.len());
    for (i, &[x, y]) in moves.iter().enumerate() {
        if x >= size || y >= size {
            return Err(EngineError::InvalidInput(format!("nước {} ({x},{y}) nằm ngoài bàn {size}×{size}", i + 1)));
        }
        if !seen.insert((x, y)) {
            return Err(EngineError::InvalidInput(format!("nước {} ({x},{y}) trùng ô đã có quân", i + 1)));
        }
    }
    Ok(())
}

/// Khối `BOARD … DONE`: quân của bên tới lượt ghi 1, của đối thủ ghi 2 (như driver.js / worker.js).
pub fn board_lines(moves: &[[u32; 2]]) -> Vec<String> {
    let side = moves.len() % 2;
    let mut out = Vec::with_capacity(moves.len() + 2);
    out.push("BOARD".to_string());
    for (i, &[x, y]) in moves.iter().enumerate() {
        out.push(format!("{x},{y},{}", if i % 2 == side { 1 } else { 2 }));
    }
    out.push("DONE".to_string());
    out
}

/// Dòng nước đi của Rapfi: "x,y" (hai số, không gì khác).
pub fn parse_move(line: &str) -> Option<(u32, u32)> {
    let (a, b) = line.trim().split_once(',')?;
    if a.is_empty() || b.is_empty() || !a.bytes().all(|c| c.is_ascii_digit()) || !b.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some((a.parse().ok()?, b.parse().ok()?))
}

/// Kết quả chế độ `bench` của Rapfi (phần "Search Bench": 10 thế cố định, độ sâu 19, 1 luồng).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BenchResult {
    pub nodes_per_sec: u64,
    pub nodes: u64,
    pub time_ms: u64,
    /// Băm kết quả tìm kiếm – cùng mã + cùng mạng thì trùng nhau giữa các máy (kiểm bản dựng đúng)
    pub hash: String,
}

/// Đọc đầu ra của `pbrain-rapfi bench`. Các dòng sau "Search Bench" mới tính (phần đầu là Move Bench).
pub fn parse_bench<S: AsRef<str>>(lines: &[S]) -> Option<BenchResult> {
    let mut in_search = false;
    let (mut nps, mut nodes, mut time, mut hash) = (None, None, None, None);
    for l in lines {
        let l = l.as_ref().trim().trim_start_matches("MESSAGE").trim();
        if l.contains("Search Bench") {
            in_search = true;
            continue;
        }
        if !in_search {
            continue;
        }
        let num = |p: &str| l.strip_prefix(p).and_then(|v| v.trim().parse::<u64>().ok());
        if let Some(v) = num("Nodes/s:") {
            nps = Some(v);
        } else if let Some(v) = num("Nodes:") {
            nodes = Some(v);
        } else if let Some(v) = num("Total Time (ms):") {
            time = Some(v);
        } else if let Some(v) = l.strip_prefix("Hash:") {
            hash = Some(v.trim().to_string());
        }
    }
    Some(BenchResult { nodes_per_sec: nps?, nodes: nodes?, time_ms: time?, hash: hash.unwrap_or_default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn luat_va_co_ban() {
        assert_eq!(Rule::parse("vn"), Some(Rule::Vn));
        assert_eq!(Rule::parse("gomoku"), None);
        assert_eq!(Rule::Renju.code(), 4);
        assert_eq!(Rule::Std.board_size(), 15);
        assert!(Rule::Vn.needs_caro_build() && !Rule::Free.needs_caro_build());
    }

    #[test]
    fn kiem_nuoc_di() {
        assert!(validate_moves(&[[0, 0], [14, 14]], 15).is_ok());
        assert!(matches!(validate_moves(&[[15, 0]], 15), Err(EngineError::InvalidInput(_))));
        assert!(matches!(validate_moves(&[[3, 3], [3, 3]], 15), Err(EngineError::InvalidInput(_))));
    }

    #[test]
    fn lenh_board_danh_dau_ben_toi_luot() {
        // 3 quân: tới lượt trắng (bên thứ hai) → quân trắng (nước 2) ghi 1, quân đen ghi 2
        assert_eq!(board_lines(&[[7, 7], [6, 6], [5, 5]]), vec!["BOARD", "7,7,2", "6,6,1", "5,5,2", "DONE"]);
        assert_eq!(board_lines(&[]), vec!["BOARD", "DONE"]);
    }

    #[test]
    fn doc_nuoc_di() {
        assert_eq!(parse_move("8,6\r"), Some((8, 6)));
        assert_eq!(parse_move("MESSAGE 8,6"), None);
        assert_eq!(parse_move("8,"), None);
        assert_eq!(parse_move("-1,2"), None);
    }

    #[test]
    fn doc_bench() {
        let out = [
            "MESSAGE ==========Move Bench==========",
            "MESSAGE Total Time (ms): 739",
            "MESSAGE Moves/s: 2706319",
            "MESSAGE =========Search Bench=========",
            "MESSAGE Total Time (ms): 24826",
            "MESSAGE Nodes: 4391204",
            "MESSAGE Nodes/s: 176879",
            "MESSAGE Hash: e240ab16",
        ];
        let r = parse_bench(&out).unwrap();
        assert_eq!(r, BenchResult { nodes_per_sec: 176879, nodes: 4391204, time_ms: 24826, hash: "e240ab16".into() });
        assert_eq!(parse_bench(&out[..4]), None);
    }
}
