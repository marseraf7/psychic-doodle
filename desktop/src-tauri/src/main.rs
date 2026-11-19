// App desktop Cờ Caro (thí điểm, Tauri 2): cửa sổ chạy giao diện web (desktop/www, chép từ caro/), cộng hai lệnh gọi
// Rapfi gốc chạy như tiến trình phụ (engine.rs). Xem docs/thi-diem-desktop-tauri.md.

// Bản phát hành trên Windows: không mở kèm cửa sổ console
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;
mod selftest;

use tauri::Manager;

fn main() {
    selftest::mark_start();
    let mut builder = tauri::Builder::default();
    if selftest::enabled() {
        builder = builder.plugin(selftest::plugin());
    }
    builder
        .setup(|app| {
            let state = engine::EngineState::new(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![engine::engine_bench, engine::engine_best_move])
        .build(tauri::generate_context!())
        .expect("không khởi động được app Caro x Gomoku")
        .run(|app, event| {
            // Thoát app: giết các tiến trình Rapfi đang chạy (không để sót tiến trình nghĩ dở)
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<engine::EngineState>() {
                    state.shutdown();
                }
            }
        });
}
