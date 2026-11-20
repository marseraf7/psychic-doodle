// Tự kiểm khi chạy với CARO_DESKTOP_SELFTEST=1 (CI / máy dev, không có ở chế độ thường): trang nạp xong thì
//  1. gọi window.CaroNativeEngine.bestMove qua đúng đường JS → lệnh Tauri → quyền trong capabilities → sidecar Rapfi;
//  2. chơi một ván thật với BOAT trong giao diện (CaroApp.startPreset → app-ai.js → boat-rapfi.js → native-boat.js) ở
//     luật tiêu chuẩn: BOAT phải đi bằng Rapfi gốc (CaroNativeBoat.stats.native tăng), đúng ô trống;
//  3. nạp Worker WASM luật Việt Nam (không cần mạng NNUE) rồi giả lỗi bản gốc (bestMove bị từ chối): BOAT vẫn phải đi –
//     bằng Worker WASM nếu WebView chạy được, không thì engine của game – và không được tính là nước của bản gốc;
// rồi in kết quả, thời gian khởi động / mỗi nước ra stdout và thoát (mã 0 = đạt). JS báo kết quả bằng cách điều hướng
// tới selftest.invalid – điều hướng bị chặn ở đây, không cần thêm lệnh hay quyền nào cho cửa sổ.
// Bước 2–3 bắt đầu ván mới với BOAT trong hồ sơ của app: chỉ chạy tự kiểm trên hồ sơ thử (CI), không trên máy đang chơi.

use std::sync::OnceLock;
use std::time::Instant;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, Runtime};

static START: OnceLock<Instant> = OnceLock::new();
static LOADED_MS: OnceLock<u128> = OnceLock::new();

const JS: &str = r#"(async () => {
  let r;
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    const E = window.CaroNativeEngine, NB = window.CaroNativeBoat, R = window.CaroRapfi, A = window.CaroApp;
    if (!E || !E.available) throw new Error('không có CaroNativeEngine / __TAURI__');
    const a = await E.bestMove([[7, 7], [7, 6], [9, 5]], 'std', 300);
    const b = await E.bestMove([[8, 10], [8, 11], [9, 10]], 'vn', 300);
    if (!NB || !R || !A) throw new Error('thiếu CaroNativeBoat / CaroRapfi / CaroApp');
    // 9 quân (ngoài sách khai cuộc – sách tới 7 quân), người cầm X: tới BOAT (O) nghĩ
    const NINE = [[0, 0], [1, 2], [2, 1], [-1, -1], [-2, 1], [3, 1], [0, 3], [-2, -2], [3, -2]];
    async function botMove(rule) {
      const t0 = performance.now();
      A.setBot('boat', 7);
      if (!A.startPreset({ rule, human: 1, bot: 'boat', moves: NINE })) throw new Error('không bắt đầu được ván ' + rule);
      while (A.board.moves.length < 10) {
        if (performance.now() - t0 > 30000) throw new Error('BOAT không đi (' + rule + ')');
        await sleep(50);
      }
      const m = A.board.moves[9];
      if (m.p !== 2 || NINE.some(([x, y]) => x === m.x && y === m.y)) throw new Error('nước BOAT sai ' + m.x + ',' + m.y);
      return { m: m.x + ',' + m.y, ms: Math.round(performance.now() - t0) };
    }
    const n0 = NB.stats.native;
    const g = await botMove('std');
    if (NB.stats.native !== n0 + 1 || !R.stats.native) throw new Error('nước BOAT không qua Rapfi gốc (native ' + NB.stats.native + ')');
    // Worker WASM (đường dự phòng) có chạy được trong WebView này không: luật Việt Nam không cần tải mạng NNUE
    const w0 = performance.now(), wasm = await R.ready('vn', 20000), wasmMs = Math.round(performance.now() - w0);
    const real = E.bestMove;
    E.bestMove = () => Promise.reject(new Error('giả lỗi tự kiểm'));
    let fb, s0 = { ...R.stats };
    try { fb = await botMove('vn'); } finally { E.bestMove = real; }
    if (NB.stats.native !== n0 + 1 || !NB.stats.fail) throw new Error('giả lỗi mà vẫn tính nước bản gốc');
    const via = R.stats.rapfi > s0.rapfi ? 'wasm' : R.stats.fallback > s0.fallback ? 'engine' : '?';
    r = 'ok std=' + a + ' vn=' + b + ' van-std=' + g.m + ' (Rapfi gốc ' + NB.stats.ms + ' ms, cả nước ' + g.ms + ' ms)' +
      ' wasm-vn=' + (wasm ? 'san-sang ' + wasmMs + ' ms' : 'khong') + ' loi-vn=' + fb.m + ' (' + via + ', ' + fb.ms + ' ms)';
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
