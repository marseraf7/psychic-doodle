# -*- coding: utf-8 -*-
"""Đọc metadata file dump kernel của Windows (Minidump / MEMORY.DMP) - chỉ đọc header.

Không thay thế WinDbg '!analyze -v'. Ở đây lấy: mã BugCheck + 4 tham số, loại dump, thời điểm,
build Windows; với minidump 64-bit còn đọc phần triage (danh sách driver + stack luồng lỗi) để
tìm driver NGHI VẤN theo địa chỉ - cách làm tương tự BlueScreenView, chỉ mang tính khoanh vùng.
"""
import datetime as _dt
import re
import struct

# DUMP_HEADER64 ('PAGEDU64')
_H64_BUGCHECK = 0x38
_H64_PARAMS = 0x40
_H64_DUMPTYPE = 0xF98
_H64_SYSTIME = 0xFA8
# DUMP_HEADER32 ('PAGEDUMP')
_H32_BUGCHECK = 0x28
_H32_PARAMS = 0x2C

DUMP_TYPES = {1: "Full", 2: "Kernel", 3: "Header only", 4: "Small (minidump)", 5: "Full (bitmap)",
              6: "Kernel (bitmap)", 7: "Automatic/Active"}

HEADER_BYTES = 0x2000
SCAN_BYTES = 16 * 1024 * 1024


def _filetime(v):
    if not v:
        return None
    try:
        d = _dt.datetime(1601, 1, 1) + _dt.timedelta(microseconds=v / 10)
    except OverflowError:
        return None
    return d if 2000 <= d.year <= 2100 else None


def parse_header(buf):
    """buf: bytes đầu file (>= 0x1000). Trả dict hoặc {'error': ...}."""
    if len(buf) < 0x60:
        return {"error": "file_too_small"}
    sig = buf[:8]
    if sig == b"PAGEDU64":
        code = struct.unpack_from("<I", buf, _H64_BUGCHECK)[0]
        params = list(struct.unpack_from("<4Q", buf, _H64_PARAMS))
        dtype = struct.unpack_from("<I", buf, _H64_DUMPTYPE)[0] if len(buf) >= _H64_DUMPTYPE + 4 else None
        systime = _filetime(struct.unpack_from("<Q", buf, _H64_SYSTIME)[0]) if len(buf) >= _H64_SYSTIME + 8 else None
        arch = "x64"
    elif sig == b"PAGEDUMP":
        code = struct.unpack_from("<I", buf, _H32_BUGCHECK)[0]
        params = list(struct.unpack_from("<4I", buf, _H32_PARAMS))
        dtype, systime, arch = None, None, "x86"
    elif sig[:4] == b"MDMP":
        return {"error": "user_mode_dump"}
    else:
        return {"error": "unknown_signature"}
    minor = struct.unpack_from("<I", buf, 0x0C)[0]
    return {
        "bugcheck": code,
        "bugcheck_hex": f"0x{code:08X}",
        "params": [f"0x{p:X}" for p in params],
        "dump_type": DUMP_TYPES.get(dtype, str(dtype) if dtype is not None else ""),
        "crash_time": systime.isoformat(timespec="seconds") if systime else None,
        "windows_build": minor,
        "arch": arch,
    }


# ---------- Triage dump (minidump 64-bit): danh sách driver + stack của luồng lỗi ----------
# TRIAGE_DUMP64 nằm ngay sau header 0x2000 byte
_TRIAGE_OFF = 0x2000
_T_FIELDS = ("ServicePackBuild", "SizeOfDump", "ValidOffsets", "ContextOffset", "ExceptionOffset", "MmOffset",
             "UnloadedDriversOffset", "PrcbOffset", "ProcessOffset", "ThreadOffset", "CallStackOffset",
             "SizeOfCallStack", "DriverListOffset", "DriverCount", "StringPoolOffset", "StringPoolSize",
             "BrokenDriverOffset", "TriageOptions")
_KERNEL_CORE = {"ntoskrnl.exe", "ntkrnlmp.exe", "ntkrnlpa.exe", "ntkrpamp.exe", "hal.dll", "halmacpi.dll"}
_MIN_KADDR = 0xFFFF800000000000


def _read_dump_string(buf, off):
    """DUMP_STRING: ULONG Length (số ký tự) + WCHAR Buffer[]."""
    if off <= 0 or off + 4 > len(buf):
        return None
    n = struct.unpack_from("<I", buf, off)[0]
    if not 1 <= n <= 260 or off + 4 + n * 2 > len(buf):
        return None
    try:
        s = buf[off + 4:off + 4 + n * 2].decode("utf-16-le")
    except UnicodeDecodeError:
        return None
    if not re.fullmatch(r"[\\A-Za-z0-9_\-.~$ ]+\.(sys|dll|exe)", s, re.I):
        return None
    return s.rsplit("\\", 1)[-1].lower()


def _parse_driver_list(buf, off, count):
    """Cỡ mỗi DUMP_DRIVER_ENTRY thay đổi theo bản Windows -> dò bước nhảy và vị trí DllBase,
    chỉ chấp nhận khi MỌI mục đều hợp lệ (tên driver + địa chỉ kernel + kích thước hợp lý)."""
    for stride in range(0x60, 0x201, 8):
        if off + stride * count > len(buf):
            continue
        for base_off in (0x38, 0x30, 0x40):
            mods = []
            for i in range(count):
                e = off + i * stride
                name = _read_dump_string(buf, struct.unpack_from("<I", buf, e)[0])
                base = struct.unpack_from("<Q", buf, e + base_off)[0]
                size = struct.unpack_from("<I", buf, e + base_off + 0x10)[0]
                if not name or base < _MIN_KADDR or not 0x1000 <= size <= 0x10000000:
                    break
                mods.append((base, base + size, name))
            else:
                return mods
    return []


def parse_triage(buf):
    """Trả {'modules': n, 'suspects': [...], 'param_hits': [...], 'stack_modules': [...]} hoặc {}."""
    if len(buf) < _TRIAGE_OFF + 0x50 or buf[:8] != b"PAGEDU64":
        return {}
    t = dict(zip(_T_FIELDS, struct.unpack_from("<18I", buf, _TRIAGE_OFF)))
    size = len(buf)
    cnt = t["DriverCount"]
    if not (5 <= cnt <= 2000 and 0 < t["DriverListOffset"] < size and 0 < t["CallStackOffset"] < size):
        return {}
    mods = _parse_driver_list(buf, t["DriverListOffset"], cnt)
    if not mods:
        return {}

    def owner(addr):
        for lo, hi, n in mods:
            if lo <= addr < hi:
                return n
        return None

    # Tham số BugCheck trỏ thẳng vào vùng code của driver -> bằng chứng mạnh
    params = struct.unpack_from("<4Q", buf, _H64_PARAMS)
    param_hits = []
    for i, p in enumerate(params, 1):
        n = owner(p)
        if n:
            param_hits.append({"param": i, "module": n})
    # Quét stack của luồng gây lỗi: địa chỉ trả về rơi vào driver nào
    st_off, st_len = t["CallStackOffset"], min(t["SizeOfCallStack"], 0x10000, size - t["CallStackOffset"])
    seen = []
    for i in range(0, max(0, st_len - 7), 8):
        n = owner(struct.unpack_from("<Q", buf, st_off + i)[0])
        if n and n not in seen:
            seen.append(n)
    suspects = [p["module"] for p in param_hits if p["module"] not in _KERNEL_CORE]
    suspects += [n for n in seen if n not in _KERNEL_CORE and n not in suspects]
    return {"modules": len(mods), "param_hits": param_hits, "stack_modules": seen[:15], "suspects": suspects[:5]}


def parse_dump_file(path, scan_drivers=True):
    with open(path, "rb") as fh:  # chỉ mở chế độ đọc
        head = fh.read(HEADER_BYTES)
        info = parse_header(head)
        if scan_drivers and "error" not in info and info.get("arch") == "x64":
            fh.seek(0)
            tri = parse_triage(fh.read(SCAN_BYTES))
            if tri:
                info["triage"] = tri
    return info
