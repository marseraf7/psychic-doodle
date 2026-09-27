# -*- coding: utf-8 -*-
"""PC QuickCheck - công cụ chẩn đoán nhanh máy Windows, CHỈ ĐỌC dữ liệu.

Nguyên tắc bất di bất dịch:
  - Chỉ đọc: không sửa hệ thống, không format, không repair, không cài/xóa driver.
  - Không telemetry, không upload: toàn bộ mã nguồn không mở kết nối mạng nào.
  - Mọi lệnh PowerShell/chương trình ngoài đều đi qua bộ lọc `safety` trước khi chạy.
"""
VERSION = "0.1.0"
APP_NAME = "PC QuickCheck"
