# -*- coding: utf-8 -*-
"""Chẩn đoán RAM: dung lượng, khe, loại DDR, XMP/DOCP/EXPO, dual channel (ước tính), ECC,
lỗi WHEA bộ nhớ, kết quả Windows Memory Diagnostic, BSOD liên quan RAM."""
import re
from collections import Counter

from ..model import (OK, INFO, WARN, CRIT, new_section, kv, finding, table, note, as_list, to_int, human_bytes,
                     fmt_date)
from ..analysis import events as ev
from ..analysis import bugcheck as bc

DDR_TYPES = {20: "DDR", 21: "DDR2", 24: "DDR3", 26: "DDR4", 27: "LPDDR", 28: "LPDDR2", 29: "LPDDR3",
             30: "LPDDR4", 34: "DDR5", 35: "LPDDR5"}
# Tốc độ JEDEC phổ thông tối đa (vượt mức này gần như chắc chắn là profile XMP/DOCP/EXPO)
JEDEC_MAX = {"DDR3": 1866, "DDR4": 3200, "DDR5": 5600, "LPDDR4": 4266, "LPDDR5": 8533}
FORM = {8: "DIMM", 12: "SO-DIMM", 13: "SO-DIMM"}
ECC_MODES = {3: "Không ECC", 4: "Parity", 5: "ECC (single-bit)", 6: "ECC (multi-bit)", 7: "CRC"}

_RE_CH = [re.compile(r"CHANNEL\s*([A-H])", re.I), re.compile(r"DIMM[_ \-]?([A-H])\d", re.I),
          re.compile(r"^([A-H])\d", re.I), re.compile(r"Controller\d[- ]?Channel([A-H])", re.I)]
# Tốc độ định mức in trong mã linh kiện của các hãng phổ biến
_RE_PART = [
    (re.compile(r"^F[345]-(\d{4})C", re.I), lambda m: int(m.group(1))),                   # G.Skill F4-3600C16
    (re.compile(r"^KF(\d)(\d{2})C", re.I), lambda m: int(m.group(2)) * 100),             # Kingston Fury KF436C18
    (re.compile(r"^CM[A-Z0-9]+?M\d[A-Z](\d{4})C", re.I), lambda m: int(m.group(1))),     # Corsair CMK16GX4M2B3200C16
    (re.compile(r"^BL\d?[A-Z]?\d+G(\d{2})C", re.I), lambda m: int(m.group(1)) * 100),   # Crucial Ballistix BL8G36C16
    (re.compile(r"^TF[AB]\dD4\d+G(\d{4})", re.I), lambda m: int(m.group(1))),            # TeamGroup T-Force
]


def _ddr(m):
    t = DDR_TYPES.get(to_int(m.get("SMBIOSMemoryType")))
    if not t:
        t = {24: "DDR3", 26: "DDR4"}.get(to_int(m.get("MemoryType")), "")
    return t


def _channel(m):
    for field in ("DeviceLocator", "BankLabel"):
        s = str(m.get(field) or "")
        for rx in _RE_CH:
            x = rx.search(s)
            if x:
                return x.group(1).upper()
    return None


def rated_speed_from_part(pn):
    pn = str(pn or "").strip()
    for rx, fn in _RE_PART:
        m = rx.search(pn)
        if m:
            v = fn(m)
            if 1333 <= v <= 12000:
                return v
    return None


def run(src):
    sec = new_section("ram", "RAM")
    mods = [m for m in as_list(src.ps("dimm")) if isinstance(m, dict) and to_int(m.get("Capacity"))]
    arrays = [a for a in as_list(src.ps("memarray")) if isinstance(a, dict) and to_int(a.get("Use")) in (3, None)]
    cs = next((c for c in as_list(src.ps("cs")) if isinstance(c, dict)), {})

    if not mods:
        finding(sec, WARN, "Không đọc được thông tin thanh RAM (Win32_PhysicalMemory).",
                "Một số máy ảo/BIOS không khai báo SMBIOS - không phải lỗi RAM.")
    installed = sum(to_int(m.get("Capacity"), 0) for m in mods)
    slots = sum(to_int(a.get("MemoryDevices"), 0) for a in arrays)
    kv(sec, "Tổng dung lượng lắp", human_bytes(installed))
    kv(sec, "Windows sử dụng được", human_bytes(cs.get("TotalPhysicalMemory")))
    kv(sec, "Số khe", f"{len(mods)} thanh / {slots} khe" if slots else f"{len(mods)} thanh")
    maxcap = max((to_int(a.get("MaxCapacityEx")) or to_int(a.get("MaxCapacity")) or 0 for a in arrays), default=0)
    if maxcap:
        kv(sec, "Mainboard hỗ trợ tối đa (theo SMBIOS)", human_bytes(maxcap * 1024))

    types = Counter(_ddr(m) for m in mods)
    ddr = types.most_common(1)[0][0] if types else ""
    kv(sec, "Loại", ddr)

    rows = []
    speeds, cfgs, rated = [], [], []
    for m in mods:
        spd, cfg = to_int(m.get("Speed")), to_int(m.get("ConfiguredClockSpeed"))
        rs = rated_speed_from_part(m.get("PartNumber"))
        speeds.append(spd)
        cfgs.append(cfg)
        rated.append(rs)
        v = to_int(m.get("ConfiguredVoltage"))
        rows.append([m.get("DeviceLocator"), m.get("BankLabel"), human_bytes(m.get("Capacity")), _ddr(m),
                     FORM.get(to_int(m.get("FormFactor")), ""), f"{spd or ''}", f"{cfg or ''}",
                     f"{rs}" if rs else "", f"{v / 1000:.2f} V" if v else "",
                     (m.get("Manufacturer") or "").strip(), (m.get("PartNumber") or "").strip(),
                     _channel(m) or "?"])
    table(sec, "Các thanh RAM", ["Khe", "Bank", "Dung lượng", "Loại", "Kiểu", "Speed (SPD)", "Đang chạy (MT/s)",
                                 "Định mức XMP/EXPO", "Điện áp", "Hãng", "Mã linh kiện", "Kênh"], rows)

    # XMP / DOCP / EXPO
    cfg_now = max((c for c in cfgs if c), default=None)
    rated_max = max((r for r in rated if r), default=None)
    if cfg_now:
        kv(sec, "Tốc độ đang chạy", f"{cfg_now} MT/s")
        jmax = JEDEC_MAX.get(ddr)
        vmax = max((to_int(m.get("ConfiguredVoltage"), 0) for m in mods), default=0)
        oc = (jmax and cfg_now > jmax) or (ddr == "DDR4" and vmax >= 1300) or (ddr == "DDR5" and vmax >= 1250)
        if oc:
            kv(sec, "XMP/DOCP/EXPO", "Có vẻ ĐANG BẬT (tốc độ/điện áp vượt chuẩn JEDEC)")
            finding(sec, INFO, f"RAM đang chạy profile ép xung XMP/DOCP/EXPO ({cfg_now} MT/s).",
                    "Nếu máy BSOD/treo ngẫu nhiên, thử TẮT XMP/EXPO trong BIOS để loại trừ trước khi kết luận RAM hỏng.")
        elif rated_max and cfg_now + 100 < rated_max:
            kv(sec, "XMP/DOCP/EXPO", f"Có vẻ CHƯA BẬT (RAM định mức {rated_max}, đang chạy {cfg_now})")
            finding(sec, INFO, f"RAM hỗ trợ {rated_max} MT/s nhưng đang chạy {cfg_now} MT/s.",
                    "Có thể bật XMP/DOCP/EXPO trong BIOS nếu máy ổn định (hoặc do CPU/mainboard giới hạn).")
        else:
            kv(sec, "XMP/DOCP/EXPO", "Không phát hiện (chạy tốc độ JEDEC)")

    # Dual channel (ước tính)
    chans = {c for c in (_channel(m) for m in mods) if c}
    if len(mods) == 1:
        kv(sec, "Kênh (ước tính)", "Single channel (1 thanh)")
        if slots >= 2:
            finding(sec, INFO, "Chỉ có 1 thanh RAM - chạy single channel.",
                    "Lắp thêm 1 thanh cùng loại để chạy dual channel (tăng hiệu năng đáng kể, nhất là máy dùng iGPU).")
    elif len(chans) >= 2:
        kv(sec, "Kênh (ước tính)", f"Dual/Multi channel (kênh {', '.join(sorted(chans))})")
    elif len(chans) == 1 and len(mods) >= 2:
        kv(sec, "Kênh (ước tính)", f"Có thể SINGLE channel - cả {len(mods)} thanh cùng kênh {next(iter(chans))}")
        finding(sec, WARN, f"{len(mods)} thanh RAM có vẻ cùng nằm trên kênh {next(iter(chans))}.",
                "Kiểm tra lắp đúng khe theo sách mainboard (thường A2 + B2) để chạy dual channel.")
    elif len(mods) >= 2:
        kv(sec, "Kênh (ước tính)", "Có thể dual channel (BIOS không ghi tên kênh)")
    if ddr == "DDR5":
        note(sec, "DDR5: mỗi thanh có 2 kênh con 32-bit; 'dual channel' ở đây hiểu theo số thanh trên 2 kênh của CPU.")

    # Không đồng bộ
    caps = {to_int(m.get("Capacity")) for m in mods}
    parts = {(m.get("PartNumber") or "").strip() for m in mods}
    if len(mods) >= 2 and (len(caps) > 1 or len(parts) > 1 or len({s for s in speeds if s}) > 1):
        finding(sec, INFO, "Các thanh RAM khác dung lượng/mã/tốc độ (lắp lẫn).",
                "RAM lẫn vẫn chạy nhưng dễ mất ổn định khi bật XMP; nếu có BSOD, thử từng thanh riêng.")

    # ECC
    ecc_modes = {to_int(a.get("MemoryErrorCorrection")) for a in arrays}
    ecc_width = any(to_int(m.get("TotalWidth"), 0) > to_int(m.get("DataWidth"), 0) > 0 for m in mods)
    if ecc_width or ecc_modes & {5, 6}:
        kv(sec, "ECC", "Có (ECC)")
    else:
        kv(sec, "ECC", "Non-ECC" + (" (DDR5 chỉ có on-die ECC nội bộ)" if ddr == "DDR5" else ""))

    # Windows dùng được ít hơn nhiều so với lắp
    total_os = to_int(cs.get("TotalPhysicalMemory"))
    if installed and total_os and installed - total_os > max(1.5 * 1024 ** 3, installed * 0.1):
        finding(sec, INFO, f"Windows chỉ dùng {human_bytes(total_os)} / {human_bytes(installed)} đã lắp.",
                "Phần chênh thường là RAM chia cho card onboard (iGPU). Nếu chênh bằng cả 1 thanh: thanh đó hoặc khe có vấn đề.")

    # Bộ đếm bộ nhớ
    perf = next((p for p in as_list(src.ps("memperf")) if isinstance(p, dict)), {})
    commit = to_int(perf.get("PercentCommittedBytesInUse"))
    if commit is not None:
        kv(sec, "Commit đang dùng", f"{commit}%")
        if commit >= 90:
            finding(sec, WARN, f"Bộ nhớ commit đã dùng {commit}% - sắp hết RAM + pagefile.",
                    "Tăng pagefile hoặc nâng RAM; hết commit có thể gây crash ứng dụng.")

    # WHEA lỗi bộ nhớ
    whea = [e for e in ev.normalize(src.events("whea")) if ev.whea_classify(e) == "RAM"]
    if whea:
        fatal = [e for e in whea if e["id"] in (1, 18, 20, 46)]
        lv = CRIT if fatal else WARN
        finding(sec, lv, f"WHEA ghi nhận {len(whea)} lỗi liên quan bộ nhớ trong {src.days} ngày"
                         f"{' (có lỗi không sửa được)' if fatal else ''}.",
                "Test RAM bằng MemTest86/TestMem5, tắt XMP, thử từng thanh.")
        table(sec, "WHEA - bộ nhớ", ["Thời điểm", "ID", "Nội dung"],
              [[fmt_date(e["time"]), e["id"], e["msg"][:200]] for e in whea[:20]])

    # Windows Memory Diagnostic (chỉ đọc kết quả, không tự lên lịch test)
    md = ev.normalize(src.events("memdiag"))
    if md:
        last = md[0]
        bad = last["id"] in (1102, 1202) or "detected hardware errors" in last["msg"].lower() \
            or "phát hiện lỗi" in last["msg"].lower()
        kv(sec, "Windows Memory Diagnostic", f"{fmt_date(last['time'])}: {'CÓ LỖI' if bad else 'không phát hiện lỗi'}")
        if bad:
            finding(sec, CRIT, f"Windows Memory Diagnostic ({fmt_date(last['time'])}) phát hiện LỖI PHẦN CỨNG RAM.",
                    "Thử từng thanh/khe để xác định thanh hỏng; bảo hành hoặc thay RAM.")
    else:
        kv(sec, "Windows Memory Diagnostic", f"Chưa có kết quả trong {src.days} ngày")
        note(sec, "Muốn test RAM bằng công cụ của Windows: gõ 'mdsched' trong Start (máy sẽ khởi động lại). "
                  "Tool này không tự chạy/lên lịch test.")

    # BSOD liên quan RAM
    dumps = (src.probe("minidumps") or {}).get("dumps") or []
    ram_bsod = Counter()
    for d in dumps:
        code = d.get("bugcheck")
        if code is not None:
            name, cats, _ = bc.describe(code)
            if cats and cats[0] == bc.RAM:
                ram_bsod[name] += 1
    if ram_bsod:
        finding(sec, WARN, "Có BSOD mã liên quan bộ nhớ: " + ", ".join(f"{k} x{v}" for k, v in ram_bsod.items()) + ".",
                "Xem thêm mục Crash/Dump; ưu tiên test RAM và tắt XMP.")

    if not sec["findings"]:
        finding(sec, OK, "Không thấy dấu hiệu lỗi RAM trong dữ liệu đọc được.")
    note(sec, "Tool chỉ đọc thông tin; muốn kết luận chắc chắn RAM lỗi cần chạy MemTest86 nhiều lượt.")
    return sec
