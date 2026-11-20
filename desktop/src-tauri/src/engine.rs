// Hai lệnh Tauri gọi Rapfi gốc (sidecar) – phần điều khiển tiến trình ở crate caro-rapfi (rapfi/, kiểm thử được không
// cần Tauri). Rapfi chạy như chương trình riêng, chỉ nói qua stdin / stdout: app không liên kết mã Rapfi (GPL-3).
//   engine_bench()                          → { nodesPerSec, nodes, timeMs, hash }  (pbrain-rapfi bench, 1 luồng)
//   engine_best_move(moves, rule, timeMs)   → "x,y"                                 (tiến trình sống lâu, tự chạy lại)

use caro_rapfi::{run_bench, EngineError, EngineSpec, Rule, Supervisor};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Hai tiến trình: Rapfi nguyên bản (tự do / tiêu chuẩn / Renju) và Rapfi-CARO (luật Việt Nam).
pub struct EngineState {
    plain: Mutex<Supervisor>,
    caro: Mutex<Supervisor>,
    bench: EngineSpec,
}

/// File sidecar: Tauri đặt các file bundle.externalBin cạnh file chạy của app, bỏ hậu tố target triple
/// (Windows: .exe; macOS: Contents/MacOS/; Linux: /usr/bin hoặc usr/bin của AppImage; `tauri dev`: target/debug/).
fn sidecar(name: &str) -> Result<PathBuf, std::io::Error> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().unwrap_or(Path::new("."));
    Ok(dir.join(format!("{name}{}", std::env::consts::EXE_SUFFIX)))
}

fn lock(m: &Mutex<Supervisor>) -> MutexGuard<'_, Supervisor> {
    // Một lượt hỏi panic giữa chừng không được khoá chết engine: lấy lại khoá, tiến trình hỏng sẽ tự chạy lại
    m.lock().unwrap_or_else(|p| p.into_inner())
}

impl EngineState {
    pub fn new(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        // bundle.resources: resources/rapfi/ → <resource_dir>/rapfi/ (config, mô hình, mạng, giấy phép)
        let res = app.path().resource_dir()?.join("rapfi");
        // Mỗi lượt nghĩ dùng tới 8 luồng (Rapfi gốc mở rộng theo luồng; bản WASM trong trình duyệt thường chỉ 1)
        let threads = std::thread::available_parallelism().map(|n| n.get().min(8) as u32).unwrap_or(1);
        let plain = EngineSpec::new(sidecar("pbrain-rapfi")?, res.join("config.toml"), threads);
        let caro = EngineSpec::new(sidecar("pbrain-rapfi-caro")?, res.join("config-caro.toml"), threads);
        Ok(EngineState { bench: plain.clone(), plain: Mutex::new(Supervisor::new(plain)), caro: Mutex::new(Supervisor::new(caro)) })
    }

    pub fn shutdown(&self) {
        lock(&self.plain).kill();
        lock(&self.caro).kill();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchOut {
    nodes_per_sec: u64,
    nodes: u64,
    time_ms: u64,
    hash: String,
}

/// Việc chặn (chờ tiến trình) chạy ở luồng riêng của Tauri, không chặn luồng giao diện / IPC.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, EngineError> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("lỗi luồng engine: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn engine_bench(app: AppHandle) -> Result<BenchOut, String> {
    blocking(move || {
        let state = app.state::<EngineState>();
        let r = run_bench(&state.bench, Duration::from_secs(600))?;
        Ok(BenchOut { nodes_per_sec: r.nodes_per_sec, nodes: r.nodes, time_ms: r.time_ms, hash: r.hash })
    })
    .await
}

#[tauri::command]
pub async fn engine_best_move(app: AppHandle, moves: Vec<[u32; 2]>, rule: String, time_ms: u64) -> Result<String, String> {
    let rule = Rule::parse(&rule).ok_or_else(|| format!("luật không hỗ trợ: {rule} (free | std | renju | vn)"))?;
    blocking(move || {
        let state = app.state::<EngineState>();
        let mut sup = lock(if rule.needs_caro_build() { &state.caro } else { &state.plain });
        let (x, y) = sup.best_move(&moves, rule, time_ms)?;
        Ok(format!("{x},{y}"))
    })
    .await
}
