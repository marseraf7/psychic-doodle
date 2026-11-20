//! Kiểm thử điều khiển tiến trình: engine giả (script sh) cho treo / chết, và Rapfi thật khi có biến môi trường:
//!   CARO_RAPFI_BIN=…/pbrain-rapfi CARO_RAPFI_CONFIG=…/config.toml                 luật tự do / tiêu chuẩn / Renju
//!   CARO_RAPFI_CARO_BIN=…/pbrain-rapfi-caro CARO_RAPFI_CARO_CONFIG=…/config-caro.toml   luật Việt Nam
//!   CARO_RAPFI_BENCH=1                                                              chạy cả bench (~25 giây)
//! (desktop/scripts/rapfi-resources.js dựng sẵn thư mục config; xem docs/thi-diem-desktop-tauri.md)

use caro_rapfi::{run_bench, EngineError, EngineSpec, Rule, Supervisor};
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Các bài chạy lần lượt. Bài thử ghi script engine giả rồi chạy ngay; nếu cùng lúc một bài khác fork tiến trình con, con
/// fork giữ fd đang ghi của script (trước khi exec) và exec script báo ETXTBSY ("Text file busy") – lỗi chập chờn trên CI.
/// Khoá này bảo đảm không có fork nào xen giữa lúc ghi và lúc chạy script.
fn serial() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|p| p.into_inner())
}

fn env_spec(bin: &str, cfg: &str) -> Option<EngineSpec> {
    let (b, c) = (std::env::var_os(bin)?, std::env::var_os(cfg)?);
    // Đường dẫn tuyệt đối: Rapfi chạy với thư mục làm việc là thư mục của config
    let abs = |p| std::fs::canonicalize(PathBuf::from(p)).ok();
    Some(EngineSpec::new(abs(b)?, abs(c)?, 1))
}

#[cfg(unix)]
fn fake_engine(name: &str, body: &str) -> EngineSpec {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join(format!("caro-rapfi-test-{}-{name}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bin = dir.join("fake-rapfi");
    std::fs::write(&bin, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
    let cfg = dir.join("config.toml");
    std::fs::write(&cfg, "").unwrap();
    let mut spec = EngineSpec::new(bin, cfg, 1);
    spec.start_timeout = Duration::from_millis(300);
    spec
}

#[cfg(unix)]
#[test]
fn treo_thi_het_gio_va_thu_lai() {
    let _k = serial();
    // Không bao giờ trả lời START
    let mut sup = Supervisor::new(fake_engine("treo", "exec sleep 30"));
    let t = Instant::now();
    let r = sup.best_move(&[], Rule::Free, 100);
    assert!(matches!(r, Err(EngineError::Timeout(_))), "{r:?}");
    assert_eq!(sup.restarts, 2, "hai lần hỏi, mỗi lần khởi động lại");
    assert!(t.elapsed() < Duration::from_secs(5));
}

#[cfg(unix)]
#[test]
fn chet_giua_chung_thi_chay_lai() {
    let _k = serial();
    // Trả OK cho START rồi chết khi nhận lệnh tiếp: lần nào cũng chết → báo Crashed sau 2 lần
    let mut sup = Supervisor::new(fake_engine("chet", "read a; echo OK; read b; exit 3"));
    let r = sup.best_move(&[[1, 1]], Rule::Std, 100);
    // Thường là Crashed (stdout đóng); nếu chết trước khi kịp nhận lệnh thì là Io (ống đứt) – cả hai đều được thử lại
    assert!(matches!(r, Err(EngineError::Crashed | EngineError::Io(_))), "{r:?}");
    assert_eq!(sup.restarts, 2);
}

#[cfg(unix)]
#[test]
fn nuoc_di_cua_engine_gia() {
    let _k = serial();
    // Engine giả luôn đi 3,4 sau khi đọc hết khối BOARD … DONE
    let body = r#"while read l; do case "$l" in START*) echo OK;; DONE*) echo "MESSAGE nghĩ xong"; echo 3,4;; esac; done"#;
    let mut sup = Supervisor::new(fake_engine("tot", body));
    assert_eq!(sup.best_move(&[[7, 7]], Rule::Free, 100).unwrap(), (3, 4));
    let pid = sup.pid();
    assert_eq!(sup.best_move(&[[7, 7], [5, 5], [8, 8]], Rule::Free, 100).unwrap(), (3, 4));
    assert_eq!(sup.pid(), pid, "cùng một tiến trình sống lâu");
    // Engine trả ô đã có quân: báo lỗi, không nhận bừa
    assert!(matches!(sup.best_move(&[[3, 4]], Rule::Free, 100), Err(EngineError::Engine(_))));
    // Đầu vào sai: không chạm tới tiến trình, không thử lại
    assert!(matches!(sup.best_move(&[[20, 0]], Rule::Free, 100), Err(EngineError::InvalidInput(_))));
    assert_eq!(sup.restarts, 0);
}

#[test]
fn thieu_file_rapfi() {
    let _k = serial();
    let spec = EngineSpec::new(PathBuf::from("/khong/co/pbrain-rapfi"), PathBuf::from("/khong/co/config.toml"), 1);
    assert!(matches!(Supervisor::new(spec).best_move(&[], Rule::Free, 100), Err(EngineError::Spawn(_))));
}

#[test]
fn rapfi_that_luat_nnue() {
    let _k = serial();
    let Some(spec) = env_spec("CARO_RAPFI_BIN", "CARO_RAPFI_CONFIG") else {
        eprintln!("bỏ qua: chưa đặt CARO_RAPFI_BIN / CARO_RAPFI_CONFIG");
        return;
    };
    let mut sup = Supervisor::new(spec);
    // Thế mở đầu luật tiêu chuẩn, rồi đổi luật / cỡ bàn trên cùng tiến trình
    let (x, y) = sup.best_move(&[[7, 7], [7, 6], [9, 5]], Rule::Std, 300).unwrap();
    assert!(x < 15 && y < 15);
    let (x, y) = sup.best_move(&[], Rule::Free, 200).unwrap();
    assert!(x < 20 && y < 20);
    sup.best_move(&[[7, 7], [8, 8]], Rule::Renju, 200).unwrap();
    // Tiến trình bị giết từ bên ngoài giữa hai lượt → tự chạy lại
    let pid = sup.pid().unwrap();
    #[cfg(unix)]
    std::process::Command::new("kill").arg("-9").arg(pid.to_string()).status().unwrap();
    #[cfg(windows)]
    std::process::Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).status().unwrap();
    std::thread::sleep(Duration::from_millis(200));
    sup.best_move(&[[7, 7]], Rule::Std, 200).unwrap();
    assert_eq!(sup.restarts, 1);
    assert_ne!(sup.pid(), Some(pid));
}

#[test]
fn rapfi_that_luat_viet_nam() {
    let _k = serial();
    let Some(spec) = env_spec("CARO_RAPFI_CARO_BIN", "CARO_RAPFI_CARO_CONFIG") else {
        eprintln!("bỏ qua: chưa đặt CARO_RAPFI_CARO_BIN / CARO_RAPFI_CARO_CONFIG");
        return;
    };
    let mut sup = Supervisor::new(spec);
    // Đen có ba quân liền 8,10 – 9,10 – 10,10, hai đầu trống: trắng phải chặn ở 7,10 hoặc 11,10 (hoặc đi nước ép)
    let mv = sup.best_move(&[[8, 10], [8, 11], [9, 10], [9, 11], [10, 10]], Rule::Vn, 300).unwrap();
    assert!(mv.0 < 20 && mv.1 < 20);
}

#[test]
fn rapfi_that_bench() {
    let _k = serial();
    if std::env::var_os("CARO_RAPFI_BENCH").is_none() {
        eprintln!("bỏ qua: chưa đặt CARO_RAPFI_BENCH=1");
        return;
    }
    let spec = env_spec("CARO_RAPFI_BIN", "CARO_RAPFI_CONFIG").expect("cần CARO_RAPFI_BIN / CARO_RAPFI_CONFIG");
    let r = run_bench(&spec, Duration::from_secs(600)).unwrap();
    eprintln!("bench: {} nút/giây, {} nút, {} ms, hash {}", r.nodes_per_sec, r.nodes, r.time_ms, r.hash);
    assert!(r.nodes_per_sec > 0 && r.nodes > 0);
}
