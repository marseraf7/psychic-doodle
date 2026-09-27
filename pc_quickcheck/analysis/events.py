# -*- coding: utf-8 -*-
"""Chuẩn hóa và phân loại sự kiện Windows Event Log liên quan phần cứng."""
import re
from collections import Counter

from ..model import as_list, parse_date, to_int

# (provider thường gặp, id) -> (nhóm, mô tả tiếng Việt)
DISK_EVENTS = {
    7: "Bad block trên thiết bị (disk 7)",
    11: "Lỗi controller của ổ (11)",
    15: "Thiết bị chưa sẵn sàng (15)",
    51: "Lỗi khi ghi/đọc trang bộ nhớ (paging) xuống ổ (51)",
    52: "Ổ báo sắp hỏng qua SMART (52)",
    129: "Reset thiết bị lưu trữ do không phản hồi (129)",
    153: "Thao tác I/O phải thử lại (153)",
    154: "I/O thất bại do lỗi phần cứng (154)",
    157: "Ổ bị gỡ bất ngờ (157)",
}
NTFS_EVENTS = {55: "Cấu trúc hệ thống file NTFS bị hỏng (55)", 98: "Volume cần kiểm tra lỗi (98)",
               137: "Lỗi transaction NTFS (137)", 140: "Không ghi được dữ liệu xuống ổ (140)"}
WHEA_EVENTS = {
    1: "WHEA - lỗi phần cứng (1)",
    17: "Lỗi PCIe đã tự sửa (17)",
    18: "LỖI PHẦN CỨNG NGHIÊM TRỌNG - không sửa được (18)",
    19: "Lỗi phần cứng đã tự sửa (19)",
    20: "Lỗi phần cứng nghiêm trọng (20)",
    46: "Lỗi phần cứng (46)",
    47: "Lỗi bộ nhớ đã tự sửa (47)",
}
GPU_EVENTS = {
    4101: "Driver VGA ngừng phản hồi và đã phục hồi (TDR 4101)",
    13: "Lỗi đồ họa NVIDIA (nvlddmkm 13)",
    14: "Lỗi đồ họa NVIDIA (nvlddmkm 14)",
    153: "GPU bị reset (TDR 153)",
}


def normalize(raw):
    out = []
    for e in as_list(raw):
        if not isinstance(e, dict):
            continue
        out.append({
            "time": parse_date(e.get("Time")),
            "id": to_int(e.get("Id")),
            "provider": str(e.get("ProviderName") or ""),
            "level": to_int(e.get("Level")),
            "msg": str(e.get("Msg") or "").strip(),
            "props": [str(p) for p in as_list(e.get("Props"))],
        })
    out.sort(key=lambda x: x["time"] or parse_date("1970-01-01T00:00:00"), reverse=True)
    return out


def disk_errors(events):
    res = []
    for e in events:
        p = e["provider"].lower()
        if "ntfs" in p and e["id"] in NTFS_EVENTS:
            res.append((e, NTFS_EVENTS[e["id"]]))
        elif p != "ntfs" and "ntfs" not in p and e["id"] in DISK_EVENTS and e["level"] in (1, 2, 3, None):
            res.append((e, DISK_EVENTS[e["id"]]))
    return res


def whea_classify(e):
    """Nhóm WHEA theo nội dung thông điệp: bộ nhớ / PCIe / CPU."""
    m = e["msg"].lower()
    if "memory" in m or e["id"] == 47:
        return "RAM"
    if "pci express" in m or "pcie" in m or e["id"] == 17:
        return "PCIe"
    if "processor" in m or "cache" in m or "machine check" in m or "cpu" in m:
        return "CPU"
    return "Khác"


_RE_LKE = re.compile(r"LiveKernelEvent", re.I)
_RE_P1 = re.compile(r"P1:\s*([0-9a-fA-Fx]+)")


def live_kernel_codes(app_events):
    """Từ sự kiện Windows Error Reporting (1001) lấy mã LiveKernelEvent (P1: 141, 117, 1a8...)."""
    c = Counter()
    for e in app_events:
        if e["id"] == 1001 and _RE_LKE.search(e["msg"]):
            m = _RE_P1.search(e["msg"])
            if m:
                c[m.group(1).lower()] += 1
    return c


def top(counter, n=8):
    return counter.most_common(n)
