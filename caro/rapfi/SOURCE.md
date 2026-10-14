# Rapfi trong Cờ Caro – mã nguồn, giấy phép, cách dựng lại

Thư mục này chứa **Rapfi** (https://github.com/dhbloo/rapfi; bản sao lưu: https://github.com/marseraf7/rapfi) – engine Gomoku / Renju vô địch Gomocup, © Rapfi developers
(xem `AUTHORS.txt`) – dựng thành WebAssembly để nhân vật trùm cuối **BOAT** chơi luật tự do, tiêu chuẩn và Renju ngay
trong trình duyệt / ứng dụng. **Rapfi-CARO** (`rapfi-caro-simd128.*`) là Rapfi cộng bản vá thêm luật Việt Nam (chặn hai đầu)
do Cờ Caro viết – dùng cho luật Việt Nam. Mọi phần khác của game dùng engine riêng của Cờ Caro (không chứa mã Rapfi).

## Giấy phép

| File | Giấy phép |
|---|---|
| `rapfi-single-simd128.js`, `rapfi-single-simd128.wasm` (dựng từ mã Rapfi) | GPL-3 (`COPYING.txt`) |
| `rapfi-caro-simd128.js`, `rapfi-caro-simd128.wasm` (Rapfi-CARO – mã Rapfi + bản vá luật Việt Nam) | GPL-3 (`COPYING.txt`) |
| `worker.js` (cầu nối Worker ↔ Rapfi), `build/build.sh`, `build/expose-fs.js` | GPL-3 (`COPYING.txt`) |
| `model-caro.bin` (bảng đánh giá cổ điển cho luật Việt Nam, Cờ Caro học bằng tuner của Rapfi từ ván Rapfi-CARO tự đấu) | CC0 1.0 |
| `model210901.bin` (mô hình cổ điển) và các mạng NNUE `mix9svq*.bin.lz4` tải khi cần | CC0 1.0 (https://github.com/dhbloo/rapfi-networks; bản sao lưu: https://github.com/marseraf7/rapfi-networks) |

Phần còn lại của game chỉ trao đổi với Rapfi qua thông điệp Worker (`boat-rapfi.js` ↔ `worker.js`).

## Mã nguồn tương ứng (Corresponding Source)

- `build/rapfi-src-3c94c2a.tar.gz` – mã nguồn Rapfi đúng commit `3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7`, không sửa đổi
  (kèm thư viện ngoài trong `Rapfi/external`, `Copying.txt`, `AUTHORS`). Cùng nội dung với
  https://github.com/marseraf7/rapfi/tree/3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7 (bản sao lưu – fork của Cờ Caro) và
  https://github.com/dhbloo/rapfi/tree/3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7 (kho gốc của tác giả)
- `build/expose-fs.js` – phần duy nhất thêm vào khi dựng (`--pre-js`): gọi `Module.onFS(FS)` trước `main()` để
  `worker.js` ghi `config.toml` và mạng vào bộ nhớ ảo.
- `build/build.sh` – lệnh dựng (Emscripten 6.0.12, cmake; 1 luồng, WebAssembly SIMD, không gói sẵn mạng).
- Rapfi-CARO: cùng gói nguồn trên + bản vá `build/rapfi-caro.patch` (GPL-3; mô tả, cách kiểm đúng luật
  và đo sức: `server/scripts/rapfi/caro/README.md`). `build.sh` áp bản vá vào một bản sao rồi dựng `rapfi-caro-simd128.*`.

Dựng lại (mặc định dùng chính gói nguồn kèm theo, không cần mạng):

```bash
# cần emsdk: git clone https://github.com/emscripten-core/emsdk && cd emsdk && ./emsdk install 6.0.12 && ./emsdk activate 6.0.12 && source emsdk_env.sh
bash caro/rapfi/build/build.sh                 # ghi đè caro/rapfi/rapfi-{single,caro}-simd128.{js,wasm}, in SHA-256
RAPFI_ONLY=caro bash caro/rapfi/build/build.sh # chỉ dựng Rapfi-CARO (RAPFI_ONLY=single: chỉ bản nguyên bản)
RAPFI_CLONE=1 bash caro/rapfi/build/build.sh   # hoặc: clone đúng commit từ fork marseraf7/rapfi (lỗi thì kho gốc)
```

Đã kiểm (10/2026, Emscripten 6.0.12): dựng từ gói nguồn và từ fork đều ra **trùng từng byte** với bản trong app –
`rapfi-single-simd128.wasm` SHA-256 `92d29800714f4ba68105e4229850b5c6d7062fb6ab39c42e5457cb1416288b07`,
`rapfi-single-simd128.js` `dfa7b76abf414c5a6c02cb2ee80174d4e45267fcafab4715c09252500d21b013`. Rapfi-CARO:
`rapfi-caro-simd128.wasm` `639c09ddb65c83f9a93ebf3e3146a7dbf5be35a12ae43f2fb174cac793596566`,
`rapfi-caro-simd128.js` `44023d8aeac6cfbcd808e05690ff0bd71a45a5dfb5ac566f00a631d300d268ff`.

Mạng NNUE của Rapfi bắt buộc có SIMD nên không có bản vô hướng: trình duyệt không hỗ trợ WebAssembly SIMD thì BOAT dùng
engine của game. **Bản iOS không kèm Rapfi** (điều khoản App Store xung khắc với GPL): hook `capacitor:copy:after`
(`app/scripts/strip-rapfi-ios.js`) xoá thư mục này khỏi bản chép vào `ios/` và bật `CARO_NO_RAPFI`.

Luật Việt Nam không dùng mạng NNUE: Rapfi-CARO đánh giá bằng mô hình cổ điển (`model210901.bin` + `model-caro.bin`, đi
kèm app, kiểm kích thước + SHA-256 như mạng), không tải gì thêm.

## Mạng NNUE (tải khi cần)

`worker.js` tải mạng của luật đang chơi (tự do / tiêu chuẩn ~10 MB, Renju 2 file ~20 MB), thử lần lượt:

1. `rapfi/nets/<tên file>` trên chính máy chủ của game – tuỳ chọn, cho ai muốn không phụ thuộc CDN:
   ```bash
   mkdir -p caro/rapfi/nets && cd caro/rapfi/nets
   for f in mix9svqfreestyle_bsmix mix9svqstandard_bs15 mix9svqrenju_bs15_black mix9svqrenju_bs15_white; do
     curl -fLO https://raw.githubusercontent.com/marseraf7/rapfi-networks/e32ad77a5364363b3e3a02b3f9e8610ade19ea98/mix9svq/$f.bin.lz4
   done
   ```
   (thư mục `nets/` không commit và không gói vào app);
2. jsDelivr: `https://cdn.jsdelivr.net/gh/marseraf7/rapfi-networks@e32ad77…/mix9svq/…` (bản sao lưu), rồi
   `…/gh/dhbloo/rapfi-networks@e32ad77…` (kho gốc);
3. GitHub raw: `https://raw.githubusercontent.com/marseraf7/rapfi-networks/e32ad77…/mix9svq/…`, rồi kho gốc.

Mỗi file được kiểm **kích thước + SHA-256** (`worker.js` · `SPEC`) trước khi dùng và trước khi lưu; khởi động xong
Rapfi nghĩ thử một nước để chắc mạng NNUE nạp được (Rapfi nạp hỏng thì lặng lẽ tắt mạng, chơi yếu hẳn) – không được thì
xoá khỏi bộ nhớ đệm, báo lỗi và BOAT dùng engine của game (1 phút sau thử lại). Tải xong giữ trong Cache Storage
`caro-rapfi-nets-v1` (sw.js không xoá khi app cập nhật) – lần sau không tải lại. Mạng nén trong bộ nhớ ảo được xoá ngay
sau khi Rapfi giải nén.
