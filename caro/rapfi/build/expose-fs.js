// Thêm vào bản dựng WebAssembly của Rapfi (--pre-js, cùng phạm vi với preamble.js gốc của Rapfi).
// Gọi Module.onFS(FS) trước main() để trang ghi config.toml và mạng NNUE (tải theo nhu cầu) vào bộ nhớ ảo –
// Rapfi đọc config.toml ở thư mục hiện tại khi khởi động. Cùng giấy phép GPL-3 với Rapfi.
if (!Module['preRun']) Module['preRun'] = [];
Module['preRun'].push(function () {
  if (Module['onFS']) Module['onFS'](FS);
});
