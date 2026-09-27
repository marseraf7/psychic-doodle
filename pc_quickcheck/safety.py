# -*- coding: utf-8 -*-
"""Bộ lọc CHỈ ĐỌC: mọi lệnh PowerShell / chương trình ngoài phải qua đây trước khi chạy.

Đây là lớp bảo vệ thứ hai (các lệnh trong tool vốn đã chỉ đọc): nếu sau này ai đó
lỡ thêm lệnh có khả năng sửa hệ thống, tool sẽ từ chối chạy thay vì âm thầm thực thi.
"""
import os
import re


class UnsafeCommand(Exception):
    pass


# Toàn bộ động từ PowerShell (approved verbs + vài alias dạng Verb-Noun thường gặp)
_ALL_VERBS = """
Add Approve Assert Backup Block Build Checkpoint Clear Close Compare Complete Compress
Confirm Connect Convert ConvertFrom ConvertTo Copy Debug Deny Deploy Disable Disconnect
Dismount Edit Enable Enter Exit Expand Export Find ForEach Format Get Grant Group Hide
Import Initialize Install Invoke Join Limit Lock Measure Merge Mount Move New Open Optimize
Out Ping Pop Protect Publish Push Read Receive Redo Register Remove Rename Repair Request
Reset Resize Resolve Restart Restore Resume Revoke Save Search Select Send Set Show Skip
Sort Split Start Step Stop Submit Suspend Switch Sync Tee Test Trace Unblock Undo Uninstall
Unlock Unprotect Unpublish Unregister Update Use Wait Watch Where Write
""".split()
ALL_VERBS = {v.lower() for v in _ALL_VERBS}

# Chỉ các động từ đọc/lọc/định dạng dữ liệu trong bộ nhớ
ALLOWED_VERBS = {"get", "select", "where", "foreach", "sort", "measure", "convertto", "group", "test"}
ALLOWED_CMDLETS = {"confirm-securebootuefi"}  # chỉ trả True/False, không đổi cấu hình

_RE_CMDLET = re.compile(r"(?<![\w$\-.:])([A-Za-z]+)-([A-Za-z][A-Za-z0-9]*)")
_DENY_PATTERNS = [
    (re.compile(r">"), "chuyển hướng ghi file (>)"),
    (re.compile(r"\biex\b|\bicm\b|\bsaps\b", re.I), "alias thực thi lệnh"),
    (re.compile(r"\.(Delete|Put|Kill|Terminate|Create|SetValue|DeleteValue|DeleteSubKey\w*|"
                r"Format|Invoke\w*|Remove\w*|Write\w*|Set\w+)\s*\(", re.I), "gọi phương thức ghi/sửa"),
    (re.compile(r"::\s*(Write|Delete|Move|Copy|Create|Append|Replace|Encrypt|Decrypt|SetAttributes|"
                r"Start|Kill)\w*", re.I), "gọi .NET có ghi/sửa"),
    (re.compile(r"\bInvoke(Method)?\b", re.I), "Invoke"),
]


def check_ps(script):
    """Ném UnsafeCommand nếu script PowerShell có dấu hiệu ghi/sửa hệ thống."""
    for m in _RE_CMDLET.finditer(script):
        verb, noun = m.group(1).lower(), m.group(2)
        full = f"{verb}-{noun.lower()}"
        if verb in ALL_VERBS and verb not in ALLOWED_VERBS and full not in ALLOWED_CMDLETS:
            raise UnsafeCommand(f"Lệnh không được phép (không phải chỉ đọc): {m.group(0)}")
    for rx, why in _DENY_PATTERNS:
        m = rx.search(script)
        if m:
            raise UnsafeCommand(f"Từ chối script PowerShell: {why} -> '{m.group(0)}'")
    return True


# ---------- Chương trình ngoài ----------
_SMARTCTL_FLAGS = {"--scan-open", "--scan", "-j", "--json", "-x", "-a", "-H", "-i", "-A", "--xall", "--all"}
_SMARTCTL_DEV_TYPES = re.compile(r"^(auto|ata|sat(,\d+)?|scsi|nvme(,0x[0-9a-f]+)?|sntasmedia|sntjmicron(,0x[0-9a-f]+)?|"
                                 r"sntrealtek|usbjmicron|usbprolific|usbsunplus|usbcypress|csmi,\d+|areca,\d+|"
                                 r"megaraid,\d+|aacraid,\d+,\d+,\d+|intelliprop,\d+)$", re.I)
_SMARTCTL_DEV = re.compile(r"^(/dev/(sd[a-z]{1,2}|nvme\d+|pd\d+|csmi\d+,\d+|tw[ae]\d+|sg\d+)|[A-Z]:)$", re.I)


def _check_smartctl(args):
    i = 0
    while i < len(args):
        a = args[i]
        if a in _SMARTCTL_FLAGS:
            i += 1
        elif a == "-d" and i + 1 < len(args) and _SMARTCTL_DEV_TYPES.match(args[i + 1]):
            i += 2
        elif _SMARTCTL_DEV.match(a):
            i += 1
        else:
            raise UnsafeCommand(f"Tham số smartctl không nằm trong danh sách chỉ đọc: {a}")


def _check_nvidia_smi(args):
    for a in args:
        if not (a.startswith("--query-gpu=") or a.startswith("--format=")):
            raise UnsafeCommand(f"Tham số nvidia-smi không được phép: {a}")


def _check_dxdiag(args, out_dir):
    # dxdiag /whql:off /t <file trong thư mục tạm của tool>
    if len(args) != 3 or args[0].lower() != "/whql:off" or args[1].lower() != "/t":
        raise UnsafeCommand("dxdiag chỉ được chạy dạng: /whql:off /t <file tạm>")
    target = os.path.abspath(args[2])
    if not out_dir or os.path.dirname(target) != os.path.abspath(out_dir):
        raise UnsafeCommand("dxdiag chỉ được ghi báo cáo vào thư mục tạm riêng của tool")


def _check_powershell(args):
    if args[:3] != ["-NoProfile", "-NonInteractive", "-EncodedCommand"] or len(args) != 4:
        raise UnsafeCommand("PowerShell chỉ được gọi qua run_ps_json (đã lọc script)")


def check_exec(argv, dxdiag_tmp_dir=None):
    exe = os.path.basename(argv[0]).lower()
    if exe.endswith(".exe"):
        exe = exe[:-4]
    args = list(argv[1:])
    if exe == "smartctl":
        _check_smartctl(args)
    elif exe == "nvidia-smi":
        _check_nvidia_smi(args)
    elif exe == "dxdiag":
        _check_dxdiag(args, dxdiag_tmp_dir)
    elif exe == "powershell":
        _check_powershell(args)
    else:
        raise UnsafeCommand(f"Chương trình ngoài không nằm trong danh sách cho phép: {exe}")
    return True
