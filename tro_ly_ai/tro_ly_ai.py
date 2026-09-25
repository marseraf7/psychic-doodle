#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TRỢ LÝ AI LOCAL — quản lý dữ liệu laptop cá nhân, chạy 100% trên máy.

  - Lập chỉ mục file (tên, thư mục, nội dung Word/Excel/PowerPoint/PDF/văn bản/mã nguồn)
    vào SQLite cục bộ. Quét lại chỉ đọc file mới/đã sửa.
  - Tìm kiếm không cần gõ dấu ("hop dong" ra "Hợp đồng") + tìm theo NGHĨA
    (nhúng vector bằng Ollama, tùy chọn).
  - Hỏi đáp trên tài liệu của bạn bằng mô hình ngôn ngữ chạy cục bộ (Ollama), có ghi nguồn.
  - Thống kê dung lượng, tìm file TRÙNG LẶP, SẮP XẾP thư mục Downloads (có hoàn tác).
  - Giao diện web cục bộ (chỉ mở trên 127.0.0.1).

Không gửi dữ liệu ra ngoài: chỉ nói chuyện với Ollama trên chính máy này
(địa chỉ khác localhost bị từ chối). File nhạy cảm (khóa, mật khẩu, .env...) chỉ lưu tên.

Cách chạy:
    python tro_ly_ai.py kiem-tra
    python tro_ly_ai.py quet [thu_muc ...]
    python tro_ly_ai.py tim "hợp đồng thuê nhà"
    python tro_ly_ai.py hoi "Hợp đồng thuê nhà hết hạn khi nào?"
    python tro_ly_ai.py chat
    python tro_ly_ai.py thong-ke | trung-lap | sap-xep [--thuc-hien] | hoan-tac
    python tro_ly_ai.py giao-dien
"""
import argparse, array, glob, hashlib, html, json, math, os, re, sqlite3, stat, sys, threading, time
import unicodedata, urllib.error, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime

THU_MUC_CHUONG_TRINH = os.path.dirname(os.path.abspath(__file__))
THU_MUC_DU_LIEU_MAC_DINH = os.environ.get("TRO_LY_AI_DU_LIEU") or os.path.join(THU_MUC_CHUONG_TRINH, "du_lieu")

CAU_HINH_MAC_DINH = {
    # Rỗng -> Desktop, Documents, Downloads (kể cả bản trong OneDrive)
    "thu_muc_quet": [],
    "bo_qua_thu_muc": [
        "AppData", "Windows", "Program Files", "Program Files (x86)", "ProgramData",
        "$Recycle.Bin", "System Volume Information", "node_modules", "__pycache__",
        "venv", "env", "site-packages", "Library", "My Music", "My Pictures", "My Videos",
    ],
    "ollama_url": "http://127.0.0.1:11434",
    "mo_hinh_chat": "qwen2.5:7b",     # nói tiếng Việt tốt; máy yếu dùng qwen2.5:3b
    "mo_hinh_nhung": "bge-m3",        # nhúng đa ngôn ngữ, hiểu tiếng Việt
    "dung_ngu_nghia": True,           # False -> chỉ tìm theo từ khóa
    "kich_thuoc_toi_da_mb": 50,       # file lớn hơn: chỉ lưu tên, không đọc nội dung
    "so_doan_ngu_canh": 6,            # số đoạn trích đưa cho AI khi hỏi đáp
    # Tìm theo nghĩa: bỏ kết quả có độ giống (cosine) thấp hơn ngưỡng này, để từ khóa không có
    # trong file nào thì báo "không thấy" thay vì trả về file "gần nhất" chẳng liên quan
    "nguong_ngu_nghia": 0.45,
}

LOAI_FILE = {
    "Tài liệu": ".doc .docx .odt .rtf .txt .md",
    "Bảng tính": ".xls .xlsx .xlsm .ods .csv",
    "Trình chiếu": ".ppt .pptx .odp",
    "PDF": ".pdf",
    "Ảnh": ".jpg .jpeg .png .gif .bmp .webp .heic .tif .tiff .svg .raw",
    "Video": ".mp4 .mkv .avi .mov .wmv .flv .webm .m4v",
    "Âm thanh": ".mp3 .wav .flac .aac .m4a .ogg .wma",
    "File nén": ".zip .rar .7z .tar .gz .bz2 .xz",
    "Bộ cài": ".exe .msi .dmg .pkg .deb .apk .iso",
    "Mã nguồn": ".py .js .ts .java .c .cpp .h .cs .go .rs .php .rb .html .css .json .xml "
                ".yml .yaml .sql .sh .bat .ps1 .ipynb",
}
_EXT_LOAI = {e: loai for loai, s in LOAI_FILE.items() for e in s.split()}

DUOI_VAN_BAN = set(".txt .md .csv .tsv .log .ini .cfg .conf .toml .rst .tex .srt .vtt".split()) | {
    e for e in LOAI_FILE["Mã nguồn"].split() if e != ".ipynb"}

# Chỉ lưu tên, không bao giờ đọc nội dung
_DUOI_NHAY_CAM = set(".pem .key .p12 .pfx .kdbx .kdb .keychain .ovpn .ppk .jks .gpg .asc".split())
_TEN_NHAY_CAM = re.compile(
    r"^(id_(rsa|dsa|ecdsa|ed25519)|\.env(\..*)?|\.netrc|\.pgpass|credentials|\.htpasswd)$"
    r"|pass(word|wd)?|mat[ _-]?khau|matkhau|secret|token|b[ií] m[aậ]t", re.I)

_FILE_RAC = {"desktop.ini", "thumbs.db", ".ds_store"}
_DUOI_DANG_TAI = {".crdownload", ".part", ".tmp", ".partial", ".download"}

DAI_DOAN, CHONG_DOAN, TOI_DA_DOAN_MOI_FILE = 1200, 200, 2000
TOI_DA_KY_TU = 3_000_000


def phan_loai(ext):
    return _EXT_LOAI.get(ext.lower(), "Khác")


def dung_luong(n):
    n = float(n or 0)
    for dv in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or dv == "TB":
            return f"{n:.0f} {dv}" if dv == "B" else f"{n:.1f} {dv}"
        n /= 1024


def bo_dau(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")


def ngay(ts):
    return datetime.fromtimestamp(ts).strftime("%d/%m/%Y") if ts else ""


# =====================================================================
# Cấu hình
# =====================================================================
_DA_CANH_BAO = set()


def _canh_bao(thong_bao):
    # Web tạo Kho cho mỗi yêu cầu -> chỉ in mỗi cảnh báo một lần
    if thong_bao not in _DA_CANH_BAO:
        _DA_CANH_BAO.add(thong_bao)
        print(f"[CẢNH BÁO] {thong_bao}")


def _kiem_tra_cau_hinh(ch):
    """Sửa giá trị sai kiểu trong cau_hinh.json, tránh hỏng ngầm (vd chuỗi bị hiểu thành từng ký tự)."""
    for k, mac_dinh in CAU_HINH_MAC_DINH.items():
        v = ch.get(k)
        if isinstance(mac_dinh, list):
            if isinstance(v, str):
                ch[k] = [v]
                _canh_bao(f'cau_hinh.json: "{k}" phải là danh sách, vd ["{v}"] -> tạm hiểu là ["{v}"].')
            elif not (isinstance(v, list) and all(isinstance(x, str) for x in v)):
                ch[k] = list(mac_dinh)
                _canh_bao(f'cau_hinh.json: "{k}" phải là danh sách đường dẫn ["..."] -> dùng mặc định.')
        elif isinstance(mac_dinh, bool):
            if not isinstance(v, bool):
                ch[k] = mac_dinh
                _canh_bao(f'cau_hinh.json: "{k}" phải là true hoặc false -> dùng mặc định {json.dumps(mac_dinh)}.')
        elif isinstance(mac_dinh, (int, float)):
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v <= 0 or (k == "nguong_ngu_nghia" and v > 1):
                ch[k] = mac_dinh
                _canh_bao(f'cau_hinh.json: "{k}" phải là số hợp lệ -> dùng mặc định {mac_dinh}.')
        elif not isinstance(v, str) or not v.strip():
            ch[k] = mac_dinh
            _canh_bao(f'cau_hinh.json: "{k}" phải là chuỗi chữ -> dùng mặc định "{mac_dinh}".')
    return ch


def doc_cau_hinh(thu_muc):
    duong_dan = os.path.join(thu_muc, "cau_hinh.json")
    ch = dict(CAU_HINH_MAC_DINH)
    if os.path.exists(duong_dan):
        try:
            with open(duong_dan, encoding="utf-8") as f:
                du_lieu = json.load(f)
            if not isinstance(du_lieu, dict):
                raise ValueError("phải là một đối tượng {...}")
            ch.update(du_lieu)
        except (OSError, ValueError) as e:
            _canh_bao(f"cau_hinh.json lỗi ({e}) -> dùng cấu hình mặc định.")
        _kiem_tra_cau_hinh(ch)
    else:
        os.makedirs(thu_muc, exist_ok=True)
        with open(duong_dan, "w", encoding="utf-8") as f:
            json.dump(ch, f, ensure_ascii=False, indent=2)
    return ch


def thu_muc_mac_dinh():
    home = os.path.expanduser("~")
    ds = []
    for goc in (home, os.path.join(home, "OneDrive")):
        for ten in ("Desktop", "Documents", "Downloads"):
            p = os.path.join(goc, ten)
            if os.path.isdir(p) and p not in ds:
                ds.append(p)
    return ds or [home]


# =====================================================================
# Kho dữ liệu (SQLite + FTS5)
# =====================================================================
class Kho:
    def __init__(self, thu_muc=THU_MUC_DU_LIEU_MAC_DINH):
        self.thu_muc = os.path.abspath(thu_muc)
        os.makedirs(self.thu_muc, exist_ok=True)
        self.cau_hinh = doc_cau_hinh(self.thu_muc)
        self.duong_dan_db = os.path.join(self.thu_muc, "chi_muc.sqlite3")
        self.conn = sqlite3.connect(self.duong_dan_db, timeout=30)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        try:
            self.conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS temp._thu_fts5 USING fts5(x)")
        except sqlite3.OperationalError:
            raise RuntimeError(
                f"Python này thiếu SQLite FTS5 (SQLite {sqlite3.sqlite_version}) nên không tìm kiếm được. "
                "Cài Python bản chính thức từ https://www.python.org/downloads/ (không dùng bản Microsoft Store "
                "hoặc bản rút gọn), rồi chạy lại.")
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS files(
                id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, name TEXT, ext TEXT, loai TEXT,
                size INTEGER, mtime REAL, sha1 TEXT, has_text INTEGER DEFAULT 0, loi TEXT,
                last_seen INTEGER, tren_may_chu INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS chunks(
                id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, seq INTEGER, text TEXT, emb BLOB);
            CREATE INDEX IF NOT EXISTS ix_chunks_file ON chunks(file_id);
            CREATE INDEX IF NOT EXISTS ix_files_size ON files(size);
            CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
                name, thu_muc, text, tokenize='unicode61 remove_diacritics 2');
            CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
        """)
        if "tren_may_chu" not in {r[1] for r in self.conn.execute("PRAGMA table_info(files)")}:
            self.conn.execute("ALTER TABLE files ADD COLUMN tren_may_chu INTEGER DEFAULT 0")

    def meta(self, k, v=None):
        if v is None:
            r = self.conn.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
            return r[0] if r else None
        self.conn.execute("INSERT OR REPLACE INTO meta(k, v) VALUES(?, ?)", (k, str(v)))

    def xoa_file(self, file_id):
        self.conn.execute("DELETE FROM fts WHERE rowid IN (SELECT id FROM chunks WHERE file_id=?)", (file_id,))
        self.conn.execute("DELETE FROM chunks WHERE file_id=?", (file_id,))
        self.conn.execute("DELETE FROM files WHERE id=?", (file_id,))

    def dong(self):
        self.conn.commit()
        self.conn.close()


# =====================================================================
# Đọc nội dung file
# =====================================================================
def _giai_ma(raw):
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        if e.start >= len(raw) - 3:          # chỉ đứt ký tự cuối do cắt giới hạn
            return raw.decode("utf-8-sig", errors="ignore")
        return raw.decode("cp1258", errors="replace")   # bảng mã Windows tiếng Việt cũ


def doc_van_ban(path):
    with open(path, "rb") as f:
        return _giai_ma(f.read(TOI_DA_KY_TU))


def _xml_sang_chu(xml_bytes, the_doan):
    s = xml_bytes.decode("utf-8", errors="ignore")
    s = re.sub(r"<(w:tab|a:tab)\b[^>]*/>", "\t", s)
    s = re.sub(r"<(w:br|a:br|w:cr)\b[^>]*/>", "\n", s)
    s = re.sub(rf"</{the_doan}>", "\n", s)
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def doc_docx(path):
    with zipfile.ZipFile(path) as z:
        ten = [n for n in z.namelist()
               if n == "word/document.xml" or re.match(r"word/(header|footer|footnotes|endnotes)\d*\.xml$", n)]
        ten.sort(key=lambda n: n != "word/document.xml")
        return "\n".join(_xml_sang_chu(z.read(n), "w:p") for n in ten)


def doc_pptx(path):
    with zipfile.ZipFile(path) as z:
        slides = [n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)]
        slides.sort(key=lambda n: int(re.search(r"(\d+)\.xml$", n).group(1)))
        return "\n\n".join(f"[Trang {i}]\n" + _xml_sang_chu(z.read(n), "a:p")
                           for i, n in enumerate(slides, 1))


_NS_X = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def doc_xlsx(path):
    out, tong = [], 0
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(_NS_X + "si"):
                shared.append("".join(t.text or "" for t in si.iter(_NS_X + "t")))
        sheets = []
        try:   # thứ tự + tên sheet thật qua workbook.xml.rels
            rels = {r.get("Id"): r.get("Target") for r in
                    ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
            for sh in ET.fromstring(z.read("xl/workbook.xml")).iter(_NS_X + "sheet"):
                t = rels.get(sh.get(_NS_R + "id"), "").lstrip("/")
                t = t if t.startswith("xl/") else "xl/" + t
                if t in names:
                    sheets.append((sh.get("name"), t))
        except (KeyError, ET.ParseError):
            pass
        if not sheets:
            sheets = [(n.rsplit("/", 1)[1][:-4], n) for n in sorted(names)
                      if re.match(r"xl/worksheets/sheet\d+\.xml$", n)]
        for ten, n in sheets:
            out.append(f"[Sheet {ten}]")
            with z.open(n) as f:
                for _, el in ET.iterparse(f):
                    if el.tag != _NS_X + "row":
                        continue
                    vals = []
                    for c in el.iter(_NS_X + "c"):
                        t, v = c.get("t"), c.find(_NS_X + "v")
                        if t == "s" and v is not None and v.text and v.text.isdigit():
                            i = int(v.text)
                            val = shared[i] if i < len(shared) else ""
                        elif t == "inlineStr":
                            val = "".join(x.text or "" for x in c.iter(_NS_X + "t"))
                        else:
                            val = v.text if v is not None and v.text else ""
                        if val.strip():
                            vals.append(val.strip())
                    el.clear()
                    if vals:
                        dong = " | ".join(vals)
                        out.append(dong)
                        tong += len(dong)
                        if tong > TOI_DA_KY_TU:
                            return "\n".join(out)
    return "\n".join(out)


def doc_pdf(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError("chưa cài pypdf (pip install pypdf) -> PDF chỉ được lưu tên")
    except BaseException as e:   # thư viện phụ thuộc hỏng có thể ném lỗi lạ (panic) -> không làm sập lượt quét
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise
        raise RuntimeError(f"không nạp được pypdf: {type(e).__name__}")
    r = PdfReader(path)
    if r.is_encrypted:
        try:
            r.decrypt("")
        except Exception:
            raise RuntimeError("PDF có mật khẩu")
    out, tong = [], 0
    for i, p in enumerate(r.pages[:1000], 1):
        t = (p.extract_text() or "").strip()
        if t:
            out.append(f"[Trang {i}]\n{t}")
            tong += len(t)
            if tong > TOI_DA_KY_TU:
                break
    return "\n\n".join(out)


def doc_ipynb(path):
    with open(path, encoding="utf-8") as f:
        nb = json.load(f)
    return "\n\n".join("".join(c.get("source", [])) for c in nb.get("cells", []))


def la_nhay_cam(ten):
    ext = os.path.splitext(ten)[1].lower()
    return ext in _DUOI_NHAY_CAM or bool(_TEN_NHAY_CAM.search(bo_dau(ten)))


def trich_noi_dung(path, ext):
    """Trả về chuỗi nội dung (chuẩn NFC), hoặc None nếu loại file không đọc được nội dung."""
    doc = {".docx": doc_docx, ".xlsx": doc_xlsx, ".xlsm": doc_xlsx, ".pptx": doc_pptx,
           ".pdf": doc_pdf, ".ipynb": doc_ipynb}.get(ext.lower())
    if doc is None and ext.lower() in DUOI_VAN_BAN:
        doc = doc_van_ban
    if doc is None:
        return None
    # cp1258/macOS lưu dấu tổ hợp (NFD) -> đưa về dạng dựng sẵn để hiển thị & so khớp đúng
    return unicodedata.normalize("NFC", doc(path))


def chia_doan(text, dai=DAI_DOAN, chong=CHONG_DOAN):
    text = re.sub(r"[ \t\r\f\v]+", " ", text or "")
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()
    if not text:
        return []
    out, i, n = [], 0, len(text)
    while i < n and len(out) < TOI_DA_DOAN_MOI_FILE:
        end = min(i + dai, n)
        if end < n:   # cắt ở cuối đoạn/câu cho dễ đọc
            cut = max(text.rfind("\n", i + dai // 2, end), text.rfind(". ", i + dai // 2, end))
            if cut > i:
                end = cut + 1
        doan = text[i:end].strip()
        if doan:
            out.append(doan)
        if end >= n:
            break
        i = max(end - chong, i + 1)
    return out


# =====================================================================
# Ollama (chỉ localhost)
# =====================================================================
class LoiOllama(RuntimeError):
    pass


class Ollama:
    def __init__(self, url, timeout=600):
        host = urllib.parse.urlparse(url).hostname
        if host not in ("127.0.0.1", "localhost", "::1"):
            raise LoiOllama(f"ollama_url phải là máy này (127.0.0.1), không phải '{host}': "
                            "trợ lý không gửi dữ liệu ra ngoài.")
        self.url = url.rstrip("/")
        self.timeout = timeout
        # Bỏ qua proxy hệ thống: dữ liệu không rời khỏi máy
        self._mo = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def _goi(self, duong, payload=None, timeout=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.url + duong, data=data,
                                     headers={"Content-Type": "application/json"})
        try:
            return self._mo.open(req, timeout=timeout or self.timeout)
        except urllib.error.HTTPError as e:
            chi_tiet = e.read().decode("utf-8", "ignore")[:300]
            raise LoiOllama(f"Ollama báo lỗi {e.code}: {chi_tiet}")
        except (urllib.error.URLError, OSError) as e:
            raise LoiOllama(f"Không kết nối được Ollama tại {self.url} ({e}). "
                            "Cài từ https://ollama.com rồi mở Ollama.")

    def danh_sach_mo_hinh(self):
        with self._goi("/api/tags", timeout=5) as r:
            return [m.get("name", "") for m in json.load(r).get("models", [])]

    def co_mo_hinh(self, ten):
        try:
            ds = self.danh_sach_mo_hinh()
        except LoiOllama:
            return False
        return any(m == ten or m == ten + ":latest" for m in ds)

    def nhung(self, model, texts):
        with self._goi("/api/embed", {"model": model, "input": texts, "truncate": True}) as r:
            return json.load(r).get("embeddings", [])

    def chat(self, model, messages, moi_token=None):
        payload = {"model": model, "messages": messages, "stream": True,
                   "options": {"num_ctx": 8192, "temperature": 0.2}}
        out = []
        with self._goi("/api/chat", payload) as r:
            for dong in r:
                if not dong.strip():
                    continue
                d = json.loads(dong)
                if d.get("error"):
                    raise LoiOllama(d["error"])
                t = d.get("message", {}).get("content", "")
                if t:
                    out.append(t)
                    if moi_token:
                        moi_token(t)
                if d.get("done"):
                    break
        return "".join(out)


def _chuan_hoa(vec):
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return array.array("f", (x / n for x in vec)).tobytes()


# =====================================================================
# QUÉT & LẬP CHỈ MỤC
# =====================================================================
def _bo_qua_thu_muc(ten, duong_dan, bo_qua, rieng):
    if ten.startswith((".", "$", "~")) or ten.lower() in bo_qua:
        return True
    if getattr(os.path, "isjunction", None) and os.path.isjunction(duong_dan):
        return True
    return os.path.realpath(duong_dan) == rieng


# Windows: file OneDrive/iCloud "chỉ có trên mạng". Mở ra đọc là Windows tự TẢI VỀ cả file.
_THUOC_TINH_TREN_MAY_CHU = 0x00400000 | 0x00040000 | 0x00001000   # RECALL_ON_DATA_ACCESS | RECALL_ON_OPEN | OFFLINE


def _lstat(p):
    return os.lstat(p)


def la_file_tren_may_chu(st):
    return bool(getattr(st, "st_file_attributes", 0) & _THUOC_TINH_TREN_MAY_CHU)


def _bo_qua_file(ten):
    t = ten.lower()
    return t in _FILE_RAC or t.startswith("~$") or t.startswith(".~lock")


def _luu_file(kho, path, st, lan_quet, file_id, gioi_han):
    ten = os.path.basename(path)
    ext = os.path.splitext(ten)[1].lower()
    text, loi = None, None
    tren_may_chu = la_file_tren_may_chu(st)
    if la_nhay_cam(ten):
        loi = "file nhạy cảm: chỉ lưu tên"
    elif tren_may_chu:
        loi = "chỉ có trên OneDrive/đám mây: chỉ lưu tên (tải về máy rồi quét lại để đọc nội dung)"
    elif st.st_size > gioi_han:
        loi = f"lớn hơn {dung_luong(gioi_han)}: chỉ lưu tên"
    else:
        try:
            text = trich_noi_dung(path, ext)
        except Exception as e:   # file hỏng/đang mở/định dạng lạ: vẫn lưu tên
            loi = f"{type(e).__name__}: {e}"[:300]
    doan = chia_doan(text) if text else []
    c = kho.conn
    if file_id is not None:
        c.execute("DELETE FROM fts WHERE rowid IN (SELECT id FROM chunks WHERE file_id=?)", (file_id,))
        c.execute("DELETE FROM chunks WHERE file_id=?", (file_id,))
        c.execute("""UPDATE files SET name=?, ext=?, loai=?, size=?, mtime=?, sha1=NULL, has_text=?,
                     loi=?, last_seen=?, tren_may_chu=? WHERE id=?""",
                  (ten, ext, phan_loai(ext), st.st_size, st.st_mtime, int(bool(doan)), loi, lan_quet,
                   int(tren_may_chu), file_id))
    else:
        file_id = c.execute("""INSERT INTO files(path, name, ext, loai, size, mtime, has_text, loi, last_seen,
                                                 tren_may_chu) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                            (path, ten, ext, phan_loai(ext), st.st_size, st.st_mtime,
                             int(bool(doan)), loi, lan_quet, int(tren_may_chu))).lastrowid
    thu_muc = os.path.basename(os.path.dirname(path))
    for seq, d in enumerate(doan or [""]):   # file không có chữ vẫn tìm được theo tên
        cid = c.execute("INSERT INTO chunks(file_id, seq, text) VALUES(?,?,?)", (file_id, seq, d)).lastrowid
        c.execute("INSERT INTO fts(rowid, name, thu_muc, text) VALUES(?,?,?,?)", (cid, ten, thu_muc, d))
    return file_id, bool(doan), loi


def _gop_thu_muc_goc(roots):
    roots = sorted({os.path.abspath(os.path.expanduser(r)) for r in roots}, key=len)
    out = []
    for r in roots:
        if not any(r == o or r.startswith(o.rstrip(os.sep) + os.sep) for o in out):
            out.append(r)
    return out


def quet(kho, thu_muc=None, nhung=True, in_ra=print):
    ch = kho.cau_hinh
    roots = _gop_thu_muc_goc(thu_muc or ch["thu_muc_quet"] or thu_muc_mac_dinh())
    for r in [r for r in roots if not os.path.isdir(r)]:
        in_ra(f"[BỎ QUA] Không có thư mục: {r}")
    roots = [r for r in roots if os.path.isdir(r)]
    if not roots:
        in_ra("[LỖI] Không có thư mục nào để quét.")
        return {}
    bo_qua = {s.lower() for s in ch["bo_qua_thu_muc"]}
    rieng = os.path.realpath(kho.thu_muc)
    gioi_han = int(ch["kich_thuoc_toi_da_mb"] * 1024 * 1024)
    # Mã lượt quét luôn tăng (2 lượt trong cùng 1ms không được trùng mã)
    lan_quet = max(int(time.time() * 1000), int(kho.meta("ma_lan_quet") or 0) + 1)
    kho.meta("ma_lan_quet", lan_quet)
    cu = {p: (i, s, m, bool(mc)) for i, p, s, m, mc in
          kho.conn.execute("SELECT id, path, size, mtime, tren_may_chu FROM files")}
    tk = dict(duyet=0, moi=0, cap_nhat=0, co_noi_dung=0, loi_doc=0, xoa=0, tren_may_chu=0)
    khong_doi, bat_dau, thay_doi = [], time.time(), 0

    for root in roots:
        in_ra(f"Đang quét: {root}")
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames
                           if not _bo_qua_thu_muc(d, os.path.join(dirpath, d), bo_qua, rieng)]
            for ten in filenames:
                if _bo_qua_file(ten):
                    continue
                p = os.path.join(dirpath, ten)
                try:
                    st = _lstat(p)
                except OSError:
                    continue
                if not stat.S_ISREG(st.st_mode):   # bỏ symlink, thiết bị...
                    continue
                tk["duyet"] += 1
                if tk["duyet"] % 500 == 0:
                    in_ra(f"  ... đã duyệt {tk['duyet']} file ({time.time() - bat_dau:.0f}s)")
                tren_may_chu = la_file_tren_may_chu(st)
                tk["tren_may_chu"] += tren_may_chu
                old = cu.get(p)
                # Tải file OneDrive về không đổi ngày sửa/kích thước -> phải so cả trạng thái này
                if old and old[1] == st.st_size and old[2] == st.st_mtime and old[3] == tren_may_chu:
                    khong_doi.append((lan_quet, old[0]))
                    continue
                fid, co_chu, loi = _luu_file(kho, p, st, lan_quet, old[0] if old else None, gioi_han)
                cu[p] = (fid, st.st_size, st.st_mtime, tren_may_chu)
                tk["cap_nhat" if old else "moi"] += 1
                tk["co_noi_dung"] += co_chu
                if loi and not loi.startswith(("file nhạy cảm", "lớn hơn", "chỉ có trên")):
                    tk["loi_doc"] += 1
                thay_doi += 1
                if thay_doi % 200 == 0:
                    kho.conn.commit()

    kho.conn.executemany("UPDATE files SET last_seen=? WHERE id=?", khong_doi)
    for root in roots:   # file đã bị xóa/di chuyển khỏi máy
        pref = root.rstrip(os.sep) + os.sep
        for (fid,) in kho.conn.execute(
                "SELECT id FROM files WHERE substr(path, 1, ?)=? AND last_seen<>?",
                (len(pref), pref, lan_quet)).fetchall():
            kho.xoa_file(fid)
            tk["xoa"] += 1
    if tk["xoa"]:
        kho.meta("phien_nhung", time.time())
    kho.meta("lan_quet_cuoi", time.time())
    kho.conn.commit()
    in_ra(f"Xong phần quét sau {time.time() - bat_dau:.0f}s: duyệt {tk['duyet']} file | mới {tk['moi']} | "
          f"cập nhật {tk['cap_nhat']} | đọc được nội dung {tk['co_noi_dung']} | "
          f"lỗi đọc {tk['loi_doc']} | xóa khỏi chỉ mục {tk['xoa']}")
    if tk["tren_may_chu"]:
        in_ra(f"  {tk['tren_may_chu']} file chỉ có trên OneDrive/đám mây: chỉ lưu tên, KHÔNG tải về. "
              "Muốn đọc nội dung: chuột phải thư mục > 'Always keep on this device', rồi quét lại.")
    if nhung and ch["dung_ngu_nghia"]:
        tk["nhung"] = tao_nhung(kho, in_ra)
    return tk


def tao_nhung(kho, in_ra=print, lo=32):
    """Tạo vector nhúng cho các đoạn chưa có. Ngắt giữa chừng thì lần sau làm tiếp."""
    ch, c = kho.cau_hinh, kho.conn
    model = ch["mo_hinh_nhung"]
    if kho.meta("mo_hinh_nhung") != model:
        c.execute("UPDATE chunks SET emb=NULL")
        kho.meta("mo_hinh_nhung", model)
        c.commit()
    con_lai = c.execute("SELECT count(*) FROM chunks WHERE emb IS NULL AND text<>''").fetchone()[0]
    if not con_lai:
        return 0
    try:
        ol = Ollama(ch["ollama_url"])
    except LoiOllama as e:
        in_ra(f"[BỎ QUA TÌM THEO NGHĨA] {e}")
        return 0
    if not ol.co_mo_hinh(model):
        in_ra(f"[BỎ QUA TÌM THEO NGHĨA] Chưa có mô hình nhúng '{model}' (hoặc Ollama chưa chạy).\n"
              f"  Chạy: ollama pull {model}   rồi quét lại. Tìm theo từ khóa vẫn dùng bình thường.")
        return 0
    in_ra(f"Tạo vector ngữ nghĩa cho {con_lai} đoạn bằng '{model}' (có thể lâu lần đầu; Ctrl+C để dừng, "
          "lần sau làm tiếp)...")
    xong, bat_dau = 0, time.time()
    try:
        while True:
            rows = c.execute("""SELECT c.id, f.name, c.text FROM chunks c JOIN files f ON f.id=c.file_id
                                WHERE c.emb IS NULL AND c.text<>'' ORDER BY c.id LIMIT ?""", (lo,)).fetchall()
            if not rows:
                break
            vecs = ol.nhung(model, [f"{ten}\n{text[:2000]}" for _, ten, text in rows])
            c.executemany("UPDATE chunks SET emb=? WHERE id=?",
                          [(_chuan_hoa(vecs[i]) if i < len(vecs) and vecs[i] else b"", r[0])
                           for i, r in enumerate(rows)])
            kho.meta("phien_nhung", time.time())
            c.commit()
            xong += len(rows)
            if xong % (lo * 10) == 0 or xong == con_lai:
                in_ra(f"  ... {xong}/{con_lai} đoạn ({time.time() - bat_dau:.0f}s)")
    except LoiOllama as e:
        in_ra(f"[DỪNG TẠO VECTOR] {e}")
    except KeyboardInterrupt:
        in_ra("\nĐã dừng tạo vector. Lần quét sau sẽ làm tiếp.")
    c.commit()
    cb = canh_bao_vector(kho)
    if cb:
        in_ra(f"[CẢNH BÁO] {cb}")
    return xong


# =====================================================================
# TÌM KIẾM (từ khóa + ngữ nghĩa, trộn bằng Reciprocal Rank Fusion)
# =====================================================================
_TU_DUNG = set(bo_dau(w) for w in (
    "là gì của và có không cho tôi mình nào ở đâu trong các những được một với về này đó thì "
    "bao nhiêu hãy giúp tìm file tệp tài liệu ai khi nào sao như thế nào ra mấy hay hoặc đã sẽ "
    "đang bị vậy nhé ạ à ơi xem cần muốn biết").split())

_CACHE_VECTOR = {}
_KHOA_CACHE = threading.Lock()


def _cau_fts(cau, che_do="AND"):
    toks = [t for t in re.findall(r"\w+", cau) if t.strip("_")]
    if che_do == "OR":
        loc = [t for t in toks if bo_dau(t) not in _TU_DUNG]
        toks = loc or toks
    return f" {che_do} ".join(f'"{t}"*' if len(t) >= 4 else f'"{t}"' for t in toks)


def _loc_sql(loai=None, duoi=None, thu_muc=None):
    dk, ts = [], []
    if loai:
        dk.append("f.loai=?"); ts.append(loai)
    if duoi:
        dk.append("f.ext=?"); ts.append(("." + duoi.lstrip(".")).lower())
    if thu_muc:
        pref = os.path.abspath(thu_muc).rstrip(os.sep) + os.sep
        dk.append("substr(f.path, 1, ?)=?"); ts += [len(pref), pref]
    return "".join(" AND " + d for d in dk), ts


def _tim_tu_khoa(kho, cau, gioi_han, che_do, loc):
    q = _cau_fts(cau, che_do)
    if not q:
        return []
    dk, ts = loc
    try:
        return kho.conn.execute(
            f"""SELECT fts.rowid, bm25(fts, 4.0, 1.5, 1.0) AS s FROM fts
                JOIN chunks c ON c.id=fts.rowid JOIN files f ON f.id=c.file_id
                WHERE fts MATCH ? {dk} ORDER BY s LIMIT ?""", [q, *ts, gioi_han]).fetchall()
    except sqlite3.OperationalError:
        return []


# Không có numpy, tính tay quá số đoạn này thì mỗi lần tìm mất cả phút -> tắt tìm theo nghĩa
GIOI_HAN_KHONG_NUMPY = 20000
_KHOI_TINH = 16384   # tính điểm theo khối: chỉ đổi float16 -> float32 từng khối, không nhân đôi RAM


def _co_numpy():
    try:
        import numpy
        return numpy
    except ImportError:
        return None


def so_doan_co_vector(kho):
    return kho.conn.execute("SELECT count(*) FROM chunks WHERE length(emb)>0").fetchone()[0]


def canh_bao_vector(kho):
    """Chuỗi cảnh báo về RAM/tốc độ tìm theo nghĩa, hoặc None nếu ổn."""
    n = so_doan_co_vector(kho)
    if not n:
        return None
    if _co_numpy() is None:
        if n > GIOI_HAN_KHONG_NUMPY:
            return (f"Có {n} đoạn có vector nhưng chưa cài numpy -> đã TẮT tìm theo nghĩa (quá chậm). "
                    "Chạy: pip install numpy")
        return None
    row = kho.conn.execute("SELECT length(emb) FROM chunks WHERE length(emb)>0 LIMIT 1").fetchone()
    ram = n * (row[0] // 4) * 2   # giữ trong RAM dạng float16
    if ram > 500 * 1024 * 1024:
        return (f"Tìm theo nghĩa dùng khoảng {dung_luong(ram)} RAM cho {n} đoạn. Máy ít RAM: đặt "
                '"dung_ngu_nghia": false trong cau_hinh.json hoặc bớt thư mục quét.')
    return None


def _ma_tran_vector(kho):
    n = so_doan_co_vector(kho)
    khoa = (kho.duong_dan_db, kho.meta("phien_nhung"), n)
    with _KHOA_CACHE:
        cache = _CACHE_VECTOR.get(kho.duong_dan_db)
        if cache and cache[0] == khoa:
            return cache[1], cache[2]
    np = _co_numpy()
    ids, mat = [], None
    cur = kho.conn.execute("SELECT id, emb FROM chunks WHERE length(emb)>0")
    if np is not None:
        # Điền thẳng vào ma trận float16 (nửa RAM so với float32, không giữ bản sao blob)
        dim = None
        for cid, emb in cur:
            if dim is None:
                dim = len(emb) // 4
                mat = np.empty((n, dim), dtype=np.float16)
            if len(emb) // 4 != dim or len(ids) >= n:
                continue
            mat[len(ids)] = np.frombuffer(emb, dtype=np.float32)
            ids.append(cid)
        if mat is not None:
            mat = mat[:len(ids)]
    elif n <= GIOI_HAN_KHONG_NUMPY:
        mat = []
        for cid, emb in cur:
            ids.append(cid)
            mat.append(array.array("f", emb))
    with _KHOA_CACHE:
        _CACHE_VECTOR[kho.duong_dan_db] = (khoa, ids, mat)
    return ids, mat


def _tim_ngu_nghia(kho, cau, gioi_han):
    ch = kho.cau_hinh
    if not ch["dung_ngu_nghia"] or kho.meta("mo_hinh_nhung") != ch["mo_hinh_nhung"]:
        return []
    ids, mat = _ma_tran_vector(kho)
    if not ids or mat is None:
        return []
    try:
        q = Ollama(ch["ollama_url"], timeout=60).nhung(ch["mo_hinh_nhung"], [cau])
    except LoiOllama:
        return []   # Ollama tắt -> vẫn tìm theo từ khóa
    if not q or not q[0]:
        return []
    nguong = float(ch["nguong_ngu_nghia"])
    qv = array.array("f")
    qv.frombytes(_chuan_hoa(q[0]))
    if isinstance(mat, list):   # không có numpy: tính tay
        if len(mat[0]) != len(qv):
            return []
        diem = [(sum(a * b for a, b in zip(v, qv)), cid) for cid, v in zip(ids, mat)]
        diem = sorted((x for x in diem if x[0] >= nguong), reverse=True)
        return [(cid, s) for s, cid in diem[:gioi_han]]
    np = _co_numpy()
    qn = np.frombuffer(qv.tobytes(), dtype=np.float32)
    if mat.shape[1] != qn.shape[0]:
        return []
    s = np.empty(mat.shape[0], dtype=np.float32)
    for i in range(0, mat.shape[0], _KHOI_TINH):
        s[i:i + _KHOI_TINH] = mat[i:i + _KHOI_TINH].astype(np.float32) @ qn
    dat = np.nonzero(s >= nguong)[0]
    top = dat[np.argsort(-s[dat])[:gioi_han]]
    return [(ids[i], float(s[i])) for i in top]


def tim_doan(kho, cau, k=8, loai=None, duoi=None, thu_muc=None, moi_file_toi_da=None, ngu_nghia=True):
    """Trả về danh sách đoạn trích phù hợp nhất (dict), đã trộn từ khóa + ngữ nghĩa."""
    loc = _loc_sql(loai, duoi, thu_muc)
    n = max(k * 6, 50)
    tu_khoa = _tim_tu_khoa(kho, cau, n, "AND", loc)
    if len(tu_khoa) < n:
        da_co = {cid for cid, _ in tu_khoa}
        tu_khoa += [r for r in _tim_tu_khoa(kho, cau, n, "OR", loc) if r[0] not in da_co]
    nghia = _tim_ngu_nghia(kho, cau, n * 3) if ngu_nghia else []
    diem = defaultdict(float)
    for hang, (cid, _) in enumerate(tu_khoa):
        diem[cid] += 1.0 / (60 + hang)
    for hang, (cid, _) in enumerate(nghia):
        diem[cid] += 1.0 / (60 + hang)
    thu_tu = sorted(diem, key=diem.get, reverse=True)
    dk, ts = loc
    out, dem_file = [], defaultdict(int)
    for i in range(0, len(thu_tu), 200):
        lo = thu_tu[i:i + 200]
        rows = kho.conn.execute(
            f"""SELECT c.id, c.text, f.id, f.path, f.name, f.loai, f.size, f.mtime FROM chunks c
                JOIN files f ON f.id=c.file_id
                WHERE c.id IN ({','.join('?' * len(lo))}) {dk}""", [*lo, *ts]).fetchall()
        chi_tiet = {r[0]: r for r in rows}
        for cid in lo:
            r = chi_tiet.get(cid)
            if not r:
                continue
            if moi_file_toi_da and dem_file[r[2]] >= moi_file_toi_da:
                continue
            dem_file[r[2]] += 1
            out.append(dict(chunk_id=cid, text=r[1], file_id=r[2], path=r[3], name=r[4], loai=r[5],
                            size=r[6], mtime=r[7], diem=round(diem[cid], 5)))
            if len(out) >= k:
                return out
    return out


def trich_ngan(text, cau, dai=220):
    if not text:
        return ""
    t = re.sub(r"\s+", " ", text)
    t0 = bo_dau(t)   # bo_dau giữ nguyên độ dài chuỗi NFC tiếng Việt -> vị trí khớp
    vt = -1
    for tu in re.findall(r"\w+", cau):
        if bo_dau(tu) in _TU_DUNG:
            continue
        vt = t0.find(bo_dau(tu))
        if vt >= 0:
            break
    bd = max(0, vt - dai // 3) if vt >= 0 else 0
    return ("…" if bd else "") + t[bd:bd + dai] + ("…" if bd + dai < len(t) else "")


def tim_file(kho, cau, k=15, **loc):
    return tim_doan(kho, cau, k=k, moi_file_toi_da=1, **loc)


# =====================================================================
# HỎI ĐÁP (RAG)
# =====================================================================
LOI_DAN_HE_THONG = (
    "Bạn là trợ lý AI chạy hoàn toàn cục bộ trên laptop của người dùng, giúp tra cứu và quản lý "
    "tài liệu cá nhân. Quy tắc:\n"
    "1. Chỉ dựa vào TỔNG QUAN và các ĐOẠN TRÍCH được cung cấp; không bịa thông tin.\n"
    "2. Ghi nguồn bằng số trong ngoặc vuông, ví dụ [1], [2], ngay sau ý lấy từ đoạn đó.\n"
    "3. Nếu đoạn trích không có thông tin cần thiết, nói rõ 'Không tìm thấy trong dữ liệu đã lập chỉ mục' "
    "và gợi ý từ khóa hoặc thư mục nên quét thêm.\n"
    "4. Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng.")


def tong_quan(kho):
    tong = kho.conn.execute("SELECT count(*), total(size), total(has_text) FROM files").fetchone()
    theo_loai = kho.conn.execute(
        "SELECT loai, count(*), total(size) FROM files GROUP BY loai ORDER BY 3 DESC").fetchall()
    return dict(so_file=tong[0], dung_luong=tong[1], co_noi_dung=int(tong[2]),
                theo_loai=[dict(loai=l, so_file=n, dung_luong=s) for l, n, s in theo_loai],
                lan_quet_cuoi=float(kho.meta("lan_quet_cuoi") or 0))


def _khoi_tong_quan(kho):
    tq = tong_quan(kho)
    dong = [f"Đã lập chỉ mục {tq['so_file']} file ({dung_luong(tq['dung_luong'])}), "
            f"{tq['co_noi_dung']} file đọc được nội dung. Lần quét cuối: {ngay(tq['lan_quet_cuoi'])}."]
    dong += [f"- {x['loai']}: {x['so_file']} file, {dung_luong(x['dung_luong'])}" for x in tq["theo_loai"]]
    return "\n".join(dong)


def hoi(kho, cau, lich_su=None, moi_token=None, moi_nguon=None):
    """Trả về (câu trả lời, danh sách nguồn). Ném LoiOllama nếu không gọi được mô hình.
    moi_nguon(nguon) được gọi ngay khi có nguồn, trước khi AI bắt đầu trả lời."""
    ch = kho.cau_hinh
    nguon = tim_doan(kho, cau, k=int(ch["so_doan_ngu_canh"]), moi_file_toi_da=2)
    if moi_nguon:
        moi_nguon(nguon)
    ngu_canh = "\n\n".join(
        f"[{i}] {d['path']} (sửa {ngay(d['mtime'])})\n{d['text'][:DAI_DOAN] or '(chỉ có tên file)'}"
        for i, d in enumerate(nguon, 1)) or "(không có đoạn nào khớp)"
    messages = [{"role": "system", "content": LOI_DAN_HE_THONG}]
    for m in (lich_su or [])[-6:]:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
            messages.append({"role": m["role"], "content": m["content"][:4000]})
    messages.append({"role": "user", "content":
                     f"TỔNG QUAN DỮ LIỆU:\n{_khoi_tong_quan(kho)}\n\nĐOẠN TRÍCH:\n{ngu_canh}\n\nCÂU HỎI: {cau}"})
    tra_loi = Ollama(ch["ollama_url"]).chat(ch["mo_hinh_chat"], messages, moi_token)
    return tra_loi, nguon


# =====================================================================
# QUẢN LÝ: thống kê, trùng lặp, sắp xếp
# =====================================================================
def thong_ke(kho, top=15):
    tq = tong_quan(kho)
    c = kho.conn
    tq["lon_nhat"] = [dict(path=p, size=s, mtime=m) for p, s, m in c.execute(
        "SELECT path, size, mtime FROM files ORDER BY size DESC LIMIT ?", (top,))]
    mot_nam = time.time() - 365 * 86400
    tq["lon_lau_khong_dung"] = [dict(path=p, size=s, mtime=m) for p, s, m in c.execute(
        "SELECT path, size, mtime FROM files WHERE mtime<? AND size>=? ORDER BY size DESC LIMIT ?",
        (mot_nam, 50 * 1024 * 1024, top))]
    theo_thu_muc = defaultdict(lambda: [0, 0])
    for p, s in c.execute("SELECT path, size FROM files"):
        d = os.path.dirname(p)
        theo_thu_muc[d][0] += 1
        theo_thu_muc[d][1] += s or 0
    tq["thu_muc_nang"] = [dict(path=d, so_file=v[0], size=v[1]) for d, v in
                          sorted(theo_thu_muc.items(), key=lambda x: -x[1][1])[:top]]
    return tq


def _bam(path, mot_phan=False):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        if mot_phan:   # 64KB đầu + 64KB cuối: loại nhanh các file khác nhau
            h.update(f.read(65536))
            f.seek(max(0, os.fstat(f.fileno()).st_size - 65536))
            h.update(f.read(65536))
        else:
            for khoi in iter(lambda: f.read(1 << 20), b""):
                h.update(khoi)
    return h.hexdigest()


def tim_trung_lap(kho, toi_thieu_kb=1, in_ra=print):
    """Nhóm file trùng nội dung. Luôn kiểm tra lại file TRÊN ĐĨA lúc chạy (không tin chỉ mục cũ):
    người dùng xóa file theo báo cáo này, báo nhầm là mất dữ liệu."""
    c = kho.conn
    theo_size_db = defaultdict(list)
    for fid, p, s, m, h in c.execute("SELECT id, path, size, mtime, sha1 FROM files WHERE size>=?",
                                     (toi_thieu_kb * 1024,)):
        theo_size_db[s].append((fid, p, s, m, h))
    theo_size = defaultdict(list)
    for ds in theo_size_db.values():
        if len(ds) < 2:
            continue
        for fid, p, s, m, h in ds:
            try:
                st = _lstat(p)
            except OSError:
                continue   # đã bị xóa/di chuyển
            if not stat.S_ISREG(st.st_mode) or la_file_tren_may_chu(st):
                continue   # đọc file chỉ có trên OneDrive = tải về cả file
            # Mã băm lưu sẵn chỉ đúng khi file chưa đổi kể từ lần quét
            con_nguyen = st.st_size == s and st.st_mtime == m
            theo_size[st.st_size].append(dict(fid=fid, path=p, mtime=st.st_mtime,
                                              sha1=h if con_nguyen else None, luu_duoc=con_nguyen))
    nhom_kq, da_bam = [], 0
    for size, ds in theo_size.items():
        if len(ds) < 2 or size < toi_thieu_kb * 1024:
            continue
        theo_dau = defaultdict(list)   # luôn nhóm bằng băm một phần, không trộn với băm đầy đủ
        for f in ds:
            try:
                theo_dau[_bam(f["path"], True)].append(f)
            except OSError:
                pass
        for nhom in theo_dau.values():
            if len(nhom) < 2:
                continue
            theo_bam = defaultdict(list)
            for f in nhom:
                h = f["sha1"]
                if not h:
                    try:
                        h = _bam(f["path"])
                    except OSError:
                        continue
                    if f["luu_duoc"]:
                        c.execute("UPDATE files SET sha1=? WHERE id=?", (h, f["fid"]))
                    da_bam += 1
                    if da_bam % 100 == 0:
                        c.commit()
                        in_ra(f"  ... đã so sánh {da_bam} file")
                theo_bam[h].append(dict(path=f["path"], mtime=f["mtime"]))
            for h, files in theo_bam.items():
                if len(files) > 1:
                    files.sort(key=lambda x: x["mtime"])
                    nhom_kq.append(dict(size=size, sha1=h, files=files, lang_phi=size * (len(files) - 1)))
    c.commit()
    nhom_kq.sort(key=lambda g: -g["lang_phi"])
    return nhom_kq


def _thu_muc_nhat_ky(kho):
    d = os.path.join(kho.thu_muc, "nhat_ky")
    os.makedirs(d, exist_ok=True)
    return d


def _ten_khong_trung(dich):
    if not os.path.exists(dich):
        return dich
    goc, ext = os.path.splitext(dich)
    i = 1
    while os.path.exists(f"{goc} ({i}){ext}"):
        i += 1
    return f"{goc} ({i}){ext}"


def sap_xep(kho, thu_muc, thuc_hien=False, in_ra=print, goi_y=True):
    """Đưa file ở NGAY cấp đầu thư mục vào thư mục con theo loại. Không đụng tới thư mục con có sẵn."""
    thu_muc = os.path.abspath(os.path.expanduser(thu_muc))
    ke_hoach = []
    with os.scandir(thu_muc) as it:
        for e in it:
            if not e.is_file(follow_symlinks=False) or _bo_qua_file(e.name) or e.name.startswith("."):
                continue
            ext = os.path.splitext(e.name)[1].lower()
            loai = phan_loai(ext)
            if ext in _DUOI_DANG_TAI or loai == "Khác":
                continue
            ke_hoach.append((e.path, os.path.join(thu_muc, loai, e.name)))
    ke_hoach.sort()
    if not thuc_hien:
        theo_loai = defaultdict(int)
        for _, d in ke_hoach:
            theo_loai[os.path.basename(os.path.dirname(d))] += 1
        in_ra(f"CHẠY THỬ — sẽ sắp xếp {len(ke_hoach)} file trong {thu_muc}:")
        for l, n in sorted(theo_loai.items(), key=lambda x: -x[1]):
            in_ra(f"  {l:<12} {n} file")
        for t, d in ke_hoach[:30]:
            in_ra(f"  {os.path.basename(t)}  ->  {os.path.relpath(d, thu_muc)}")
        if len(ke_hoach) > 30:
            in_ra(f"  ... và {len(ke_hoach) - 30} file khác")
        if ke_hoach and goi_y:
            in_ra("Chưa di chuyển gì. Thêm --thuc-hien để làm thật (có thể hoàn tác).")
        return ke_hoach
    da_chuyen = []
    nhat_ky = os.path.join(_thu_muc_nhat_ky(kho), f"sap_xep_{datetime.now():%Y%m%d_%H%M%S}.json")

    def ghi():
        with open(nhat_ky, "w", encoding="utf-8") as f:
            json.dump(dict(thu_muc=thu_muc, luc=time.time(), di_chuyen=da_chuyen), f, ensure_ascii=False, indent=1)

    for tu, den in ke_hoach:
        try:
            os.makedirs(os.path.dirname(den), exist_ok=True)
            den = _ten_khong_trung(den)
            os.rename(tu, den)
            da_chuyen.append(dict(tu=tu, den=den))
        except OSError as e:
            in_ra(f"  [BỎ QUA] {os.path.basename(tu)}: {e}")
        if len(da_chuyen) % 50 == 0:
            ghi()   # mất điện giữa chừng vẫn hoàn tác được phần đã chuyển
    ghi()
    in_ra(f"Đã sắp xếp {len(da_chuyen)} file. Nhật ký: {nhat_ky}\n"
          f"Muốn trả lại như cũ: python tro_ly_ai.py hoan-tac")
    return da_chuyen


def hoan_tac(kho, in_ra=print):
    ds = sorted(glob.glob(os.path.join(_thu_muc_nhat_ky(kho), "sap_xep_*.json")))
    ds = [p for p in ds if not p.endswith(".da_hoan_tac.json")]
    if not ds:
        in_ra("Không có lần sắp xếp nào để hoàn tác.")
        return 0
    with open(ds[-1], encoding="utf-8") as f:
        nk = json.load(f)
    tra, thu_muc_moi = 0, set()
    for m in reversed(nk["di_chuyen"]):
        if os.path.exists(m["den"]) and not os.path.exists(m["tu"]):
            try:
                os.rename(m["den"], m["tu"])
                tra += 1
                thu_muc_moi.add(os.path.dirname(m["den"]))
            except OSError as e:
                in_ra(f"  [BỎ QUA] {m['den']}: {e}")
        else:
            in_ra(f"  [BỎ QUA] {os.path.basename(m['den'])}: file đã bị đổi/xóa hoặc chỗ cũ đã có file")
    for d in thu_muc_moi:
        try:
            os.rmdir(d)   # chỉ xóa được khi thư mục rỗng
        except OSError:
            pass
    os.replace(ds[-1], ds[-1][:-5] + ".da_hoan_tac.json")
    in_ra(f"Đã trả {tra}/{len(nk['di_chuyen'])} file về chỗ cũ trong {nk['thu_muc']}.")
    return tra


# =====================================================================
# GIAO DIỆN WEB CỤC BỘ
# =====================================================================
TRANG_WEB = r"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Trợ lý AI local</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1d2330;--mu:#667085;--bd:#e3e6eb;--ac:#2f6fed}
@media(prefers-color-scheme:dark){:root{--bg:#14161b;--card:#1d2027;--fg:#e6e8ec;--mu:#9aa3b2;--bd:#2d313a;--ac:#6b9bff}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:920px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 12px}
nav button{border:1px solid var(--bd);background:var(--card);color:var(--fg);padding:8px 14px;border-radius:8px;cursor:pointer;margin-right:6px}
nav button.on{background:var(--ac);color:#fff;border-color:var(--ac)}
section{display:none;margin-top:14px}section.on{display:block}
form{display:flex;gap:8px}input,select{flex:1;padding:10px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--fg);font:inherit}
select{flex:0 0 auto}form button{padding:10px 16px;border:0;border-radius:8px;background:var(--ac);color:#fff;cursor:pointer;font:inherit}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin:10px 0;overflow-wrap:anywhere}
.mu{color:var(--mu);font-size:13px}.q{font-weight:600}.a{white-space:pre-wrap}table{width:100%;border-collapse:collapse}
td{padding:4px 6px;border-bottom:1px solid var(--bd);vertical-align:top}td.r{text-align:right;white-space:nowrap}
</style></head><body><main>
<h1>Trợ lý AI local <span class="mu">— dữ liệu không rời khỏi máy</span></h1>
<nav><button data-t="hoi" class="on">Hỏi đáp</button><button data-t="tim">Tìm file</button><button data-t="tk">Thống kê</button></nav>
<section id="hoi" class="on"><form id="fh"><input id="qh" placeholder="Hỏi về tài liệu của bạn, vd: Hợp đồng thuê nhà hết hạn khi nào?" autocomplete="off"><button>Hỏi</button></form><div id="kh"></div></section>
<section id="tim"><form id="ft"><input id="qt" placeholder="Từ khóa (gõ không dấu cũng được)" autocomplete="off">
<select id="lt"><option value="">Mọi loại</option></select><button>Tìm</button></form><div id="kt"></div></section>
<section id="tk"><div id="ktk" class="mu">Đang tải…</div></section>
</main><script>
const $=s=>document.querySelector(s), el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const dl=n=>{const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++}return (i?n.toFixed(1):n)+' '+u[i]};
const ng=t=>t?new Date(t*1000).toLocaleDateString('vi-VN'):'';
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,section').forEach(x=>x.classList.remove('on'));b.classList.add('on');$('#'+b.dataset.t).classList.add('on');if(b.dataset.t=='tk')tk()});
let ls=[];
$('#fh').onsubmit=async e=>{e.preventDefault();const q=$('#qh').value.trim();if(!q)return;$('#qh').value='';
 const c=el('div','card');c.append(el('div','q',q));const a=el('div','a','…');const src=el('div','mu');c.append(a,src);$('#kh').prepend(c);
 try{const r=await fetch('/api/hoi',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cau:q,lich_su:ls})});
  const rd=r.body.getReader(),dec=new TextDecoder();let buf='',head=null,txt='';
  for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
   if(head===null){const i=buf.indexOf('\n');if(i<0)continue;head=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);
    head.nguon.forEach((n,i)=>src.append(el('div',null,'['+(i+1)+'] '+n.path)));}
   txt+=buf;buf='';a.textContent=txt;}
  if(head&&head.loi)a.textContent=head.loi;
  ls.push({role:'user',content:q},{role:'assistant',content:txt});ls=ls.slice(-6);
 }catch(err){a.textContent='Lỗi: '+err}};
$('#ft').onsubmit=async e=>{e.preventDefault();const q=$('#qt').value.trim();if(!q)return;
 const r=await(await fetch('/api/tim?q='+encodeURIComponent(q)+'&loai='+encodeURIComponent($('#lt').value))).json();
 const k=$('#kt');k.replaceChildren();if(!r.ket_qua.length)k.append(el('div','card mu','Không thấy file nào khớp.'));
 r.ket_qua.forEach(x=>{const c=el('div','card');c.append(el('div','q',x.name),el('div','mu',x.path+' · '+x.loai+' · '+dl(x.size)+' · sửa '+ng(x.mtime)));if(x.trich)c.append(el('div',null,x.trich));k.append(c)})};
async function tk(){const r=await(await fetch('/api/thong_ke')).json(),k=$('#ktk');k.replaceChildren();k.className='';
 const bang=(tit,rows)=>{const c=el('div','card');c.append(el('div','q',tit));const t=el('table');rows.forEach(r=>{const tr=el('tr');r.forEach((v,i)=>tr.append(el('td',i?'r':null,v)));t.append(tr)});c.append(t);k.append(c)};
 k.append(el('div','card',`${r.so_file} file · ${dl(r.dung_luong)} · ${r.co_noi_dung} file đọc được nội dung · quét lần cuối ${ng(r.lan_quet_cuoi)}`));
 bang('Theo loại',r.theo_loai.map(x=>[x.loai,x.so_file+' file',dl(x.dung_luong)]));
 bang('File lớn nhất',r.lon_nhat.map(x=>[x.path,dl(x.size)]));
 bang('Thư mục nặng nhất',r.thu_muc_nang.map(x=>[x.path,x.so_file+' file',dl(x.size)]));
 if(r.lon_lau_khong_dung.length)bang('File lớn > 1 năm không sửa (cân nhắc dọn)',r.lon_lau_khong_dung.map(x=>[x.path,ng(x.mtime),dl(x.size)]));}
fetch('/api/thong_ke').then(r=>r.json()).then(r=>r.theo_loai.forEach(x=>{const o=el('option',null,x.loai);o.value=x.loai;$('#lt').append(o)}));
</script></body></html>"""


def tao_may_chu(thu_muc_du_lieu, cong=8765):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class XuLy(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _hop_le(self):
            # Chống DNS-rebinding / trang web lạ gọi vào: chỉ nhận đúng địa chỉ cục bộ
            cong_that = self.server.server_address[1]
            cho_phep = {f"127.0.0.1:{cong_that}", f"localhost:{cong_that}"}
            origin = self.headers.get("Origin")
            if self.headers.get("Host") not in cho_phep or (
                    origin and urllib.parse.urlparse(origin).netloc not in cho_phep):
                self.send_error(403)
                return False
            return True

        def _json(self, obj, ma=200):
            b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(ma)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            if not self._hop_le():
                return
            u = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(u.query)
            if u.path == "/":
                b = TRANG_WEB.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
                return
            kho = Kho(thu_muc_du_lieu)
            try:
                if u.path == "/api/tim":
                    cau = q.get("q", [""])[0]
                    kq = tim_file(kho, cau, k=30, loai=q.get("loai", [""])[0] or None)
                    self._json({"ket_qua": [dict(name=d["name"], path=d["path"], loai=d["loai"], size=d["size"],
                                                 mtime=d["mtime"], trich=trich_ngan(d["text"], cau)) for d in kq]})
                elif u.path == "/api/thong_ke":
                    self._json(thong_ke(kho))
                else:
                    self.send_error(404)
            finally:
                kho.dong()

        def do_POST(self):
            if not self._hop_le():
                return
            if self.path != "/api/hoi" or not self.headers.get("Content-Type", "").startswith("application/json"):
                self.send_error(400)
                return
            try:
                n = min(int(self.headers.get("Content-Length", 0)), 1 << 20)
                body = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                self.send_error(400)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            kho = Kho(thu_muc_du_lieu)

            def gui(t):
                self.wfile.write(t.encode("utf-8"))
                self.wfile.flush()

            # Giao thức: dòng đầu là JSON {"nguon": [...], "loi"?}, sau đó là chữ AI trả về
            dau = {"nguon": [], "da_gui": False}

            def moi_nguon(nguon):
                dau["nguon"] = [dict(path=d["path"]) for d in nguon]
                gui(json.dumps({"nguon": dau["nguon"]}, ensure_ascii=False) + "\n")
                dau["da_gui"] = True

            try:
                lich_su = body.get("lich_su") if isinstance(body.get("lich_su"), list) else None
                hoi(kho, str(body.get("cau", ""))[:2000], lich_su, gui, moi_nguon)
            except LoiOllama as e:
                if dau["da_gui"]:
                    gui(f"\n\n[Lỗi: {e}]")
                else:
                    gui(json.dumps({"nguon": [], "loi": str(e)}, ensure_ascii=False) + "\n")
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                kho.dong()

    return ThreadingHTTPServer(("127.0.0.1", cong), XuLy)


# =====================================================================
# DÒNG LỆNH
# =====================================================================
def _in_ket_qua_tim(kq, cau):
    if not kq:
        print("Không thấy file nào khớp. Thử từ khóa khác hoặc quét thêm thư mục.")
        return
    for i, d in enumerate(kq, 1):
        print(f"\n{i:>2}. {d['name']}   [{d['loai']}, {dung_luong(d['size'])}, sửa {ngay(d['mtime'])}]")
        print(f"    {d['path']}")
        t = trich_ngan(d["text"], cau)
        if t:
            print(f"    {t}")


def _hoi_cli(kho, cau, lich_su=None):
    print()
    try:
        tra_loi, nguon = hoi(kho, cau, lich_su, lambda t: print(t, end="", flush=True))
    except LoiOllama as e:
        print(f"[KHÔNG GỌI ĐƯỢC AI] {e}\nCác file liên quan nhất tìm được:")
        _in_ket_qua_tim(tim_file(kho, cau, k=5), cau)
        return None
    print("\n")
    if nguon:
        print("Nguồn:")
        for i, d in enumerate(nguon, 1):
            print(f"  [{i}] {d['path']}")
    return tra_loi


def main(argv=None):
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    ap = argparse.ArgumentParser(description="Trợ lý AI local quản lý dữ liệu laptop")
    ap.add_argument("--du-lieu", default=THU_MUC_DU_LIEU_MAC_DINH, help="thư mục lưu chỉ mục + cấu hình")
    sub = ap.add_subparsers(dest="lenh", required=True)
    sub.add_parser("kiem-tra", help="kiểm tra Ollama, mô hình, chỉ mục")
    p = sub.add_parser("quet", help="quét & lập chỉ mục (chỉ đọc file mới/đã sửa)")
    p.add_argument("thu_muc", nargs="*", help="bỏ trống = theo cau_hinh.json / Desktop, Documents, Downloads")
    p.add_argument("--khong-nhung", action="store_true", help="bỏ qua tạo vector ngữ nghĩa")
    p = sub.add_parser("tim", help="tìm file theo từ khóa/ý nghĩa")
    p.add_argument("cau", nargs="?", help="bỏ trống thì chương trình hỏi (gõ tiếng Việt có dấu an toàn hơn)")
    p.add_argument("-n", type=int, default=15)
    p.add_argument("--loai", choices=list(LOAI_FILE) + ["Khác"])
    p.add_argument("--duoi", help="đuôi file, vd pdf")
    p.add_argument("--trong", help="chỉ tìm trong thư mục này")
    p = sub.add_parser("hoi", help="hỏi AI về tài liệu của bạn")
    p.add_argument("cau")
    sub.add_parser("chat", help="trò chuyện nhiều lượt")
    p = sub.add_parser("thong-ke", help="dung lượng theo loại, file/thư mục lớn nhất")
    p.add_argument("-n", type=int, default=15)
    p = sub.add_parser("trung-lap", help="tìm file trùng nội dung (không tự xóa)")
    p.add_argument("--toi-thieu-kb", type=int, default=1)
    p.add_argument("--xuat", help="ghi danh sách ra file CSV")
    p = sub.add_parser("sap-xep", help="xếp file lộn xộn vào thư mục con theo loại")
    p.add_argument("thu_muc", nargs="?", default=os.path.join(os.path.expanduser("~"), "Downloads"))
    p.add_argument("--thuc-hien", action="store_true", help="di chuyển thật (mặc định chỉ chạy thử)")
    p.add_argument("--xac-nhan", action="store_true", help="cho xem kế hoạch và hỏi lại trước khi di chuyển")
    sub.add_parser("hoan-tac", help="hoàn tác lần sắp xếp gần nhất")
    p = sub.add_parser("giao-dien", help="mở giao diện web cục bộ")
    p.add_argument("--cong", type=int, default=8765)
    p.add_argument("--khong-mo-trinh-duyet", action="store_true")
    a = ap.parse_args(argv)

    try:
        kho = Kho(a.du_lieu)
    except RuntimeError as e:
        print(f"[LỖI] {e}")
        return 1
    try:
        if a.lenh == "kiem-tra":
            ch = kho.cau_hinh
            tq = tong_quan(kho)
            print(f"Dữ liệu: {kho.thu_muc}\nChỉ mục: {tq['so_file']} file, {tq['co_noi_dung']} đọc được nội dung, "
                  f"quét lần cuối {ngay(tq['lan_quet_cuoi']) or 'chưa quét'}")
            print(f"Thư mục quét: {', '.join(ch['thu_muc_quet'] or thu_muc_mac_dinh())}")
            try:
                ds = Ollama(ch["ollama_url"]).danh_sach_mo_hinh()
                print(f"Ollama: đang chạy, có {len(ds)} mô hình")
                for m in (ch["mo_hinh_chat"], ch["mo_hinh_nhung"]):
                    ok = any(x == m or x == m + ":latest" for x in ds)
                    print(f"  {'[OK]  ' if ok else '[THIẾU]'} {m}" + ("" if ok else f"   -> chạy: ollama pull {m}"))
            except LoiOllama as e:
                print(f"Ollama: CHƯA CHẠY — {e}\n  (tìm kiếm, thống kê, trùng lặp, sắp xếp vẫn dùng được)")
            try:
                import pypdf  # noqa: F401
                print("Đọc PDF: [OK]")
            except ImportError:
                print("Đọc PDF: [THIẾU] pip install pypdf")
            print(f"Vector ngữ nghĩa: {so_doan_co_vector(kho)} đoạn"
                  + ("" if _co_numpy() else " (chưa cài numpy: pip install numpy để tìm nhanh hơn)"))
            cb = canh_bao_vector(kho)
            if cb:
                print(f"[CẢNH BÁO] {cb}")
        elif a.lenh == "quet":
            quet(kho, a.thu_muc or None, nhung=not a.khong_nhung)
        elif a.lenh == "tim":
            # Nhập qua Python (không qua "set /p" của .bat): tiếng Việt có dấu và ký tự & " không bị hỏng
            cau = a.cau
            if cau is None:
                try:
                    cau = input("Từ khóa (có dấu hay không dấu đều được): ").strip()
                except (EOFError, KeyboardInterrupt):
                    cau = ""
            if cau:
                _in_ket_qua_tim(tim_file(kho, cau, k=a.n, loai=a.loai, duoi=a.duoi, thu_muc=a.trong), cau)
        elif a.lenh == "hoi":
            _hoi_cli(kho, a.cau)
        elif a.lenh == "chat":
            print("Trò chuyện với tài liệu của bạn. Gõ 'thoat' để thoát, 'moi' để bắt đầu lại.")
            lich_su = []
            while True:
                try:
                    cau = input("\nBạn: ").strip()
                except (EOFError, KeyboardInterrupt):
                    break
                if bo_dau(cau) in ("thoat", "exit", "quit", "q"):
                    break
                if bo_dau(cau) == "moi":
                    lich_su = []
                    continue
                if cau:
                    tl = _hoi_cli(kho, cau, lich_su)
                    if tl:
                        lich_su = (lich_su + [{"role": "user", "content": cau},
                                              {"role": "assistant", "content": tl}])[-6:]
        elif a.lenh == "thong-ke":
            tk = thong_ke(kho, a.n)
            print(f"Tổng: {tk['so_file']} file, {dung_luong(tk['dung_luong'])} "
                  f"(quét lần cuối {ngay(tk['lan_quet_cuoi']) or 'chưa quét'})\n\nTHEO LOẠI:")
            for x in tk["theo_loai"]:
                print(f"  {x['loai']:<12} {x['so_file']:>7} file  {dung_luong(x['dung_luong']):>10}")
            print("\nFILE LỚN NHẤT:")
            for x in tk["lon_nhat"]:
                print(f"  {dung_luong(x['size']):>10}  {x['path']}")
            print("\nTHƯ MỤC NẶNG NHẤT (chỉ tính file trực tiếp bên trong):")
            for x in tk["thu_muc_nang"]:
                print(f"  {dung_luong(x['size']):>10}  {x['so_file']:>5} file  {x['path']}")
            if tk["lon_lau_khong_dung"]:
                print("\nFILE > 50MB KHÔNG SỬA HƠN 1 NĂM (cân nhắc dọn):")
                for x in tk["lon_lau_khong_dung"]:
                    print(f"  {dung_luong(x['size']):>10}  {ngay(x['mtime'])}  {x['path']}")
        elif a.lenh == "trung-lap":
            ds = tim_trung_lap(kho, a.toi_thieu_kb)
            tong = sum(g["lang_phi"] for g in ds)
            print(f"Tìm thấy {len(ds)} nhóm file trùng, có thể giải phóng {dung_luong(tong)} "
                  "nếu chỉ giữ 1 bản mỗi nhóm (công cụ KHÔNG tự xóa).")
            for g in ds[:30]:
                print(f"\n{dung_luong(g['size'])} x {len(g['files'])} bản:")
                for i, f in enumerate(g["files"]):
                    print(f"  {'(cũ nhất) ' if i == 0 else '          '}{f['path']}")
            if len(ds) > 30:
                print(f"\n... và {len(ds) - 30} nhóm khác (dùng --xuat để xem đủ)")
            if a.xuat:
                import csv
                with open(a.xuat, "w", newline="", encoding="utf-8-sig") as f:
                    w = csv.writer(f)
                    w.writerow(["nhom", "dung_luong_byte", "duong_dan", "ngay_sua"])
                    for i, g in enumerate(ds, 1):
                        for x in g["files"]:
                            w.writerow([i, g["size"], x["path"], ngay(x["mtime"])])
                print(f"Đã ghi {a.xuat}")
        elif a.lenh == "sap-xep":
            if not os.path.isdir(a.thu_muc):
                print(f"[LỖI] Không có thư mục: {a.thu_muc}")
                return 1
            if a.thuc_hien and a.xac_nhan:
                if not sap_xep(kho, a.thu_muc, False, goi_y=False):
                    return 0
                try:
                    tl = input("\nDi chuyển các file trên? Gõ c để đồng ý, phím khác để hủy (c/k): ")
                except (EOFError, KeyboardInterrupt):
                    tl = ""
                if bo_dau(tl.strip()) not in ("c", "co", "y", "yes"):
                    print("Đã hủy, không di chuyển file nào.")
                    return 0
            sap_xep(kho, a.thu_muc, a.thuc_hien)
        elif a.lenh == "hoan-tac":
            hoan_tac(kho)
        elif a.lenh == "giao-dien":
            kho.dong()
            kho = None
            srv = tao_may_chu(a.du_lieu, a.cong)
            url = f"http://127.0.0.1:{srv.server_address[1]}/"
            print(f"Giao diện: {url}   (chỉ mở trên máy này; Ctrl+C để tắt)")
            if not a.khong_mo_trinh_duyet:
                import webbrowser
                webbrowser.open(url)
            try:
                srv.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                srv.server_close()
    finally:
        if kho:
            kho.dong()
    return 0


if __name__ == "__main__":
    sys.exit(main())
