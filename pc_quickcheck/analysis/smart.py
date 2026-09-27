# -*- coding: utf-8 -*-
"""Đánh giá sức khỏe ổ cứng từ SMART (SATA) và NVMe Health Log.

Nguồn dữ liệu:
  - smartctl -x -j (smartmontools) : đầy đủ nhất, hỗ trợ SATA HDD/SSD, NVMe, nhiều box USB.
  - WMI MSStorageDriver_FailurePredictData : bảng SMART thô của ổ SATA (không cần smartctl).
Kết quả là danh sách phát hiện (mức, nội dung, gợi ý) - tool KHÔNG ghi gì xuống ổ.
"""
from ..model import OK, INFO, WARN, CRIT, to_int

HDD, SATA_SSD, NVME, USB, UNKNOWN_KIND = "SATA HDD", "SATA SSD", "NVMe SSD", "USB", "Chưa rõ"

# id -> tên hiển thị tiếng Việt
ATTR_NAMES = {
    1: "Raw Read Error Rate", 5: "Sector đã thay thế (Reallocated)", 9: "Số giờ chạy",
    10: "Spin Retry", 12: "Số lần bật/tắt", 173: "Wear Leveling", 177: "Wear Leveling Count",
    169: "Tuổi thọ còn lại (%)", 171: "Program Fail", 172: "Erase Fail", 174: "Mất điện đột ngột",
    180: "Unused Reserved Block", 181: "Program Fail (tổng)", 182: "Erase Fail (tổng)",
    183: "Runtime Bad Block", 184: "Lỗi End-to-End", 187: "Lỗi không sửa được (Reported)",
    188: "Command Timeout", 190: "Nhiệt độ (airflow)", 192: "Tắt nguồn đột ngột", 194: "Nhiệt độ",
    195: "ECC Recovered", 196: "Sự kiện Reallocate", 197: "Sector chờ xử lý (Pending)",
    198: "Sector không đọc được (Offline Uncorrectable)", 199: "Lỗi CRC cáp SATA (UDMA CRC)",
    202: "Tuổi thọ còn lại (%)", 231: "Tuổi thọ SSD còn lại", 232: "Available Reserved Space",
    233: "Media Wearout Indicator", 241: "Tổng dữ liệu ghi", 242: "Tổng dữ liệu đọc",
}
# Thuộc tính mà giá trị CHUẨN HÓA (value) phản ánh % tuổi thọ còn lại trên nhiều hãng SSD
LIFE_ATTRS = (231, 233, 177, 169, 202)


def _raw(attr):
    raw = attr.get("raw") or {}
    return to_int(raw.get("value"), 0) if isinstance(raw, dict) else to_int(raw, 0)


def classify(smart=None, bus_type=None, media_type=None, spindle=None):
    """Phân biệt SATA HDD / SATA SSD / NVMe / USB từ smartctl + Get-PhysicalDisk."""
    bus = str(bus_type or "").lower()
    media = str(media_type or "").lower()
    if smart:
        proto = str((smart.get("device") or {}).get("protocol", "")).lower()
        if proto == "nvme" or "nvme_smart_health_information_log" in smart:
            return NVME
        rr = smart.get("rotation_rate")
        if rr is not None:
            return SATA_SSD if to_int(rr, -1) == 0 else HDD
    if bus in ("17", "nvme"):
        return NVME
    if bus in ("7", "usb"):
        return USB
    if media in ("4", "ssd"):
        return SATA_SSD
    if media in ("3", "hdd"):
        return HDD
    if spindle is not None and to_int(spindle, -1) == 0:
        return SATA_SSD
    if spindle and to_int(spindle, 0) > 0 and to_int(spindle, 0) < 20000:
        return HDD
    return UNKNOWN_KIND


def evaluate_ata(attrs, is_ssd, smart_passed=None, error_log_count=0, selftest_failed=False):
    """attrs: [{'id','name','value','worst','thresh','raw':{'value'},'when_failed'}]."""
    f = []
    by_id = {a.get("id"): a for a in attrs if a.get("id") is not None}
    info = {"power_on_hours": None, "temperature": None, "life_left": None, "written_bytes": None}

    if smart_passed is False:
        f.append((CRIT, "SMART tổng thể: FAILED - ổ tự báo sắp hỏng.",
                  "Sao lưu dữ liệu NGAY, không ghi thêm, chuẩn bị thay ổ."))
    for a in attrs:
        wf = str(a.get("when_failed") or "")
        val, th = to_int(a.get("value")), to_int(a.get("thresh"), 0)
        if wf == "now" or (th and val is not None and val <= th):
            f.append((CRIT, f"Thuộc tính {a.get('id')} ({a.get('name')}) đã chạm ngưỡng hỏng (value {val} <= {th}).",
                      "Sao lưu dữ liệu và thay ổ."))
        elif wf == "past":
            f.append((WARN, f"Thuộc tính {a.get('id')} ({a.get('name')}) từng chạm ngưỡng hỏng trong quá khứ.", ""))

    def raw(i):
        return _raw(by_id[i]) if i in by_id else None

    r5, r197, r198, r187 = raw(5), raw(197), raw(198), raw(187)
    if r5:
        lv = CRIT if r5 >= 50 else WARN
        f.append((lv, f"Có {r5} sector/block đã bị thay thế (ID 5 - Reallocated).",
                  "Ổ đã phát sinh vùng hỏng. Theo dõi, nếu tăng dần thì thay ổ sớm." if lv == WARN else
                  "Số lượng lớn: nguy cơ hỏng cao, sao lưu dữ liệu và thay ổ."))
    if r197:
        f.append((CRIT, f"Có {r197} sector đang chờ xử lý (ID 197 - Pending, bad sector chưa remap).",
                  "Đây là bad sector thật: sao lưu dữ liệu ngay, không chạy phần mềm 'sửa bad' khi dữ liệu chưa an toàn."))
    if r198:
        f.append((CRIT, f"Có {r198} sector không đọc được (ID 198 - Offline Uncorrectable).",
                  "Dữ liệu tại các vùng này có thể đã mất. Sao lưu và thay ổ."))
    if r187:
        f.append((WARN, f"Có {r187} lỗi đọc không sửa được đã báo cáo (ID 187).", "Theo dõi cùng ID 5/197/198."))
    r196 = raw(196)
    if r196 and not r5:
        f.append((WARN, f"Có {r196} sự kiện reallocate (ID 196).", ""))
    r184 = raw(184)
    if r184:
        f.append((CRIT, f"Lỗi End-to-End (ID 184 = {r184}): dữ liệu hỏng trên đường truyền trong ổ.",
                  "Lỗi controller/bộ đệm của ổ - nên thay ổ."))
    r188 = raw(188)
    if r188 is not None:
        r188 &= 0xFFFF
        if r188 >= 10:
            f.append((WARN, f"Command Timeout cao (ID 188 = {r188}).", "Kiểm tra cáp SATA, cổng, nguồn cấp cho ổ."))
    r199 = raw(199)
    if r199:
        f.append((WARN if r199 < 1000 else CRIT, f"Có {r199} lỗi CRC truyền dẫn (ID 199 - UDMA CRC).",
                  "Thường do CÁP SATA hoặc CỔNG, không phải mặt đĩa: thay cáp/cổng rồi theo dõi số này có tăng không."))
    r10 = raw(10)
    if r10 and not is_ssd:
        f.append((WARN, f"Spin Retry > 0 (ID 10 = {r10}): động cơ quay đĩa khởi động khó.", "Kiểm tra nguồn; HDD có dấu hiệu cơ."))
    for i in (171, 172, 181, 182):
        if raw(i):
            f.append((WARN, f"SSD có lỗi ghi/xóa NAND (ID {i} = {raw(i)}).", "Theo dõi; nếu tăng nhanh thì thay SSD."))
            break

    poh = raw(9)
    if poh is not None:
        info["power_on_hours"] = poh & 0xFFFFFFFF
    t = raw(194) if 194 in by_id else raw(190)
    if t is not None:
        t &= 0xFF
        if 0 < t < 120:
            info["temperature"] = t
            if t >= (70 if is_ssd else 55):
                f.append((WARN, f"Nhiệt độ ổ cao: {t}°C.", "Kiểm tra luồng gió/tản nhiệt. HDD nên < 50°C."))

    if is_ssd:
        lefts = [to_int(by_id[i].get("value")) for i in LIFE_ATTRS if i in by_id]
        lefts = [x for x in lefts if x is not None and 0 <= x <= 100]
        if lefts:
            life = min(lefts)
            info["life_left"] = life
            if life <= 10:
                f.append((CRIT, f"Tuổi thọ SSD còn khoảng {life}% (ước tính theo SMART).", "Chuẩn bị thay SSD."))
            elif life <= 30:
                f.append((WARN, f"Tuổi thọ SSD còn khoảng {life}% (ước tính theo SMART).", "Theo dõi, sao lưu định kỳ."))
    if 241 in by_id:
        info["written_lba"] = raw(241)

    if error_log_count:
        f.append((WARN if error_log_count < 50 else CRIT,
                  f"Nhật ký lỗi ATA của ổ ghi nhận {error_log_count} lỗi.",
                  "Ổ từng gặp lỗi đọc/ghi hoặc lỗi giao tiếp - đối chiếu với ID 5/197/198/199."))
    if selftest_failed:
        f.append((CRIT, "Lần tự kiểm tra (self-test) gần nhất của ổ báo LỖI.", "Sao lưu và thay ổ."))
    return f, info


NVME_CRIT_BITS = {
    0: "Dung lượng dự phòng (spare) dưới ngưỡng",
    1: "Nhiệt độ vượt ngưỡng",
    2: "Độ tin cậy suy giảm (lỗi media/nội bộ nghiêm trọng)",
    3: "Ổ đã chuyển sang CHỈ ĐỌC",
    4: "Bộ nhớ đệm có nguồn dự phòng bị lỗi",
    5: "Vùng PMR không tin cậy",
}


NVME_FIELDS = {
    "critical_warning": "Critical Warning", "temperature": "Nhiệt độ (°C)", "available_spare": "Vùng dự phòng còn (%)",
    "available_spare_threshold": "Ngưỡng dự phòng (%)", "percentage_used": "Đã dùng tuổi thọ (%)",
    "data_units_read": "Data Units Read (x512 KB)", "data_units_written": "Data Units Written (x512 KB)",
    "host_reads": "Lệnh đọc", "host_writes": "Lệnh ghi", "controller_busy_time": "Controller bận (phút)",
    "power_cycles": "Số lần bật/tắt", "power_on_hours": "Số giờ chạy", "unsafe_shutdowns": "Tắt nguồn đột ngột",
    "media_errors": "Media Errors (lỗi dữ liệu)", "num_err_log_entries": "Mục nhật ký lỗi",
    "warning_temp_time": "Thời gian quá nhiệt cảnh báo (phút)", "critical_comp_time": "Thời gian nhiệt tới hạn (phút)",
}


def evaluate_nvme(log):
    """log: nvme_smart_health_information_log của smartctl."""
    f = []
    cw = to_int(log.get("critical_warning"), 0)
    if cw:
        bits = [txt for b, txt in NVME_CRIT_BITS.items() if cw & (1 << b)]
        f.append((CRIT, "NVMe Critical Warning: " + "; ".join(bits) + f" (0x{cw:02X}).",
                  "Ổ đang tự báo lỗi nghiêm trọng - sao lưu dữ liệu ngay."))
    media = to_int(log.get("media_errors"), 0)
    if media:
        f.append((CRIT, f"NVMe Media Errors = {media}: có lỗi dữ liệu không sửa được trên NAND.",
                  "Sao lưu dữ liệu, kiểm tra bảo hành/thay SSD."))
    used = to_int(log.get("percentage_used"))
    if used is not None:
        if used >= 90:
            f.append((CRIT, f"Đã dùng {used}% tuổi thọ ghi thiết kế (Percentage Used).", "Chuẩn bị thay SSD."))
        elif used >= 70:
            f.append((WARN, f"Đã dùng {used}% tuổi thọ ghi thiết kế (Percentage Used).", "Theo dõi, sao lưu định kỳ."))
    spare, spare_th = to_int(log.get("available_spare")), to_int(log.get("available_spare_threshold"))
    if spare is not None:
        if spare_th is not None and spare <= spare_th:
            f.append((CRIT, f"Vùng dự phòng còn {spare}% (ngưỡng {spare_th}%).", "SSD sắp hết khả năng thay block hỏng."))
        elif spare < 50:
            f.append((WARN, f"Vùng dự phòng còn {spare}%.", "SSD đã dùng nhiều block dự phòng."))
    temp = to_int(log.get("temperature"))
    if temp is not None and temp >= 75:
        f.append((WARN, f"Nhiệt độ NVMe cao: {temp}°C.", "Gắn tản nhiệt/pad cho SSD, kiểm tra luồng gió."))
    if to_int(log.get("critical_comp_time"), 0):
        f.append((WARN, f"SSD từng chạy ở nhiệt độ tới hạn {log.get('critical_comp_time')} phút.", "Cải thiện tản nhiệt."))
    errs = to_int(log.get("num_err_log_entries"), 0)
    if errs and not media:
        f.append((INFO, f"Nhật ký lỗi controller NVMe có {errs} mục.",
                  "Thường vô hại nếu Media Errors = 0 (nhiều driver/phần mềm gửi lệnh không hỗ trợ). "
                  "Chỉ đáng lo khi tăng nhanh kèm lỗi trong Event Log."))
    unsafe = to_int(log.get("unsafe_shutdowns"), 0)
    if unsafe >= 200:
        f.append((INFO, f"Số lần mất điện/tắt máy đột ngột: {unsafe}.", "Tắt máy đúng cách; kiểm tra nguồn/pin nếu tăng nhanh."))
    info = {
        "power_on_hours": to_int(log.get("power_on_hours")),
        "temperature": temp,
        "life_left": None if used is None else max(0, 100 - used),
        "written_bytes": (to_int(log.get("data_units_written"), 0) * 512000) or None,
        "read_bytes": (to_int(log.get("data_units_read"), 0) * 512000) or None,
        "unsafe_shutdowns": unsafe,
        "media_errors": media,
    }
    return f, info


def evaluate_smartctl(data):
    """Đánh giá toàn bộ kết quả `smartctl -x -j` của 1 ổ -> (kind, findings, info, attr_rows)."""
    kind = classify(data)
    if kind == NVME:
        log = data.get("nvme_smart_health_information_log") or {}
        f, info = evaluate_nvme(log)
        passed = (data.get("smart_status") or {}).get("passed")
        if passed is False and not any(x[0] == CRIT for x in f):
            f.insert(0, (CRIT, "SMART tổng thể: FAILED.", "Sao lưu dữ liệu ngay."))
        rows = [[NVME_FIELDS.get(k, k), v] for k, v in log.items()]
        return kind, f, info, rows
    table = ((data.get("ata_smart_attributes") or {}).get("table")) or []
    err = data.get("ata_smart_error_log") or {}
    err_count = to_int(((err.get("extended") or {}).get("count")), None)
    if err_count is None:
        err_count = to_int(((err.get("summary") or {}).get("count")), 0)
    st = (data.get("ata_smart_self_test_log") or {}).get("standard") or {}
    st_table = st.get("table") or []
    st_failed = bool(st_table) and not ((st_table[0].get("status") or {}).get("passed", True))
    f, info = evaluate_ata(table, kind == SATA_SSD, (data.get("smart_status") or {}).get("passed"),
                           err_count, st_failed)
    if info.get("temperature") is None:
        info["temperature"] = to_int((data.get("temperature") or {}).get("current"))
    if info.get("power_on_hours") is None:
        info["power_on_hours"] = to_int((data.get("power_on_time") or {}).get("hours"))
    # Chỉ số 'Percentage Used Endurance Indicator' (Device Statistics) chuẩn hơn các thuộc tính riêng hãng
    for page in ((data.get("ata_device_statistics") or {}).get("pages") or []):
        for row in page.get("table") or []:
            if "Percentage Used" in str(row.get("name")):
                used = to_int(row.get("value"))
                if used is not None:
                    info["life_left"] = max(0, 100 - used)
    rows = [[a.get("id"), ATTR_NAMES.get(a.get("id"), a.get("name")), a.get("value"), a.get("worst"),
             a.get("thresh"), (a.get("raw") or {}).get("string", _raw(a))] for a in table]
    return kind, f, info, rows


# ---------- WMI MSStorageDriver_FailurePredictData (SMART SATA thô, không cần smartctl) ----------
def parse_wmi_smart(vendor_specific, thresholds=None):
    """VendorSpecific: mảng 512 byte, 2 byte đầu là version, sau đó 30 mục x 12 byte:
    [id, flags(2), value, worst, raw(6), reserved]. Thresholds: [id, thresh, ...10 byte]."""
    data = [to_int(b, 0) & 0xFF for b in (vendor_specific or [])]
    th = {}
    if thresholds:
        tb = [to_int(b, 0) & 0xFF for b in thresholds]
        for off in range(2, len(tb) - 11, 12):
            if tb[off]:
                th[tb[off]] = tb[off + 1]
    attrs = []
    for off in range(2, len(data) - 11, 12):
        aid = data[off]
        if not aid:
            continue
        raw = int.from_bytes(bytes(data[off + 5:off + 11]), "little")
        attrs.append({"id": aid, "name": ATTR_NAMES.get(aid, f"Attr {aid}"), "value": data[off + 3],
                      "worst": data[off + 4], "thresh": th.get(aid, 0), "raw": {"value": raw}})
    return attrs
