# -*- coding: utf-8 -*-
"""Kiểm tra tổng quan: hệ điều hành, CPU, RAM, mainboard, ổ, VGA, pin, nhiệt."""
import datetime as _dt

from ..model import (OK, INFO, WARN, CRIT, new_section, kv, finding, table, note, as_list, to_int,
                     human_bytes, human_gb_decimal, parse_date, fmt_date)
from ..analysis import smart as smart_mod

PC_TYPES = {1: "Máy bàn", 2: "Laptop", 3: "Workstation", 4: "Server", 8: "Máy tính bảng/Slate"}


def _first(v):
    lst = as_list(v)
    return lst[0] if lst and isinstance(lst[0], dict) else {}


def run(src):
    sec = new_section("overview", "Tổng quan máy")
    os_ = _first(src.ps("os"))
    cs = _first(src.ps("cs"))
    cpus = [c for c in as_list(src.ps("cpu")) if isinstance(c, dict)]
    board = _first(src.ps("board"))
    bios = _first(src.ps("bios"))

    if not os_ and not cs:
        finding(sec, CRIT, "Không đọc được thông tin hệ thống qua WMI/CIM.",
                "Dịch vụ 'Windows Management Instrumentation' có thể bị tắt hoặc lỗi.")
        return sec

    kv(sec, "Máy", " ".join(x for x in (cs.get("Manufacturer"), cs.get("Model")) if x))
    kv(sec, "Loại máy", PC_TYPES.get(to_int(cs.get("PCSystemType")), ""))
    kv(sec, "Hệ điều hành", f"{os_.get('Caption', '')} ({os_.get('OSArchitecture', '')}) build {os_.get('BuildNumber', '')}")
    for c in cpus:
        kv(sec, "CPU", f"{(c.get('Name') or '').strip()} - {c.get('NumberOfCores')} nhân / "
                       f"{c.get('NumberOfLogicalProcessors')} luồng, {c.get('MaxClockSpeed')} MHz")
    total = to_int(cs.get("TotalPhysicalMemory"))
    kv(sec, "RAM (Windows nhận)", human_bytes(total))
    kv(sec, "Mainboard", " ".join(x for x in (board.get("Manufacturer"), board.get("Product")) if x))
    kv(sec, "BIOS", f"{bios.get('Manufacturer', '')} {bios.get('SMBIOSBIOSVersion', '')} ({fmt_date(bios.get('ReleaseDate'), False)})")
    boot = parse_date(os_.get("LastBootUpTime"))
    if boot:
        up = _dt.datetime.now() - boot
        kv(sec, "Khởi động lúc", f"{fmt_date(boot)} (đã chạy {up.days} ngày {up.seconds // 3600} giờ)")
        if up.days >= 14:
            finding(sec, INFO, f"Máy chưa khởi động lại {up.days} ngày.",
                    "Nếu đang gặp lỗi lạ, khởi động lại (Restart, không phải Shut down + Fast Startup) trước khi test.")
    kv(sec, "Cài Windows", fmt_date(os_.get("InstallDate"), False))
    sb = _first(src.ps("secureboot")).get("SecureBoot")
    if sb is not None:
        kv(sec, "Secure Boot", "Bật" if sb else "Tắt")

    # CPU tải hiện tại
    for c in cpus:
        load = to_int(c.get("LoadPercentage"))
        if load is not None and load >= 90:
            finding(sec, WARN, f"CPU đang tải {load}% lúc kiểm tra.",
                    "Mở Task Manager xem tiến trình nào chiếm CPU (có thể là update, antivirus, mã độc đào coin).")
        if c.get("VirtualizationFirmwareEnabled") is False:
            note(sec, "Ảo hóa (VT-x/AMD-V) đang tắt trong BIOS - chỉ quan trọng khi dùng máy ảo/WSL/giả lập Android.")

    # RAM đang dùng
    tv, fr = to_int(os_.get("TotalVisibleMemorySize")), to_int(os_.get("FreePhysicalMemory"))
    if tv and fr is not None:
        used_pct = 100 - fr * 100 // tv
        kv(sec, "RAM đang dùng", f"{used_pct}% ({human_bytes((tv - fr) * 1024)} / {human_bytes(tv * 1024)})")
        if used_pct >= 90:
            finding(sec, WARN, f"RAM đang dùng {used_pct}% - máy dễ chậm/giật.", "Đóng bớt ứng dụng hoặc nâng cấp RAM.")

    # Ổ đĩa logic
    rows = []
    for v in as_list(src.ps("volumes")):
        if not isinstance(v, dict):
            continue
        size, free = to_int(v.get("Size")), to_int(v.get("FreeSpace"))
        pct = (free * 100 // size) if size else None
        rows.append([v.get("DeviceID"), v.get("VolumeName"), v.get("FileSystem"), human_bytes(size),
                     human_bytes(free), f"{pct}%" if pct is not None else ""])
        if pct is not None and size and (pct < 10 or free < 10 * 1024 ** 3):
            is_sys = v.get("DeviceID") == (os_.get("SystemDrive") or "C:")
            lv = CRIT if is_sys and free < 5 * 1024 ** 3 else WARN
            finding(sec, lv, f"Ổ {v.get('DeviceID')} còn trống {human_bytes(free)} ({pct}%).",
                    "Ổ hệ thống quá đầy gây chậm, lỗi cập nhật Windows và lỗi ghi dump khi BSOD." if is_sys else
                    "Nên chừa trống >= 10% để tránh phân mảnh và lỗi ghi file.")
    table(sec, "Phân vùng", ["Ổ", "Tên", "FS", "Dung lượng", "Còn trống", "% trống"], rows)

    # Ổ vật lý (tóm tắt, chi tiết ở mục Ổ cứng)
    rows = []
    for d in as_list(src.ps("physdisk")):
        if not isinstance(d, dict):
            continue
        kind = smart_mod.classify(None, d.get("BusType"), d.get("MediaType"), d.get("SpindleSpeed"))
        rows.append([d.get("FriendlyName"), kind, human_gb_decimal(d.get("Size")), d.get("HealthStatus")])
        if str(d.get("HealthStatus", "")).lower() in ("warning", "1"):
            finding(sec, WARN, f"Windows báo ổ '{d.get('FriendlyName')}' ở trạng thái Warning.", "Xem mục Ổ cứng.")
        elif str(d.get("HealthStatus", "")).lower() in ("unhealthy", "2"):
            finding(sec, CRIT, f"Windows báo ổ '{d.get('FriendlyName')}' KHÔNG KHỎE (Unhealthy).", "Sao lưu dữ liệu ngay, xem mục Ổ cứng.")
    table(sec, "Ổ vật lý", ["Tên", "Loại", "Dung lượng", "Windows đánh giá"], rows)

    # VGA
    rows = []
    for g in as_list(src.ps("video")):
        if isinstance(g, dict):
            rows.append([g.get("Name"), g.get("DriverVersion"), fmt_date(g.get("DriverDate"), False),
                         f"{g.get('CurrentHorizontalResolution') or ''}x{g.get('CurrentVerticalResolution') or ''}"
                         f" @{g.get('CurrentRefreshRate') or ''}Hz" if g.get("CurrentHorizontalResolution") else ""])
    table(sec, "VGA", ["Tên", "Driver", "Ngày driver", "Màn hình"], rows)

    # Pin laptop
    bats = [b for b in as_list(src.ps("battery")) if isinstance(b, dict)]
    caps = [b for b in as_list(src.ps("battery_capacity")) if isinstance(b, dict)]
    for i, b in enumerate(bats):
        kv(sec, "Pin", f"{b.get('Name', '')} - {b.get('EstimatedChargeRemaining', '?')}%")
        if i < len(caps):
            full, design = to_int(caps[i].get("FullChargedCapacity")), to_int(caps[i].get("DesignedCapacity"))
            if full and design:
                health = full * 100 // design
                kv(sec, "Độ chai pin", f"còn {health}% so với thiết kế ({full} / {design} mWh)")
                if health < 50:
                    finding(sec, WARN, f"Pin chỉ còn {health}% dung lượng thiết kế.",
                            "Pin chai nặng có thể gây sập nguồn đột ngột khi rút sạc (Kernel-Power 41).")

    # Nhiệt độ ACPI (không phải máy nào cũng có, giá trị theo 1/10 Kelvin)
    temps = []
    for t in as_list(src.ps("thermal")):
        if isinstance(t, dict):
            k = to_int(t.get("CurrentTemperature"))
            if k and 2000 < k < 4000:
                temps.append(round(k / 10 - 273.15))
    if temps:
        kv(sec, "Nhiệt độ ACPI", ", ".join(f"{x}°C" for x in temps))
        if max(temps) >= 90:
            finding(sec, WARN, f"Cảm biến ACPI báo {max(temps)}°C.",
                    "Vệ sinh quạt/tản nhiệt, thay keo tản nhiệt. (Cảm biến ACPI không phải lúc nào cũng chính xác.)")

    hot = [h for h in as_list(src.ps("hotfix_last")) if isinstance(h, dict)]
    if hot:
        kv(sec, "Bản cập nhật gần nhất", f"{hot[0].get('HotFixID')} ({hot[0].get('InstalledOn')})")

    if not src.meta.get("is_admin"):
        note(sec, "Tool đang chạy KHÔNG có quyền Administrator: SMART, bộ đếm lỗi ổ và file dump có thể không đọc được. "
                  "Chạy lại bằng 'Run as administrator' để có kết quả đầy đủ.")
    if not sec["findings"]:
        finding(sec, OK, "Không thấy vấn đề ở mức tổng quan.")
    return sec
