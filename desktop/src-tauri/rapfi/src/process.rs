//! Tiến trình Rapfi gốc: chạy, gửi lệnh Gomocup, chờ trả lời có canh giờ, khởi động lại khi treo / chết.
//! Mỗi `Engine` là một tiến trình sống lâu (giữ bảng băm giữa các nước); `Supervisor` bọc nó để lỗi tiến trình
//! không làm hỏng lượt hỏi: giết, chạy lại, hỏi lại một lần.

use crate::proto::{board_lines, parse_bench, parse_move, validate_moves, BenchResult, Rule};
use crate::EngineError;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

/// Cách chạy một tiến trình Rapfi.
#[derive(Clone, Debug)]
pub struct EngineSpec {
    /// File pbrain-rapfi (sidecar)
    pub bin: PathBuf,
    /// config.toml (đường dẫn tuyệt đối; mô hình / mạng tìm theo thư mục của file này)
    pub config: PathBuf,
    /// Số luồng tìm kiếm (`INFO thread_num`)
    pub threads: u32,
    /// Hạn chờ `START` trả `OK` (nạp config, cấp bảng băm)
    pub start_timeout: Duration,
}

impl EngineSpec {
    pub fn new(bin: PathBuf, config: PathBuf, threads: u32) -> Self {
        EngineSpec { bin, config, threads: threads.max(1), start_timeout: Duration::from_secs(20) }
    }

    fn command(&self, args: &[&str]) -> Command {
        let mut c = Command::new(&self.bin);
        c.args(args).arg("--config").arg(&self.config);
        if let Some(dir) = self.config.parent() {
            c.current_dir(dir);
        }
        c.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            // Không bật cửa sổ console đen cho tiến trình phụ
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            c.creation_flags(CREATE_NO_WINDOW);
        }
        c
    }
}

/// Đọc stdout theo dòng ở một luồng riêng; hết dòng (tiến trình chết) thì kênh đóng.
fn spawn_reader(child: &mut Child) -> Receiver<String> {
    let out = child.stdout.take().expect("stdout đã được đặt piped");
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(out).lines() {
            let Ok(line) = line else { break };
            if tx.send(line.trim().to_string()).is_err() {
                break;
            }
        }
    });
    rx
}

/// Một tiến trình Rapfi ở chế độ Gomocup.
pub struct Engine {
    child: Child,
    stdin: ChildStdin,
    rx: Receiver<String>,
    threads: u32,
    start_timeout: Duration,
    /// Cỡ bàn của lần START gần nhất (đổi cỡ thì START lại)
    size: Option<u32>,
    /// Lỗi gần nhất Rapfi in ra ("ERROR …"), kèm vào thông báo khi hết giờ
    last_error: Option<String>,
}

impl Engine {
    pub fn spawn(spec: &EngineSpec) -> Result<Engine, EngineError> {
        let mut child = spec.command(&[]).spawn().map_err(EngineError::Spawn)?;
        let stdin = child.stdin.take().expect("stdin đã được đặt piped");
        let rx = spawn_reader(&mut child);
        Ok(Engine { child, stdin, rx, threads: spec.threads, start_timeout: spec.start_timeout, size: None, last_error: None })
    }

    fn send(&mut self, lines: &[String]) -> Result<(), EngineError> {
        let mut buf = lines.join("\n");
        buf.push('\n');
        self.stdin.write_all(buf.as_bytes()).and_then(|_| self.stdin.flush()).map_err(EngineError::Io)
    }

    /// Bỏ các dòng còn sót của lượt trước (vd. MESSAGE in muộn)
    fn drain(&mut self) {
        while self.rx.try_recv().is_ok() {}
    }

    /// Chờ một dòng thoả `want`; hết `timeout` → Timeout, kênh đóng → Crashed.
    fn wait_for(&mut self, want: impl Fn(&str) -> bool, timeout: Duration, what: &'static str) -> Result<String, EngineError> {
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.rx.recv_timeout(left) {
                Ok(line) if want(&line) => return Ok(line),
                Ok(line) => {
                    if let Some(e) = line.strip_prefix("ERROR") {
                        self.last_error = Some(e.trim().to_string());
                    }
                }
                Err(RecvTimeoutError::Timeout) => return Err(EngineError::Timeout(what)),
                Err(RecvTimeoutError::Disconnected) => return Err(EngineError::Crashed),
            }
        }
    }

    /// Hết giờ / chết mà Rapfi đã in "ERROR …" thì báo nguyên văn lỗi đó (thường là config / mạng hỏng – khỏi thử lại)
    fn explain(&mut self, e: EngineError) -> EngineError {
        match (e, self.last_error.take()) {
            (EngineError::Timeout(_) | EngineError::Crashed, Some(msg)) => EngineError::Engine(msg),
            (e, _) => e,
        }
    }

    fn ensure_started(&mut self, size: u32) -> Result<(), EngineError> {
        if self.size == Some(size) {
            return Ok(());
        }
        self.size = None;
        self.send(&[format!("START {size}")])?;
        let timeout = self.start_timeout;
        self.wait_for(|l| l == "OK", timeout, "START").map_err(|e| self.explain(e))?;
        self.size = Some(size);
        Ok(())
    }

    /// Nước đi tốt nhất cho thế `moves` (đen đi trước), Rapfi nghĩ khoảng `time_ms` mili giây.
    pub fn best_move(&mut self, moves: &[[u32; 2]], rule: Rule, time_ms: u64) -> Result<(u32, u32), EngineError> {
        let size = rule.board_size();
        validate_moves(moves, size)?;
        self.drain();
        self.ensure_started(size)?;
        let mut cmds = vec![
            format!("INFO rule {}", rule.code()),
            format!("INFO thread_num {}", self.threads),
            "INFO timeout_match 0".to_string(),
            format!("INFO timeout_turn {time_ms}"),
        ];
        cmds.extend(board_lines(moves));
        self.send(&cmds)?;
        // Rapfi tự canh timeout_turn; chờ thêm một khoảng rộng rồi mới coi là treo
        let timeout = Duration::from_millis(time_ms + time_ms / 2 + 10_000);
        let line = self.wait_for(|l| parse_move(l).is_some(), timeout, "nước đi").map_err(|e| self.explain(e))?;
        let mv = parse_move(&line).expect("đã kiểm ở wait_for");
        if mv.0 >= size || mv.1 >= size || moves.contains(&[mv.0, mv.1]) {
            return Err(EngineError::Engine(format!("nước đi không hợp lệ: {line}")));
        }
        Ok(mv)
    }

    /// Mã tiến trình (để kiểm thử / ghi nhật ký)
    pub fn pid(&self) -> u32 {
        self.child.id()
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        // Không đợi Rapfi tự thoát (có thể đang nghĩ): giết luôn và thu dọn để không thành tiến trình ma
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Giữ một `Engine`, chạy khi cần lần đầu; lỗi tiến trình thì giết, chạy lại và hỏi lại (tối đa 2 lần hỏi).
pub struct Supervisor {
    spec: EngineSpec,
    engine: Option<Engine>,
    /// Số lần đã phải khởi động lại Rapfi
    pub restarts: u32,
}

impl Supervisor {
    pub fn new(spec: EngineSpec) -> Self {
        Supervisor { spec, engine: None, restarts: 0 }
    }

    pub fn best_move(&mut self, moves: &[[u32; 2]], rule: Rule, time_ms: u64) -> Result<(u32, u32), EngineError> {
        // Dưới 40 ms Rapfi không kịp tìm (server/scripts/rapfi/README.md); trên 10 phút coi như nhầm đơn vị
        let time_ms = time_ms.clamp(40, 600_000);
        validate_moves(moves, rule.board_size())?;
        let mut last = None;
        for _ in 0..2 {
            if self.engine.is_none() {
                self.engine = Some(Engine::spawn(&self.spec)?);
            }
            match self.engine.as_mut().expect("vừa tạo").best_move(moves, rule, time_ms) {
                Ok(mv) => return Ok(mv),
                Err(e) if e.is_retryable() => {
                    self.engine = None; // Drop: giết tiến trình cũ
                    self.restarts += 1;
                    last = Some(e);
                }
                Err(e) => return Err(e),
            }
        }
        Err(last.expect("đã thử ít nhất một lần"))
    }

    /// Giết tiến trình đang chạy (lần hỏi sau sẽ chạy lại) – dùng khi tắt app hoặc trong kiểm thử
    pub fn kill(&mut self) {
        self.engine = None;
    }

    pub fn pid(&self) -> Option<u32> {
        self.engine.as_ref().map(Engine::pid)
    }
}

/// Chạy `pbrain-rapfi bench` (10 thế cố định, độ sâu 19, 1 luồng) và đọc tốc độ. Một tiến trình riêng mỗi lần đo.
pub fn run_bench(spec: &EngineSpec, timeout: Duration) -> Result<BenchResult, EngineError> {
    let mut child = spec.command(&["bench"]).spawn().map_err(EngineError::Spawn)?;
    drop(child.stdin.take()); // bench không đọc stdin
    let rx = spawn_reader(&mut child);
    let deadline = Instant::now() + timeout;
    let mut lines = Vec::new();
    loop {
        match rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(l) => lines.push(l),
            Err(RecvTimeoutError::Disconnected) => break, // Rapfi in xong và thoát
            Err(RecvTimeoutError::Timeout) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(EngineError::Timeout("bench"));
            }
        }
    }
    let _ = child.wait();
    parse_bench(&lines).ok_or_else(|| {
        let tail: Vec<&str> = lines.iter().rev().take(3).map(String::as_str).collect();
        EngineError::Engine(format!("không đọc được kết quả bench ({})", tail.join(" | ")))
    })
}
