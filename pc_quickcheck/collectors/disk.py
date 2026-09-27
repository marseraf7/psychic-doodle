# -*- coding: utf-8 -*-
"""Kiểm tra ổ cứng / SSD / NVMe: SMART, NVMe Health Log, bộ đếm lỗi Windows, Event Log."""
import re
from collections import Counter, defaultdict

from ..model import (OK, INFO, WARN, CRIT, LEVEL_LABEL, new_section, kv, finding, table, note, as_list,
                     to_int, human_gb_decimal, worst)
from ..analysis import smart as sm
from ..analysis import events as ev

PCIE_GEN = {1: "Gen1 (2.5 GT/s)", 2: "Gen2 (5 GT/s)", 3: "Gen3 (8 GT/s)", 4: "Gen4 (16 GT/s)", 5: "Gen5 (32 GT/s)"}
_RE_HD = re.compile(r"Harddisk(\d+)", re.I)
_RE_TRAIL = re.compile(r"_\d+$")


def _norm_serial(s):
    return re.sub(r"[\s\-_.]", "", str(s or "")).upper()


def _pd_index(name):
    """/dev/sdb -> 1 (smartctl trên Windows: /dev/sdX = PhysicalDriveN)."""
    m = re.match(r"^/dev/sd([a-z]+)$", str(name or ""))
    if not m:
        return None
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 96)
    return n - 1


def _collect_smartctl(src):
    scan = src.probe("smartctl_scan")
    res = []
    for d in as_list(scan):
        if isinstance(d, dict) and d.get("name"):
            info = src.probe("smartctl_info", d["name"], d.get("type") or "")
            if info:
                res.append((d, info))
    return scan is not None, res


def _wmi_smart_by_pnp(src):
    data = {_RE_TRAIL.sub("", str(x.get("InstanceName", ""))).lower(): x.get("VendorSpecific")
            for x in as_list(src.ps("failpredict_data")) if isinstance(x, dict)}
    th = {_RE_TRAIL.sub("", str(x.get("InstanceName", ""))).lower(): x.get("VendorSpecific")
          for x in as_list(src.ps("failpredict_thresholds")) if isinstance(x, dict)}
    pred = {_RE_TRAIL.sub("", str(x.get("InstanceName", ""))).lower(): x
            for x in as_list(src.ps("failpredict_status")) if isinstance(x, dict)}
    return data, th, pred


def run(src):
    sec = new_section("disk", "Ổ cứng / SSD / NVMe")
    pds = [d for d in as_list(src.ps("physdisk")) if isinstance(d, dict)]
    drives = {str(d.get("Index")): d for d in as_list(src.ps("diskdrive")) if isinstance(d, dict)}
    rel = {str(r.get("DeviceId")): r for r in as_list(src.ps("reliability")) if isinstance(r, dict)}
    has_smartctl, smart_list = _collect_smartctl(src)
    wmi_data, wmi_th, wmi_pred = _wmi_smart_by_pnp(src)

    if not pds and drives:  # Storage module không có (Windows cũ) -> dùng Win32_DiskDrive
        pds = [{"DeviceId": k, "FriendlyName": v.get("Model"), "SerialNumber": v.get("SerialNumber"),
                "Size": v.get("Size"), "BusType": v.get("InterfaceType")} for k, v in drives.items()]
    if not pds:
        finding(sec, WARN, "Không liệt kê được ổ vật lý.", "Chạy tool bằng quyền Administrator.")
        return sec

    # Event Log lỗi ổ theo số HarddiskN
    disk_events = ev.disk_errors(ev.normalize(src.events("disk")))
    ev_by_disk = defaultdict(Counter)
    ev_unassigned = Counter()
    for e, label in disk_events:
        m = _RE_HD.search(e["msg"]) or next((_RE_HD.search(p) for p in e["props"] if _RE_HD.search(p)), None)
        (ev_by_disk[m.group(1)] if m else ev_unassigned)[label] += 1

    used_smart = set()
    overview_rows = []
    for pd in sorted(pds, key=lambda x: to_int(x.get("DeviceId"), 99)):
        did = str(pd.get("DeviceId"))
        name = pd.get("FriendlyName") or drives.get(did, {}).get("Model") or f"Disk {did}"
        label = f"Ổ #{did} {name}"
        # Tìm dữ liệu smartctl tương ứng: theo serial, rồi theo /dev/sdX
        smart = None
        ser = _norm_serial(pd.get("SerialNumber") or drives.get(did, {}).get("SerialNumber"))
        for i, (d, info) in enumerate(smart_list):
            if i in used_smart:
                continue
            if ser and _norm_serial(info.get("serial_number")) == ser:
                smart = info
                used_smart.add(i)
                break
        if smart is None:
            for i, (d, info) in enumerate(smart_list):
                if i not in used_smart and _pd_index(d.get("name")) == to_int(did):
                    smart = info
                    used_smart.add(i)
                    break

        kind = sm.classify(smart, pd.get("BusType"), pd.get("MediaType"), pd.get("SpindleSpeed"))
        findings, info, attr_rows, smart_src = [], {}, [], ""
        if smart:
            kind, findings, info, attr_rows = sm.evaluate_smartctl(smart)
            smart_src = "smartctl"
            if str(pd.get("BusType", "")).lower() in ("7", "usb"):
                kind = f"{kind} (qua USB)"
        else:
            pnp = str(drives.get(did, {}).get("PNPDeviceID", "")).lower()
            if pnp and pnp in wmi_data:
                attrs = sm.parse_wmi_smart(wmi_data[pnp], wmi_th.get(pnp))
                if attrs:
                    is_ssd = kind == sm.SATA_SSD
                    findings, info = sm.evaluate_ata(attrs, is_ssd)
                    attr_rows = [[a["id"], a["name"], a["value"], a["worst"], a["thresh"], a["raw"]["value"]] for a in attrs]
                    smart_src = "WMI SMART"
            if pnp in wmi_pred and wmi_pred[pnp].get("PredictFailure"):
                findings.insert(0, (CRIT, "Windows (SMART predict) báo ổ SẮP HỎNG.", "Sao lưu dữ liệu ngay."))

        # Bộ đếm độ tin cậy của Windows (Get-StorageReliabilityCounter) - bổ sung khi thiếu SMART
        r = rel.get(did) or {}
        if r:
            if info.get("temperature") is None and to_int(r.get("Temperature")):
                info["temperature"] = to_int(r.get("Temperature"))
            if info.get("power_on_hours") is None and to_int(r.get("PowerOnHours")):
                info["power_on_hours"] = to_int(r.get("PowerOnHours"))
            wear = to_int(r.get("Wear"))
            if info.get("life_left") is None and wear is not None and kind != sm.HDD and 0 <= wear <= 100:
                info["life_left"] = 100 - wear
                if not smart_src and wear >= 90:
                    findings.append((CRIT, f"Windows báo SSD đã mòn {wear}%.", "Chuẩn bị thay SSD."))
                elif not smart_src and wear >= 70:
                    findings.append((WARN, f"Windows báo SSD đã mòn {wear}%.", "Theo dõi, sao lưu định kỳ."))
            unc = to_int(r.get("ReadErrorsUncorrected"), 0) + to_int(r.get("WriteErrorsUncorrected"), 0)
            if unc and not smart_src:
                findings.append((CRIT, f"Windows ghi nhận {unc} lỗi đọc/ghi không sửa được trên ổ.",
                                 "Có dấu hiệu lỗi dữ liệu - sao lưu và kiểm tra kỹ bằng smartctl."))
            if not smart_src:
                smart_src = "Windows Storage"

        health = str(pd.get("HealthStatus") or "")
        if health.lower() in ("unhealthy", "2"):
            findings.insert(0, (CRIT, "Windows đánh giá ổ: Unhealthy.", "Sao lưu dữ liệu ngay."))
        elif health.lower() in ("warning", "1"):
            findings.insert(0, (WARN, "Windows đánh giá ổ: Warning.", ""))

        for lbl, n in ev_by_disk.get(did, {}).items():
            lv = CRIT if ("Bad block" in lbl or "paging" in lbl or "154" in lbl) and n >= 3 else WARN
            findings.append((lv, f"Event Log: {lbl} x{n} lần trong {src.days} ngày.",
                             "Lỗi 7/51/154 thường do bề mặt/NAND; 129/153 hay do firmware, driver storage, "
                             "cáp hoặc nguồn cấp ổ." if lv != CRIT else "Ổ đang lỗi thật khi đọc/ghi - sao lưu dữ liệu."))

        if not smart_src:
            note(sec, f"{label}: không đọc được SMART/NVMe log "
                      f"({'cần quyền Administrator' if not src.meta.get('is_admin') else 'ổ/box USB không hỗ trợ'}).")

        lvl = worst(*[x[0] for x in findings]) if findings else (OK if smart_src else INFO)
        for x in findings:
            finding(sec, x[0], f"{label}: {x[1]}", x[2])
        tbw = info.get("written_bytes")
        overview_rows.append([
            did, name, kind, human_gb_decimal(pd.get("Size")), ("Tốt" if lvl in (OK, INFO) else LEVEL_LABEL.get(lvl, lvl)) if smart_src else "Chưa đọc được",
            f"{info['temperature']}°C" if info.get("temperature") else "",
            f"{info['power_on_hours']:,} giờ".replace(",", ".") if info.get("power_on_hours") else "",
            f"{info['life_left']}%" if info.get("life_left") is not None else "",
            f"{tbw / 1e12:.1f} TB" if tbw else "", smart_src, pd.get("FirmwareVersion") or "",
        ])
        if attr_rows:
            table(sec, f"Chi tiết SMART - {label}",
                  ["Trường", "Giá trị"] if len(attr_rows[0]) == 2 else ["ID", "Thuộc tính", "Value", "Worst", "Thresh", "Raw"],
                  attr_rows)

    sec["tables"].insert(0, {"title": "Danh sách ổ", "columns": ["#", "Tên", "Loại", "Dung lượng", "Sức khỏe", "Nhiệt",
                                                                  "Giờ chạy", "Tuổi thọ còn", "Đã ghi", "Nguồn", "Firmware"],
                             "rows": [[str(c) for c in r] for r in overview_rows]})
    for lbl, n in ev_unassigned.items():
        finding(sec, WARN, f"Event Log: {lbl} x{n} lần (không rõ ổ nào).", "")

    # PCIe link của NVMe (chạy x2 thay vì x4, hoặc Gen thấp hơn khả năng)
    rows = []
    for c in as_list(src.ps("nvme_link")):
        if not isinstance(c, dict):
            continue
        cs, cw = to_int(c.get("DEVPKEY_PciDevice_CurrentLinkSpeed")), to_int(c.get("DEVPKEY_PciDevice_CurrentLinkWidth"))
        ms, mw = to_int(c.get("DEVPKEY_PciDevice_MaxLinkSpeed")), to_int(c.get("DEVPKEY_PciDevice_MaxLinkWidth"))
        if cs is None and cw is None:
            continue
        rows.append([c.get("Name"), f"{PCIE_GEN.get(cs, cs)} x{cw}", f"{PCIE_GEN.get(ms, ms)} x{mw}"])
        if cw and mw and cw < mw:
            finding(sec, WARN, f"NVMe controller '{c.get('Name')}' chạy x{cw} trong khi hỗ trợ x{mw}.",
                    "Khe M.2 chia làn với khe khác, hoặc tiếp xúc kém - tốc độ có thể giảm một nửa.")
    table(sec, "PCIe link của NVMe", ["Controller", "Đang chạy", "Tối đa của thiết bị"], rows)

    if not has_smartctl:
        note(sec, "Không tìm thấy smartctl (smartmontools). Với NVMe và ổ qua box USB nên cài smartmontools hoặc đặt "
                  "smartctl.exe vào thư mục 'bin' cạnh tool để đọc NVMe Health Log đầy đủ.")
    note(sec, "Tool chỉ ĐỌC thông tin SMART - không chạy self-test, không ghi, không sửa bad sector.")
    if not sec["findings"]:
        finding(sec, OK, "Không phát hiện dấu hiệu bất thường trên các ổ đọc được.")
    return sec

