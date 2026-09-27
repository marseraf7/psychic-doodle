# -*- coding: utf-8 -*-
"""Xuất gói QA / Field Test (.zip) đã ẨN dữ liệu nhạy cảm.

- Chỉ ghi file .zip xuống máy; KHÔNG upload, không gửi đi đâu. Người dùng tự quyết định gửi file.
- Ẩn: tên máy, tên người dùng, serial (ổ, mainboard, BIOS, RAM, CPU ID), đường dẫn C:\\Users\\<tên>,
  email, IP, MAC, SID, product key, phần định danh duy nhất trong Device Instance ID.
- Serial/ID được thay bằng mã giả NHẤT QUÁN trong cùng một gói (vd <SERIAL_1>) để vẫn ghép
  được ổ đĩa giữa các nguồn dữ liệu khi phân tích lại (--replay).
"""
import datetime as _dt
import getpass
import json
import os
import re
import secrets
import zipfile

from . import APP_NAME, VERSION

SERIAL_KEYS = {"serialnumber", "serial_number", "processorid", "uuid", "identifyingnumber", "wwn", "eui64",
               "nguid", "partnumber_serial"}
INSTANCE_KEYS = {"pnpdeviceid", "instanceid", "instancename"}
VERSION_HINT = re.compile(r"version|build|firmware|revision|bios", re.I)

_RE_USERS = re.compile(r"(?i)([a-z]:\\(?:users|documents and settings)\\)([^\\/\s\"']+)")
_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_RE_IPV4 = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
_RE_IPV6 = re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){4,7}[0-9a-fA-F]{1,4}\b")
_RE_MAC = re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b")
_RE_SID = re.compile(r"\bS-1-5-21-\d+-\d+-\d+(?:-\d+)?\b")
_RE_PKEY = re.compile(r"\b(?:[A-Z0-9]{5}-){4}[A-Z0-9]{5}\b")
_RE_SUFFIX = re.compile(r"(_\d+)$")


def _norm_serial(s):
    return re.sub(r"[\s\-_.]", "", str(s)).upper()


class Redactor:
    def __init__(self, extra_names=()):
        self.serials = {}
        self.ids = {}
        self.names = {}  # chuỗi nhạy cảm -> nhãn thay thế
        for n in extra_names:
            self.add_name(n, "<NGUOI_DUNG>")

    def add_name(self, value, label):
        v = str(value or "").strip()
        if len(v) >= 3 and v.lower() not in ("user", "admin", "administrator", "default", "public", "system"):
            self.names.setdefault(v, label)

    def learn(self, snapshot):
        """Thu thập tên máy / tên người dùng từ dữ liệu trước khi ẩn."""
        rec = snapshot.get("record", {})
        for cs in (rec.get("ps:cs") or []):
            if isinstance(cs, dict):
                self.add_name(cs.get("Name"), "<TEN_MAY>")
                u = str(cs.get("UserName") or "")
                if "\\" in u:
                    dom, usr = u.split("\\", 1)
                    self.add_name(u, "<NGUOI_DUNG>")
                    self.add_name(usr, "<NGUOI_DUNG>")
                    self.add_name(dom, "<TEN_MAY>")
                else:
                    self.add_name(u, "<NGUOI_DUNG>")
        for o in (rec.get("ps:os") or []):
            if isinstance(o, dict):
                self.add_name(o.get("CSName"), "<TEN_MAY>")

    @staticmethod
    def _name_rx(name):
        # chỉ thay nguyên từ: tên người dùng 'sam' không được làm hỏng chữ 'Samsung'
        return re.compile(r"(?<![A-Za-z0-9])" + re.escape(name) + r"(?![A-Za-z0-9])", re.I)

    def serial(self, v):
        if v in (None, ""):
            return v
        k = _norm_serial(v)
        if not k or set(k) <= {"0"} or k in ("DEFAULTSTRING", "TOBEFILLEDBYOEM", "NONE", "NA"):
            return v
        if k not in self.serials:
            self.serials[k] = f"<SERIAL_{len(self.serials) + 1}>"
        return self.serials[k]

    def instance(self, v):
        s = str(v)
        if "\\" not in s:
            return s
        head, _, last = s.rpartition("\\")
        m = _RE_SUFFIX.search(last)
        suffix = m.group(1) if m else ""
        base = last[:-len(suffix)] if suffix else last
        k = base.lower()
        if k not in self.ids:
            self.ids[k] = f"<ID_{len(self.ids) + 1}>"
        return f"{head}\\{self.ids[k]}{suffix}"

    def text(self, s, key=""):
        # tên dài trước để 'DOMAIN\\user' được thay trước 'user'
        for name in sorted(self.names, key=len, reverse=True):
            if name.lower() in s.lower():
                s = self._name_rx(name).sub(self.names[name], s)
        s = _RE_USERS.sub(lambda m: m.group(1) + "<NGUOI_DUNG>", s)
        s = _RE_EMAIL.sub("<EMAIL>", s)
        s = _RE_MAC.sub("<MAC>", s)
        s = _RE_SID.sub("<SID>", s)
        s = _RE_PKEY.sub("<PRODUCT_KEY>", s)
        if not VERSION_HINT.search(key):
            s = _RE_IPV4.sub("<IP>", s)
            s = _RE_IPV6.sub("<IP>", s)
        return s

    def redact(self, obj, key=""):
        k = key.lower()
        if isinstance(obj, dict):
            return {kk: self.redact(vv, kk) for kk, vv in obj.items()}
        if isinstance(obj, list):
            return [self.redact(x, key) for x in obj]
        if isinstance(obj, str):
            if k in SERIAL_KEYS:
                return self.serial(obj)
            if k in INSTANCE_KEYS:
                return self.text(self.instance(obj), key)
            return self.text(obj, key)
        if k in SERIAL_KEYS and obj is not None and not isinstance(obj, bool):
            return self.serial(str(obj))
        return obj


def _local_identity():
    names = []
    for env in ("COMPUTERNAME", "USERNAME", "USERDOMAIN"):
        if os.environ.get(env):
            names.append(os.environ[env])
    try:
        names.append(getpass.getuser())
    except Exception:
        pass
    return names


def redact_snapshot(snapshot, extra_names=None):
    r = Redactor()
    names = _local_identity() if extra_names is None else list(extra_names)
    for n in names:
        r.add_name(n, "<TEN_MAY>" if n == os.environ.get("COMPUTERNAME") else "<NGUOI_DUNG>")
    r.learn(snapshot)
    red = r.redact(snapshot)
    # kiểm tra lần cuối: không còn chuỗi nhạy cảm nào trong kết quả
    dump = json.dumps(red, ensure_ascii=False)
    leaked = [n for n in r.names if r._name_rx(n).search(dump)]
    if leaked:
        red = json.loads(r.text(json.dumps(red, ensure_ascii=False)))
    return red, r


_README = """{app} v{ver} - GOI QA / FIELD TEST
Tao luc: {created}

Goi nay duoc tao CUC BO tren may cua ban. Tool KHONG tu upload va KHONG gui du lieu di dau.
Ban tu quyet dinh co gui file .zip nay cho ky thuat vien / nguoi phat trien hay khong.

Da an: ten may, ten nguoi dung, serial (o cung, mainboard, BIOS, RAM, CPU ID), duong dan
C:\\Users\\<ten>, email, dia chi IP/MAC, SID, product key, ma dinh danh thiet bi.

Noi dung:
  snapshot.json      - du lieu tho da an (dung de phan tich lai: python -m pc_quickcheck --replay snapshot.json)
  ket_qua.json       - ket qua danh gia
  *.html             - bao cao (da an)
  mo_ta_loi.txt      - mo ta trieu chung do ban nhap (neu co)
"""


def build_zip(snapshot, out_dir, symptom="", analyze=None, render_reports=None):
    """analyze(snapshot)->sections ; render_reports(sections, meta, dir)->paths (để tránh import vòng)."""
    red, _ = redact_snapshot(snapshot)
    os.makedirs(out_dir, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(out_dir, f"pcqc_QA_{stamp}_{secrets.token_hex(2)}.zip")
    sections = analyze(red) if analyze else []
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", _README.format(app=APP_NAME, ver=VERSION, created=red.get("meta", {}).get("created", "")))
        z.writestr("snapshot.json", json.dumps(red, ensure_ascii=False, indent=1))
        if sections:
            z.writestr("ket_qua.json", json.dumps(sections, ensure_ascii=False, indent=1))
        if symptom.strip():
            z.writestr("mo_ta_loi.txt", Redactor(_local_identity()).text(symptom.strip()))
        if sections and render_reports:
            import tempfile
            import shutil
            tmp = tempfile.mkdtemp(prefix="pcqc_qa_")
            try:
                for p in render_reports(sections, red.get("meta", {}), tmp):
                    z.write(p, os.path.basename(p))
            finally:
                shutil.rmtree(tmp, ignore_errors=True)  # chỉ xóa thư mục tạm của tool
    return path
