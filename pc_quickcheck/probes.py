# -*- coding: utf-8 -*-
"""Lớp chạm vào hệ thống Windows - TẤT CẢ đều chỉ đọc.

Mỗi hàm trả dữ liệu thuần JSON (list/dict/str/số) để có thể ghi vào snapshot và
phân tích lại offline (--replay) mà không cần máy gốc.
"""
import base64
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from . import safety
from .analysis import dumpfile

IS_WINDOWS = os.name == "nt"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0  # CREATE_NO_WINDOW

_PS_PREFIX = ("$ErrorActionPreference='SilentlyContinue'\n$ProgressPreference='SilentlyContinue'\n"
              "[Console]::OutputEncoding=[Text.Encoding]::UTF8\n")


class ProbeError(Exception):
    pass


def _run(argv, timeout, dxdiag_tmp_dir=None):
    safety.check_exec(argv, dxdiag_tmp_dir=dxdiag_tmp_dir)
    try:
        p = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=timeout, creationflags=_NO_WINDOW)
    except subprocess.TimeoutExpired:
        raise ProbeError(f"Quá thời gian chờ ({timeout}s): {os.path.basename(argv[0])}")
    except FileNotFoundError:
        raise ProbeError(f"Không tìm thấy chương trình: {argv[0]}")
    return p.returncode, p.stdout, p.stderr


def run_ps_json(script, timeout=120):
    safety.check_ps(script)
    full = (_PS_PREFIX + "$__r = @(\n" + script + "\n)\n"
            "if ($__r.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject $__r -Depth 5 -Compress }")
    enc = base64.b64encode(full.encode("utf-16-le")).decode("ascii")
    _, out, err = _run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", enc], timeout)
    text = out.decode("utf-8", errors="replace").lstrip("\ufeff").strip()
    if not text:
        if err.strip():
            raise ProbeError(err.decode("utf-8", errors="replace").strip()[:300])
        return []
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise ProbeError("PowerShell trả về dữ liệu không phải JSON: " + text[:200])


def is_admin():
    if not IS_WINDOWS:
        return False
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


# ---------- smartctl (smartmontools) ----------
def _tool_dir():
    base = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.dirname(__file__))
    return base


def find_smartctl():
    cands = [os.path.join(_tool_dir(), "bin", "smartctl.exe"), shutil.which("smartctl"),
             r"C:\Program Files\smartmontools\bin\smartctl.exe",
             r"C:\Program Files (x86)\smartmontools\bin\smartctl.exe"]
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def _smartctl_json(args, timeout=60):
    exe = find_smartctl()
    if not exe:
        return None
    _, out, _ = _run([exe] + args, timeout)  # smartctl trả mã lỗi dạng bitmask kể cả khi đọc thành công
    try:
        return json.loads(out.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return None


def smartctl_scan():
    data = _smartctl_json(["--scan-open", "-j"])
    if not data:
        return None
    return [{"name": d.get("name"), "type": d.get("type"), "protocol": d.get("protocol"),
             "info_name": d.get("info_name")} for d in data.get("devices", [])]


_SMART_KEEP = ("device", "model_family", "model_name", "serial_number", "firmware_version", "user_capacity",
               "rotation_rate", "form_factor", "interface_speed", "smart_status", "smart_support",
               "ata_smart_attributes", "ata_smart_error_log", "ata_smart_self_test_log", "ata_device_statistics",
               "nvme_smart_health_information_log", "nvme_error_information_log", "nvme_self_test_log",
               "temperature", "power_on_time", "power_cycle_count", "endurance_used", "smartctl", "sata_version",
               "logical_block_size", "nvme_total_capacity", "nvme_pci_vendor")


def smartctl_info(name, dtype):
    args = ["-x", "-j"]
    if dtype:
        args += ["-d", dtype]
    data = _smartctl_json(args + [name], timeout=90)
    if not data:
        return None
    return {k: data[k] for k in _SMART_KEEP if k in data}


# ---------- Dump / WER / LiveKernelReports ----------
def _win_dir():
    return os.environ.get("SystemRoot", r"C:\Windows")


def _stat_files(pattern, limit=200):
    out = []
    for p in glob.glob(pattern):
        try:
            st = os.stat(p)
        except OSError:
            continue
        out.append({"path": p, "size": st.st_size, "mtime": st.st_mtime})
    out.sort(key=lambda x: x["mtime"], reverse=True)
    return out[:limit]


def minidumps(limit=40):
    """Đọc phần header (và chuỗi tên driver) của các file dump - chỉ mở để đọc."""
    wd = _win_dir()
    files = _stat_files(os.path.join(wd, "Minidump", "*.dmp"), limit)
    full = os.path.join(wd, "MEMORY.DMP")
    if os.path.isfile(full):
        files += _stat_files(full)
    res, denied = [], 0
    for f in files:
        is_full = f["path"].upper().endswith("MEMORY.DMP")
        try:
            info = dumpfile.parse_dump_file(f["path"], scan_drivers=not is_full)
        except PermissionError:
            denied += 1
            info = {"error": "access_denied"}
        except OSError as e:
            info = {"error": str(e)[:120]}
        info.update(file=os.path.basename(f["path"]), size=f["size"], mtime=f["mtime"], full_dump=is_full)
        res.append(info)
    return {"dir_exists": os.path.isdir(os.path.join(wd, "Minidump")), "dumps": res, "denied": denied}


def live_kernel_reports():
    base = os.path.join(_win_dir(), "LiveKernelReports")
    files = _stat_files(os.path.join(base, "*.dmp")) + _stat_files(os.path.join(base, "*", "*.dmp"))
    return [{"name": os.path.relpath(f["path"], base), "size": f["size"], "mtime": f["mtime"]} for f in files]


_WER_KEYS = re.compile(r"^(EventType|EventTime|ReportType|FriendlyEventName|AppName|AppPath|"
                       r"Sig\[\d+\]\.(Name|Value)|DynamicSig\[\d+\]\.(Name|Value)|Response\.BucketId)=", re.I)


def _read_wer(path):
    with open(path, "rb") as fh:
        raw = fh.read(256 * 1024)
    text = raw.decode("utf-16", errors="replace") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else \
        raw.decode("utf-8", errors="replace")
    kv = {}
    for line in text.splitlines():
        if _WER_KEYS.match(line):
            k, _, v = line.partition("=")
            kv[k.strip()] = v.strip()[:300]
    return kv


def wer_reports(limit=80):
    root = os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "Microsoft", "Windows", "WER")
    items = []
    for sub in ("ReportArchive", "ReportQueue"):
        for d in glob.glob(os.path.join(root, sub, "*")):
            f = os.path.join(d, "Report.wer")
            if os.path.isfile(f):
                try:
                    items.append((os.stat(f).st_mtime, sub, d, f))
                except OSError:
                    pass
    items.sort(reverse=True)
    out = []
    for mtime, sub, d, f in items[:limit]:
        try:
            kv = _read_wer(f)
        except OSError:
            continue
        out.append({"folder": os.path.basename(d), "store": sub, "mtime": mtime, "data": kv})
    return out


# ---------- GPU phụ trợ ----------
def nvidia_smi():
    exe = shutil.which("nvidia-smi") or r"C:\Windows\System32\nvidia-smi.exe"
    if not os.path.isfile(exe):
        return None
    fields = ["name", "driver_version", "temperature.gpu", "utilization.gpu", "memory.total", "memory.used",
              "pcie.link.gen.current", "pcie.link.gen.max", "pcie.link.width.current", "pcie.link.width.max",
              "power.draw", "clocks.gr", "fan.speed", "pstate"]
    _, out, _ = _run([exe, "--query-gpu=" + ",".join(fields), "--format=csv,noheader,nounits"], 30)
    rows = []
    for line in out.decode("utf-8", errors="replace").splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) == len(fields):
            rows.append(dict(zip(fields, parts)))
    return rows


_RE_DX = {
    "card": re.compile(r"^\s*Card name:\s*(.+)$"),
    "feature": re.compile(r"^\s*Feature Levels:\s*(.+)$"),
    "wddm": re.compile(r"^\s*Driver Model:\s*(.+)$"),
    "ddi": re.compile(r"^\s*DDI Version:\s*(.+)$"),
    "dx": re.compile(r"^\s*DirectX Version:\s*(.+)$"),
}


def parse_dxdiag(text):
    res = {"directx": None, "adapters": []}
    cur = None
    for line in text.splitlines():
        for key, rx in _RE_DX.items():
            m = rx.match(line)
            if not m:
                continue
            val = m.group(1).strip()
            if key == "dx":
                res["directx"] = res["directx"] or val
            elif key == "card":
                cur = {"name": val}
                res["adapters"].append(cur)
            elif cur is not None and key not in cur:
                cur[key] = val
    return res


def dxdiag():
    exe = os.path.join(_win_dir(), "System32", "dxdiag.exe")
    if not os.path.isfile(exe):
        return None
    tmp = tempfile.mkdtemp(prefix="pcqc_dx_")
    out = os.path.join(tmp, "dxdiag.txt")
    try:
        _run([exe, "/whql:off", "/t", out], 120, dxdiag_tmp_dir=tmp)
        # dxdiag trả về trước khi ghi xong file trên một số máy -> đợi tối đa 60s
        import time
        for _ in range(120):
            if os.path.isfile(out) and os.path.getsize(out) > 0:
                break
            time.sleep(0.5)
        if not os.path.isfile(out):
            return None
        with open(out, "rb") as fh:
            raw = fh.read()
        text = raw.decode("utf-16", errors="replace") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else \
            raw.decode("mbcs" if IS_WINDOWS else "utf-8", errors="replace")
        return parse_dxdiag(text)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)  # chỉ xóa thư mục tạm do chính tool tạo


PROBES = {
    "smartctl_scan": smartctl_scan,
    "smartctl_info": smartctl_info,
    "minidumps": minidumps,
    "live_kernel_reports": live_kernel_reports,
    "wer_reports": wer_reports,
    "nvidia_smi": nvidia_smi,
    "dxdiag": dxdiag,
}
