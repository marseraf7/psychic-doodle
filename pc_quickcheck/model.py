# -*- coding: utf-8 -*-
"""Cấu trúc kết quả chung cho mọi mục kiểm tra (dict thuần -> dễ xuất JSON/HTML)."""
import datetime as _dt
import re

OK, INFO, WARN, CRIT, UNKNOWN = "ok", "info", "warn", "crit", "unknown"
_RANK = {OK: 0, UNKNOWN: 1, INFO: 1, WARN: 2, CRIT: 3}
LEVEL_LABEL = {OK: "Tốt", INFO: "Thông tin", WARN: "Cảnh báo", CRIT: "Nghiêm trọng", UNKNOWN: "Chưa rõ"}
LEVEL_TAG = {OK: "[OK]", INFO: "[i] ", WARN: "[!] ", CRIT: "[X] ", UNKNOWN: "[?] "}


def worst(*levels):
    return max(levels, key=lambda lv: _RANK.get(lv, 0)) if levels else OK


def new_section(key, title):
    return {"key": key, "title": title, "status": OK, "summary": [], "findings": [],
            "tables": [], "notes": []}


def kv(sec, label, value):
    """Dòng tóm tắt 'nhãn: giá trị' (bỏ qua giá trị rỗng)."""
    if value not in (None, "", []):
        sec["summary"].append([label, str(value)])


def finding(sec, level, text, hint=""):
    sec["findings"].append({"level": level, "text": text, "hint": hint})
    sec["status"] = worst(sec["status"], level)


def table(sec, title, columns, rows):
    if rows:
        sec["tables"].append({"title": title, "columns": list(columns),
                              "rows": [["" if c is None else str(c) for c in r] for r in rows]})


def note(sec, text):
    sec["notes"].append(text)


# ---------- Tiện ích định dạng ----------
def as_list(v):
    """PowerShell trả 1 object thay vì mảng khi chỉ có 1 phần tử -> chuẩn hóa về list."""
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def to_int(v, default=None):
    try:
        if isinstance(v, str):
            v = v.strip()
            if v.lower().startswith("0x"):
                return int(v, 16)
        return int(float(v))
    except (TypeError, ValueError):
        return default


def human_bytes(n):
    n = to_int(n)
    if n is None:
        return ""
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(n) < 1024 or unit == "PB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0
    return str(n)


def human_gb_decimal(n):
    """Dung lượng ổ theo kiểu nhà sản xuất ghi (1 GB = 10^9 B)."""
    n = to_int(n)
    if not n:
        return ""
    return f"{n / 1e12:.2f} TB" if n >= 1e12 else f"{n / 1e9:.0f} GB"


_RE_MSDATE = re.compile(r"/Date\((-?\d+)")


def parse_date(v):
    """Nhận ISO-8601, '/Date(ms)/' (PowerShell 5.1), dict {'value':...}, FILETIME, chuỗi WMI."""
    if v is None or v == "":
        return None
    if isinstance(v, dict):
        return parse_date(v.get("value") or v.get("DateTime"))
    if isinstance(v, (int, float)):
        if v > 1e16:  # FILETIME (100ns từ 1601)
            try:
                return _dt.datetime(1601, 1, 1) + _dt.timedelta(microseconds=v / 10)
            except OverflowError:
                return None
        return None
    s = str(v).strip()
    m = _RE_MSDATE.search(s)
    if m:
        return _dt.datetime(1970, 1, 1) + _dt.timedelta(milliseconds=int(m.group(1)))
    m = re.match(r"^(\d{14})\.\d+", s)  # CIM_DATETIME 20240101123000.000000+420
    if m:
        return _dt.datetime.strptime(m.group(1), "%Y%m%d%H%M%S")
    try:
        s2 = re.sub(r"(\.\d{6})\d+", r"\1", s.replace("Z", "+00:00"))
        d = _dt.datetime.fromisoformat(s2)
        return d.replace(tzinfo=None)
    except ValueError:
        return None


def fmt_date(v, with_time=True):
    d = parse_date(v) if not isinstance(v, _dt.datetime) else v
    if not d:
        return ""
    return d.strftime("%d/%m/%Y %H:%M" if with_time else "%d/%m/%Y")
