// Khai báo hai lệnh của app trong "app manifest": Tauri sinh quyền allow-engine-bench / allow-engine-best-move, và chỉ
// cửa sổ nào được cấp trong capabilities/ mới gọi được (không khai báo thì mọi cửa sổ gọi được mọi lệnh của app).
fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["engine_bench", "engine_best_move"])),
    )
    .expect("tauri-build lỗi");
}
