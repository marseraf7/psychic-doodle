# Rapfi trong Cờ Caro – mã nguồn, giấy phép, cách dựng lại

Thư mục này chứa **Rapfi** (https://github.com/dhbloo/rapfi; bản sao lưu: https://github.com/marseraf7/rapfi) – engine Gomoku / Renju vô địch Gomocup, © Rapfi developers
(xem `AUTHORS.txt`) – dựng thành WebAssembly để nhân vật trùm cuối **BOAT** chơi luật tự do, tiêu chuẩn và Renju ngay
trong trình duyệt / ứng dụng. Luật Việt Nam và mọi phần khác của game dùng engine riêng của Cờ Caro (không chứa mã Rapfi).

## Giấy phép

| File | Giấy phép |
|---|---|
| `rapfi-single-simd128.js`, `rapfi-single-simd128.wasm` (dựng từ mã Rapfi) | GPL-3 (`COPYING.txt`) |
| `worker.js` (cầu nối Worker ↔ Rapfi), `build/build.sh`, `build/expose-fs.js` | GPL-3 (`COPYING.txt`) |
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

Dựng lại:

```bash
# cần emsdk: git clone https://github.com/emscripten-core/emsdk && cd emsdk && ./emsdk install 6.0.12 && ./emsdk activate 6.0.12 && source emsdk_env.sh
mkdir rapfi-src && tar xzf caro/rapfi/build/rapfi-src-3c94c2a.tar.gz -C rapfi-src --strip-components=1
RAPFI_SRC=$PWD/rapfi-src bash caro/rapfi/build/build.sh      # ghi đè caro/rapfi/rapfi-single-simd128.{js,wasm}
```

(Không đặt `RAPFI_SRC` thì script tự clone đúng commit từ bản sao lưu marseraf7/rapfi, lỗi thì từ kho gốc.) Mạng NNUE của Rapfi bắt buộc có SIMD nên không có bản
vô hướng: trình duyệt không hỗ trợ WebAssembly SIMD thì BOAT dùng engine của game.

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

Tải xong giữ trong Cache Storage `caro-rapfi-nets-v1` (sw.js không xoá khi app cập nhật) – lần sau không tải lại.
