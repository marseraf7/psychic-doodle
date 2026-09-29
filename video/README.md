# Video sơ đồ tổ chức Đoàn – Hội Sinh viên Việt Nam tại LB Nga

Bản dựng thử bằng [Remotion](https://www.remotion.dev/) (React → MP4), 1920×1080, 30 fps, ~29 giây.

| Cảnh | Nội dung |
|---|---|
| Mở đầu (0–4s) | Tiêu đề |
| Sơ đồ (4–25s) | Các ô xuất hiện từ trên xuống, đường nối tự vẽ; máy quay phóng vào nhánh Đoàn rồi nhánh Hội kèm bảng số liệu |
| Kết (25–29s) | Khẩu hiệu + ghi chú bản thử |

## Chạy

```bash
npm install
npm run studio      # xem trước, tua từng khung hình trong trình duyệt
npm run render      # xuất out/so-do-to-chuc.mp4
```

## Sửa nội dung

- `src/data.ts`: tên ô, dòng phụ, vị trí, thời điểm xuất hiện, đường nối, số liệu.
- `src/OrgChartScene.tsx`: mốc thời gian phóng to từng nhánh (`CHART`).
- `src/theme.ts`: màu sắc, font (Be Vietnam Pro).

> ⚠️ Số liệu tổng hợp từ báo chí (một phần từ năm 2016), cần xác minh với Ban Cán sự Đoàn / Hội SV trước khi phát hành.
