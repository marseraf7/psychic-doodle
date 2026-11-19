// Tự kiểm khi chạy với CARO_DESKTOP_SELFTEST=1 (CI / máy dev, không có ở chế độ thường): trang nạp xong thì gọi
// window.CaroNativeEngine.bestMove qua đúng đường JS → lệnh Tauri → quyền trong capabilities → sidecar Rapfi, in kết quả
// và thời gian khởi động ra stdout rồi thoát (mã 0 = đạt). JS báo kết quả bằng cách điều hướng tới selftest.invalid –
// điều hướng bị chặn ở đây, không cần thêm lệnh hay quyền nào cho cửa sổ.

use std::sync::OnceLock;
use std::time::Instant;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, Runtime};

static START: OnceLock<Instant> = OnceLock::new();
static LOADED_MS: OnceLock<u128> = OnceLock::new();

const JS: &str = r#"(async () => {
  let r;
  try {
    const E = window.CaroNativeEngine;
    if (!E || !E.available) throw new Error('không có CaroNativeEngine / __TAURI__');
    const a = await E.bestMove([[7, 7], [7, 6], [9, 5]], 'std', 300);
    const b = await E.bestMove([[8, 10], [8, 11], [9, 10]], 'vn', 300);
    r = 'ok std=' + a + ' vn=' + b;
  } catch (e) { r = 'loi ' + ((e && e.message) || e); }
  location.href = 'https://selftest.invalid/?r=' + encodeURIComponent(r);
})();"#;

pub fn enabled() -> bool {
    std::env::var_os("CARO_DESKTOP_SELFTEST").is_some()
}

/// Gọi sớm nhất có thể trong main() để đo thời gian tới khi trang nạp xong
pub fn mark_start() {
    START.get_or_init(Instant::now);
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("caro-selftest")
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished && payload.url().host_str() != Some("selftest.invalid") {
                let ms = START.get().map(|t| t.elapsed().as_millis()).unwrap_or(0);
                LOADED_MS.get_or_init(|| ms);
                let _ = webview.eval(JS);
            }
        })
        .on_navigation(|webview, url| {
            if url.host_str() != Some("selftest.invalid") {
                return true;
            }
            let r = url.query_pairs().find(|(k, _)| k == "r").map(|(_, v)| v.into_owned()).unwrap_or_default();
            let total = START.get().map(|t| t.elapsed().as_millis()).unwrap_or(0);
            println!("CARO_SELFTEST {r} · trang nạp xong sau {} ms · tổng {total} ms", LOADED_MS.get().copied().unwrap_or(0));
            webview.app_handle().exit(if r.starts_with("ok ") { 0 } else { 1 });
            false
        })
        .build()
}
