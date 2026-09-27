# -*- coding: utf-8 -*-
"""Crash/Dump Analysis: đọc metadata dump, WER và Event Log để khoanh vùng lỗi
xanh màn hình, treo máy, tự restart, màn hình đen, lỗi driver / VGA / RAM / ổ cứng."""
import datetime as _dt
import re
from collections import Counter, defaultdict

from ..model import (OK, INFO, WARN, CRIT, new_section, kv, finding, table, note, as_list, to_int, parse_date,
                     fmt_date, human_bytes)
from ..analysis import bugcheck as bc
from ..analysis import events as ev

_RE_BC_MSG = re.compile(r"0x([0-9a-fA-F]{8})\s*\(")


def _ts(v):
    if isinstance(v, (int, float)):
        return _dt.datetime.fromtimestamp(v)
    return parse_date(v)


def run(src):
    sec = new_section("crash", "Crash / Dump")
    score = Counter()           # nhóm nghi vấn -> điểm
    evidence = defaultdict(list)  # nhóm -> bằng chứng

    # ---------- 1. File dump ----------
    md = src.probe("minidumps") or {}
    dumps = [d for d in md.get("dumps") or [] if isinstance(d, dict)]
    rows = []
    bsod_codes = Counter()
    suspect_drivers = Counter()
    for d in dumps:
        t = parse_date(d.get("crash_time")) or _ts(d.get("mtime"))
        if d.get("error"):
            rows.append([fmt_date(t), d.get("file"), "Không đọc được" if d["error"] == "access_denied" else d["error"],
                         "", "", "", ""])
            continue
        code = d.get("bugcheck")
        name, cats, hint = bc.describe(code)
        bsod_codes[name] += 1
        score[cats[0]] += 3
        for c in cats[1:]:
            score[c] += 1
        evidence[cats[0]].append(f"BSOD {name}")
        tri = d.get("triage") or {}
        sus = tri.get("suspects") or []
        for s in sus[:1]:
            suspect_drivers[s] += 1
            cat = bc.KNOWN_DRIVERS.get(s, (bc.DRIVER, ""))[0]
            score[cat] += 2
            evidence[cat].append(f"driver {s} trên stack BSOD")
        sus_txt = ", ".join(f"{s}{' (' + bc.KNOWN_DRIVERS[s][1] + ')' if s in bc.KNOWN_DRIVERS else ''}" for s in sus[:3])
        rows.append([fmt_date(t), d.get("file") + (" (full)" if d.get("full_dump") else ""), name,
                     d.get("bugcheck_hex"), " ".join(d.get("params") or []), bc.CATEGORY_LABEL.get(cats[0], cats[0]),
                     sus_txt])
    table(sec, "File dump (BSOD)", ["Thời điểm", "File", "BugCheck", "Mã", "Tham số", "Nghi vấn", "Driver nghi vấn (stack)"], rows)
    kv(sec, "Số file dump", f"{len(dumps)}" + (f" ({md.get('denied')} file không đọc được - cần quyền Admin)"
                                                if md.get("denied") else ""))
    if md and not md.get("dir_exists") and not dumps:
        note(sec, "Không có thư mục C:\\Windows\\Minidump: máy chưa từng ghi minidump, hoặc đã tắt ghi dump "
                  "(System Properties > Startup and Recovery). Bật 'Small memory dump' để lần lỗi sau có dữ liệu.")

    # ---------- 2. Event Log: tắt/khởi động bất thường, BugCheck ----------
    pev = ev.normalize(src.events("power"))
    kp41 = [e for e in pev if e["id"] == 41 and "kernel-power" in e["provider"].lower()]
    ev6008 = [e for e in pev if e["id"] == 6008 and e["provider"] == "EventLog"]
    bc1001 = [e for e in pev if e["id"] == 1001 and ("bugcheck" in e["provider"].lower() or "wer-system" in e["provider"].lower())]
    kp_no_bsod = 0
    kp_codes, ev_codes = Counter(), Counter()
    for e in kp41:
        code = bc.parse_code(e["props"][0], base=10) if e["props"] else None
        if code:
            kp_codes[code] += 1
        else:
            kp_no_bsod += 1
    for e in bc1001:
        m = _RE_BC_MSG.search(e["msg"])
        if m:
            ev_codes[int(m.group(1), 16)] += 1
    if not dumps:  # không có file dump -> lấy mã BSOD từ Event Log (1001, không có thì Kernel-Power 41)
        for code, n in (ev_codes or kp_codes).items():
            name, cats, _ = bc.describe(code)
            bsod_codes[name] += n
            score[cats[0]] += min(6, 2 * n)
            evidence[cats[0]].append(f"BSOD {name} (Event Log)")
    kv(sec, f"Tắt máy bất thường ({src.days} ngày)", f"Kernel-Power 41: {len(kp41)} lần, EventLog 6008: {len(ev6008)} lần")
    kv(sec, "BSOD ghi trong Event Log", f"{len(bc1001)} lần")
    if kp_no_bsod:
        score[bc.POWER] += min(6, kp_no_bsod * 2)
        evidence[bc.POWER].append(f"{kp_no_bsod} lần mất nguồn/treo cứng không có BSOD")
        finding(sec, WARN if kp_no_bsod < 5 else CRIT,
                f"{kp_no_bsod} lần máy tắt/khởi động lại đột ngột KHÔNG kèm mã BSOD (Kernel-Power 41, BugcheckCode = 0).",
                "Thường là: mất điện/nguồn (PSU yếu, ổ cắm, pin laptop chai), treo cứng phải bấm nút nguồn, "
                "hoặc quá nhiệt. Kiểm tra nguồn, nhiệt độ CPU/VGA, bỏ ép xung.")
    if bsod_codes:
        finding(sec, CRIT if sum(bsod_codes.values()) >= 3 else WARN,
                "Máy đã bị BSOD: " + ", ".join(f"{k} x{v}" for k, v in bsod_codes.most_common(6)) + ".",
                "Xem bảng file dump và phần 'Nhận định' bên dưới.")

    # ---------- 3. WHEA ----------
    whea = ev.normalize(src.events("whea"))
    if whea:
        by = Counter(ev.whea_classify(e) for e in whea)
        fatal = [e for e in whea if e["id"] in (1, 18, 20, 46)]
        kv(sec, "WHEA (lỗi phần cứng)", ", ".join(f"{k}: {v}" for k, v in by.items()) + (f" - {len(fatal)} lỗi nghiêm trọng" if fatal else ""))
        if fatal:
            cat = {"RAM": bc.RAM, "PCIe": bc.GPU}.get(ev.whea_classify(fatal[0]), bc.CPU)
            score[cat] += 4
            evidence[cat].append(f"{len(fatal)} lỗi WHEA nghiêm trọng")
            finding(sec, CRIT, f"{len(fatal)} lỗi phần cứng WHEA KHÔNG sửa được (thường đi kèm BSOD 0x124 / tự restart).",
                    "Bỏ ép xung CPU/RAM (tắt XMP/PBO/undervolt), cập nhật BIOS, kiểm tra nhiệt và nguồn.")
        for k, v in by.items():
            if k == "RAM":
                score[bc.RAM] += 2
                evidence[bc.RAM].append(f"{v} lỗi WHEA bộ nhớ")
            elif k == "PCIe" and v >= 5:
                score[bc.GPU] += 1
                evidence[bc.GPU].append(f"{v} lỗi WHEA PCIe")
            elif k == "CPU":
                score[bc.CPU] += 2
                evidence[bc.CPU].append(f"{v} lỗi WHEA CPU")

    # ---------- 4. VGA TDR / LiveKernelEvent ----------
    gev = ev.normalize(src.events("gpu"))
    tdr = [e for e in gev if e["id"] == 4101 or (e["provider"].lower() == "nvlddmkm" and e["id"] in (13, 14, 153))]
    aev = ev.normalize(src.events("app"))
    lke = ev.live_kernel_codes(aev)
    gpu_lke = sum(n for c, n in lke.items() if bc.parse_code(c) in (0x141, 0x117, 0x193))
    if tdr or gpu_lke:
        score[bc.GPU] += min(6, 2 + (len(tdr) + gpu_lke) // 3)
        evidence[bc.GPU].append(f"{len(tdr)} TDR, {gpu_lke} LiveKernelEvent đồ họa")
        kv(sec, "Treo/reset driver VGA", f"TDR: {len(tdr)}, LiveKernelEvent GPU: {gpu_lke}")
    if lke:
        kv(sec, "LiveKernelEvent", ", ".join(f"{bc.describe(bc.parse_code(c))[0]} x{n}" for c, n in lke.most_common(5)))
    lkr = [r for r in as_list(src.probe("live_kernel_reports")) if isinstance(r, dict)]
    if lkr:
        table(sec, "LiveKernelReports", ["File", "Dung lượng", "Thời điểm"],
              [[r.get("name"), human_bytes(r.get("size")), fmt_date(_ts(r.get("mtime")))] for r in lkr[:15]])

    # ---------- 5. Lỗi ổ cứng trong Event Log ----------
    derr = ev.disk_errors(ev.normalize(src.events("disk")))
    if derr:
        c = Counter(lbl for _, lbl in derr)
        heavy = sum(n for lbl, n in c.items() if any(x in lbl for x in ("(7)", "(51)", "(154)", "(55)")))
        score[bc.DISK] += min(6, 1 + heavy)
        evidence[bc.DISK].append(f"{len(derr)} lỗi ổ trong Event Log")
        kv(sec, "Lỗi ổ trong Event Log", ", ".join(f"{k} x{v}" for k, v in c.most_common(4)))

    # ---------- 6. Ứng dụng crash/treo ----------
    app_crash = [e for e in aev if e["id"] == 1000 and e["provider"] == "Application Error"]
    app_hang = [e for e in aev if e["id"] == 1002 and e["provider"] == "Application Hang"]
    mods, apps = Counter(), Counter()
    for e in app_crash:
        p = e["props"]
        if len(p) > 3:
            apps[p[0]] += 1
            mods[p[3]] += 1
    if app_crash or app_hang:
        kv(sec, "Ứng dụng crash / treo", f"{len(app_crash)} crash, {len(app_hang)} treo")
        table(sec, "Module gây crash ứng dụng nhiều nhất", ["Module", "Số lần"], [[k, v] for k, v in mods.most_common(8)])
        table(sec, "Ứng dụng crash nhiều nhất", ["Ứng dụng", "Số lần"], [[k, v] for k, v in apps.most_common(8)])
        many = {m for m, n in mods.items() if n >= 3}
        if len({a for a in apps}) >= 5 and len(app_crash) >= 15:
            score[bc.RAM] += 1
            evidence[bc.RAM].append("nhiều ứng dụng khác nhau cùng crash")
            finding(sec, WARN, f"{len(app_crash)} lần crash ở {len(apps)} ứng dụng khác nhau.",
                    "Nhiều ứng dụng không liên quan cùng crash -> nghi RAM/ép xung hoặc file hệ thống (chạy 'sfc /scannow')."
                    + (f" Module lặp lại: {', '.join(sorted(many))}." if many else ""))
        gpu_mods = {m for m in mods if re.match(r"(nvwgf2umx|nvoglv|atiumd|amdxx|igd\w+|d3d1[12]|dxgi)", m, re.I)}
        if gpu_mods:
            score[bc.GPU] += 1
            evidence[bc.GPU].append("ứng dụng crash trong module đồ họa " + ", ".join(sorted(gpu_mods)))

    # ---------- 7. WER: BlueScreen không có dump ----------
    wer = [w for w in as_list(src.probe("wer_reports")) if isinstance(w, dict)]
    wer_types = Counter(str((w.get("data") or {}).get("EventType", "?")) for w in wer)
    if wer_types:
        kv(sec, "Báo cáo WER", ", ".join(f"{k}: {v}" for k, v in wer_types.most_common(6)))

    # ---------- 8. Nhận định ----------
    if score:
        rows = []
        total = sum(score.values())
        for cat, pts in score.most_common():
            rows.append([bc.CATEGORY_LABEL.get(cat, cat), f"{pts * 100 // total}%", "; ".join(dict.fromkeys(evidence[cat]))[:300]])
        table(sec, "Nhận định - nhóm nghi vấn (xếp theo mức độ bằng chứng)", ["Nhóm", "Tỷ trọng", "Bằng chứng"], rows)
        top_cat = score.most_common(1)[0][0]
        finding(sec, INFO, f"Nghi vấn hàng đầu: {bc.CATEGORY_LABEL.get(top_cat, top_cat)}.", _ADVICE.get(top_cat, ""))
    if suspect_drivers:
        kv(sec, "Driver hay xuất hiện trên stack BSOD", ", ".join(f"{k} x{v}" for k, v in suspect_drivers.most_common(5)))

    if not dumps and not bc1001 and not kp41 and not tdr and not whea:
        finding(sec, OK, f"Không ghi nhận BSOD, tắt máy đột ngột, TDR hay lỗi WHEA trong {src.days} ngày.")
    note(sec, "Phân tích dựa trên metadata (không cần symbol). Để kết luận chính xác driver gây lỗi, mở dump bằng "
              "WinDbg và chạy '!analyze -v'. Tool không xóa file dump hay log.")
    return sec


_ADVICE = {
    bc.RAM: "Tắt XMP/EXPO, test MemTest86 ít nhất 4 lượt, thử từng thanh RAM/từng khe.",
    bc.GPU: "Gỡ driver bằng DDU (Safe Mode) rồi cài bản ổn định, bỏ ép xung VGA, kiểm tra nhiệt độ và dây nguồn PCIe.",
    bc.DISK: "Kiểm tra SMART (mục Ổ cứng), cập nhật firmware SSD, thay cáp SATA/cổng; sao lưu dữ liệu.",
    bc.DRIVER: "Cập nhật/gỡ driver nghi vấn (xem cột 'Driver nghi vấn'), gỡ phần mềm mới cài (antivirus, VPN, RGB, anti-cheat).",
    bc.CPU: "Bỏ ép xung/undervolt, reset BIOS về mặc định, cập nhật BIOS, kiểm tra nhiệt độ CPU và keo tản nhiệt.",
    bc.POWER: "Kiểm tra nguồn (PSU), ổ cắm/UPS, pin laptop; tắt Fast Startup; kiểm tra quá nhiệt.",
    bc.SOFTWARE: "Chạy 'sfc /scannow' và 'DISM /Online /Cleanup-Image /RestoreHealth' (tự chạy tay), gỡ bản cập nhật lỗi.",
    bc.BOOT: "Kiểm tra chế độ SATA trong BIOS (AHCI/RAID), cáp ổ hệ thống, SMART ổ hệ thống.",
}
