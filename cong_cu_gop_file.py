#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Công cụ gộp dữ liệu vụ việc/vụ án tạm đình chỉ từ các file đơn vị vào FILE TỔNG.
Tự nhận diện:
  - Dòng tiêu đề nằm ở bất kỳ dòng nào (dò theo ô 'STT').
  - Độ DỊCH CỘT khi đơn vị chèn thêm cột ở đầu (neo theo cột STT).
  - Nguồn HỆ: (a) dòng phân nhóm 'Hệ ...' chèn giữa bảng, hoặc (b) một CỘT ghi hệ
    ('Hệ phòng' / 'Hệ' — có thể ở cuối bảng).
  - Bộ lọc 'CÒN': nếu có cột trạng thái ('Hiện còn / kết thúc tháng...'), chỉ lấy
    dòng ghi 'còn', bỏ dòng đã kết thúc.
Có ĐỐI CHIẾU với file Phụ lục biểu ngang (tùy chọn --phu-luc), cảnh báo nếu lệch > ngưỡng.

Cách chạy:
    python cong_cu_gop_file.py --don-vi donvi --mau-3ab mau_chuan.xlsx \
        --mau-3cd mau_3C_3D.xlsx --mau-pl78 mau_PL78.xlsx \
        --phu-luc phu_luc.xlsx [--nguong 50] [--out-dir ket_qua]
"""
import argparse, os, re, glob, unicodedata, time, traceback, warnings as _warnings
from collections import Counter
from functools import lru_cache
import openpyxl
from openpyxl.utils import get_column_letter

# openpyxl hay cảnh báo vặt (Print area, Data Validation...) -> ẩn cho gọn màn hình
_warnings.filterwarnings("ignore", module="openpyxl")

# ---------- Đọc ô nhanh ----------
def cv(ws, r, c):
    """Giá trị ô (r, c) KHÔNG tạo ô mới. ws.cell() tạo object cho cả ô trống
    -> chậm, và làm max_row/max_column phình dần sau mỗi lần dò."""
    cell = ws._cells.get((r, c))
    return None if cell is None else cell.value

# ---------- Chuẩn hóa chuỗi (có cache: cùng 1 chuỗi được chuẩn hóa hàng chục lần) ----------
_RE_WS = re.compile(r"\s+")

@lru_cache(maxsize=None, typed=True)
def _norm(s):
    if s is None: return ""
    return _RE_WS.sub(" ", unicodedata.normalize("NFC", str(s))).strip()

@lru_cache(maxsize=None, typed=True)
def _na(s):
    s = norm(s).lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d")

def norm(s):
    try: return _norm(s)
    except TypeError:   # giá trị không hash được (hiếm) -> tính trực tiếp
        return _norm.__wrapped__(s)

def na(s):
    """lower + bỏ dấu, đ->d"""
    try: return _na(s)
    except TypeError:
        return _na.__wrapped__(s)

# ---------- Nhận diện HỆ ----------
def _is_cap_abbr(text):
    """Có viết tắt 'CAP'/'CAX' (KHÔNG dấu) như một từ riêng? 'cấp' có dấu -> không."""
    return bool(re.search(r"\bca[px]\b", norm(text).lower()))

def he_from_text(text):
    """Từ VĂN BẢN mô tả nhóm -> mã hệ (hiểu cả mã trực tiếp lẫn tên mô tả)."""
    t = na(text)
    # (a) ghi thẳng mã: 'Hệ PC01', '2. Hệ PC02'...
    m = re.search(r"pc\s*0?([1-4])", t)
    if m: return "PC0" + m.group(1)
    # (b) tên mô tả
    if "ma tuy" in t:                        return "PC04"
    if "kinh te" in t or "moi truong" in t:  return "PC03"
    if "ttxh" in t or "trat tu xa hoi" in t: return "PC02"
    if "van phong" in t:                     return "PC01"
    # Hệ 5 (CAP): 'Công an xã/phường', 'CAP'/'CAX', 'CA phường/xã ra quyết định'
    # Viết tắt CAP/CAX dò trên chữ CÒN DẤU: bỏ dấu thì 'cấp' (cung cấp, cấp xã,
    # tên 'Văn Cấp'...) cũng thành 'cap' -> nhận nhầm là hệ CAP.
    if ("cong an xa" in t or "cong an phuong" in t or _is_cap_abbr(text)
            or "ca phuong" in t or "ca xa" in t or "ra quyet dinh" in t
            or ("thu ly" in t and ("phuong" in t or "xa" in t))):   # 'Phường/Xã thụ lý'
        return "CAP"
    return None

def is_he_header(text):
    """Text có phải là DÒNG TIÊU ĐỀ HỆ không (khác với một tội danh bình thường)?
    Yêu cầu: map được ra hệ VÀ trông giống tiêu đề (có 'Hệ'/'Văn phòng'/'Công an'/
    'thụ lý'/mã PCxx, hoặc bắt đầu bằng số / số La Mã)."""
    t = na(text)
    if not t:
        return None
    he = he_from_text(text)   # truyền chữ gốc (còn dấu) để phân biệt CAP / 'cấp'
    if not he:
        return None
    if ("he " in t or t.startswith("he") or "van phong" in t or "cong an" in t
            or "thu ly" in t or "ra quyet dinh" in t or re.search(r"pc\s*0?[1-4]", t)
            or re.match(r"^\s*(i{1,3}v?|vi{0,3}|[1-9])\s*[.)]", t)):
        return he
    return None

def flat_key(ws, rows, c):
    """Khóa tiêu đề của 1 cột: gộp các dòng tiêu đề, bỏ dấu, bỏ ký tự đặc biệt."""
    txt = " ".join(norm(cv(ws, r, c)) for r in rows if cv(ws, r, c))
    k = na(txt)
    k = re.sub(r"[^a-z0-9 ]", " ", k)
    k = re.sub(r"\b\d+\b", " ", k)   # bỏ số thứ tự cột "(1)(2)..." dính vào khóa
    return re.sub(r"\s+", " ", k).strip()

def compute_std_keys(master_path):
    """Khóa tiêu đề chuẩn từ FILE TỔNG cho từng cột chuẩn (để ánh xạ cột theo tiêu đề)."""
    wb = openpyxl.load_workbook(master_path)
    picks = pick_best_sheets(wb)
    out = {}
    for kind in ("3A", "3B"):
        ws = wb[picks[kind]]; n_std = SHEET_CFG[kind]["n_std"]
        hdr, stt = find_header(ws)
        ds = None
        for i in range(hdr, hdr + 9):
            if is_int_stt(cv(ws, i, 1)): ds = i; break
        ds = ds or hdr + 4
        rows = list(range(hdr, ds))
        keys = [(c, flat_key(ws, rows, c)) for c in range(1, n_std + 1)]
        if kind == "3A" and len(keys) >= 8 and not keys[7][1]:
            keys[7] = (8, "quyet dinh tam dinh chi")   # cột H (QĐ TĐC) tiêu đề trống
        out[kind] = keys
    return out

def _key_match(a, b):
    if not a or not b: return False
    if a == b: return True
    if len(a) >= 6 and len(b) >= 6 and (a in b or b in a): return True
    return a[:9] == b[:9] and len(a) >= 9

def build_col_map(ws, hdr_rows, stt_col, last_src, std_keys):
    """Ánh xạ cột NGUỒN -> vị trí cột CHUẨN theo tiêu đề (giữ thứ tự trái->phải).
    Trả về {std_pos: src_col}."""
    src = [(c, flat_key(ws, hdr_rows, c)) for c in range(stt_col, last_src + 1)]
    col_map = {}; ptr = 0
    for src_c, src_k in src:
        if not src_k: continue
        for k in range(ptr, len(std_keys)):
            std_pos, std_k = std_keys[k]
            if _key_match(std_k, src_k):
                col_map[std_pos] = src_c; ptr = k + 1; break
    return col_map

def src_val(ws, i, pos, offset, col_map):
    """Lấy GIÁ TRỊ ô theo VỊ TRÍ CHUẨN `pos`: nếu file khác chuẩn (có col_map)
    thì đọc theo cột đã ánh xạ; nếu không thì đọc theo vị trí (dịch offset)."""
    if col_map is not None:
        c = col_map.get(pos)
        return cv(ws, i, c) if c else None
    return cv(ws, i, offset + pos)

def row_has_case_data(ws, i, offset, n_std, col_map=None):
    """Dòng này có phải là DÒNG VỤ THẬT không (để phân biệt với dòng tiêu đề hệ)?
    Có Mã VV/VA, hoặc có >=3 ô nội dung trong các cột chuẩn -> là vụ thật."""
    if norm(src_val(ws, i, n_std, offset, col_map)):
        return True
    cnt = 0
    for c in range(2, n_std + 1):
        v = na(src_val(ws, i, c, offset, col_map))
        if v and v not in ("khong", "x", "0", "-"):
            cnt += 1
            if cnt >= 3:
                return True
    return False

def _real_cell(v):
    """Ô có NỘI DUNG THẬT? (bỏ trống, 'không', 'x', số cột '(2)', mẫu 'Column2')"""
    v = na(v)
    if not v or v in ("khong", "khong co", "x", "0", "-"):
        return False
    if re.fullmatch(r"\(\d+\)", v) or v.startswith("column"):
        return False
    return True

def classify_case_row(ws, i, offset, n_std, col_map=None, qtdc_pos=None):
    """Phân loại 1 HÀNG theo NỘI DUNG các ô (KHÔNG dựa vào STT):
      - 'case'  : là 1 vụ thật -> có Tội danh, hoặc Mã, hoặc QĐ TĐC, hoặc >=3 ô nội dung.
      - 'stray' : chỉ có 1-2 ô lẻ (vd chỉ mỗi tên 'Phạm Thị Liên'), THIẾU
                  Tội danh + Mã + QĐ TĐC -> KHÔNG tính, cần rà tay.
      - 'empty' : không có ô nội dung nào -> bỏ qua im lặng (placeholder).
    Đọc theo cột đã ánh xạ nếu là mẫu khác chuẩn."""
    toi = _real_cell(src_val(ws, i, 2, offset, col_map))
    ma = _real_cell(src_val(ws, i, n_std, offset, col_map))
    q = qtdc_pos is not None and _real_cell(src_val(ws, i, qtdc_pos, offset, col_map))
    # đếm ô có nội dung thật trên TOÀN HÀNG (mọi cột nghiệp vụ), không chỉ vài cột
    # đầu -> vụ thật thường có nhiều cột (số hồ sơ, ĐTV, VKS, ngày...) dù thiếu
    # Tội danh/Mã; còn hàng chỉ có mỗi cái tên lẻ thì 1-2 ô.
    n = sum(1 for c in range(2, n_std + 1)
            if _real_cell(src_val(ws, i, c, offset, col_map)))
    if toi or ma or q or n >= 3:
        return "case"
    if n == 0:
        return "empty"
    return "stray"

def is_colnum_row(ws, i, offset, n_std, col_map=None):
    """DÒNG SỐ THỨ TỰ CỘT: đơn vị để lẫn 1 dòng đánh số cột (2,3,4,...,34) vào
    dữ liệu -> KHÔNG phải vụ. Nhận diện: nhiều ô là số nguyên nhỏ tạo thành dãy
    tăng liên tiếp (2,3,4,... hoặc 1,2,3,...)."""
    nums = []; tot = 0
    for c in range(2, n_std + 1):
        v = na(src_val(ws, i, c, offset, col_map))
        if not v:
            continue
        tot += 1
        nums.append(int(v) if re.fullmatch(r"\d{1,2}", v) else None)
    ints = [x for x in nums if x is not None]
    if tot < 5 or len(ints) < 5 or len(ints) < tot * 0.7:
        return False
    inc = sum(1 for a, b in zip(ints, ints[1:]) if b == a + 1)
    return inc >= len(ints) - 2

def is_strong_case_row(ws, i, offset, n_std, col_map=None, qtdc_pos=None):
    """DÒNG VỤ THẬT nhưng ĐƠN VỊ QUÊN ĐÁNH SỐ STT (vd Sơn Đồng vụ án hàng 31:
    họ đánh 1, [để trống], 2). Điều kiện CHẶT để tránh đếm nhầm:
      - Bắt buộc có TỘI DANH (cột 2) thật (không phải dòng số cột '(2)', mẫu
        'Column2', dòng 'tổng/cộng', hay dòng bị can thứ 2 để trống tội danh);
      - VÀ có Quyết định TĐC thật HOẶC có Mã VV/VA thật.
    Đọc theo cột đã ánh xạ nếu là mẫu khác chuẩn."""
    toi = na(src_val(ws, i, 2, offset, col_map))
    if not toi or toi in ("khong", "khong co", "x", "0", "-"):
        return False
    # dòng rác / không phải vụ: '(2)', 'column2', 'tổng', 'cộng'
    # chú ý: bỏ dấu thì 'Cộng' và 'Công' đều thành 'cong' -> không được loại
    # tội 'Công nhiên chiếm đoạt tài sản' (Điều 172).
    if re.fullmatch(r"\(\d+\)", toi) or toi.startswith("column") \
       or toi.startswith("tong") \
       or (toi.startswith("cong") and not toi.startswith("cong nhien")):
        return False
    has_ma = _real_cell(src_val(ws, i, n_std, offset, col_map))
    has_q = qtdc_pos is not None and _real_cell(src_val(ws, i, qtdc_pos, offset, col_map))
    return has_ma or has_q

def he_in_row(ws, i, stt_col, offset, maxcol):
    """Dò DÒNG TIÊU ĐỀ HỆ: chỉ xét cột STT và cột Tội danh (nơi các ĐV hay đặt
    tiêu đề), tránh nhầm với cột trích yếu/nội dung có chứa 'Công an xã...'."""
    for c in {stt_col, stt_col + 1, offset + 1, offset + 2}:
        if c < 1 or c > maxcol:
            continue
        he = is_he_header(cv(ws, i, c))
        if he:
            return he
    return None

def he_from_cell(val):
    """Từ giá trị 1 Ô hệ (đã ghi sẵn mã) -> mã hệ. Ưu tiên mã PC0x/CAP xuất hiện đầu tiên."""
    s = na(val)
    if not s: return None
    m = re.search(r"pc\s*0?([1-4])", s)
    if m: return "PC0" + m.group(1)
    if _is_cap_abbr(val) or "cong an xa" in s or "cong an phuong" in s or s in ("ca xa","ca phuong"):
        return "CAP"
    return he_from_text(val)

SHEET_CFG = {
    "3A": {"n_std": 34, "dia_ban_rel": 4, "last_hdr": "ma vv", "loai": "Vụ việc", "qtdc": 8},
    "3B": {"n_std": 35, "dia_ban_rel": 3, "last_hdr": "ma va", "loai": "Vụ án", "qtdc": 9},
    # 3C = 3A + 2 cột (QĐ phục hồi, QĐ không khởi tố); 3D = 3B + 2 cột (QĐ phục hồi ĐT, QĐ đình chỉ ĐT).
    # last_hdr = tiêu đề CỘT CUỐI thật (Mã không còn ở cuối) để căn cột đúng; ma_hdr để tìm cột Mã.
    "3C": {"n_std": 36, "dia_ban_rel": 4, "last_hdr": "khong khoi to va", "ma_hdr": "ma vv", "loai": "Vụ việc 3C", "qtdc": 8},
    "3D": {"n_std": 37, "dia_ban_rel": 3, "last_hdr": "dinh chi dieu tra", "ma_hdr": "ma va", "loai": "Vụ án 3D", "qtdc": 9},
}

# các từ khóa loại trừ: sheet phụ, không phải 3A/3B gốc
SHEET_EXCLUDE = ["cuoi ky", "chuyen", "phuc hoi", "thong ke", "3c", "3d",
                 "hth", "to a", "an moi", "da hth", "ds hth", "nhan tu",
                 "chuyen di", "bao cao", "tong hop"]

def _sheet_score(name, kind):
    """Điểm khớp của 1 sheet với loại 3A/3B (0 = không khớp)."""
    n = na(name).strip()
    for ex in SHEET_EXCLUDE:
        if ex in n:
            return 0
    if n in ("nhan",):  # sheet 'Nhận'
        return 0
    if kind == "3A":
        if n in ("ad", "a d"): return 4          # 'AĐ' = vụ việc (một số ĐV đặt vậy)
        if n == "3a": return 5
        if "vu viec" in n and ("tam dinh chi" in n or "tdc" in n):
            return 10 if n.startswith("vu viec tam dinh chi") else 8
        if "vu viec" in n and "3a" in n: return 8   # vd 'Vụ việc 3A' (file tổng)
        return 0
    else:  # 3B
        if n == "ak": return 4                   # 'AK' = vụ án (một số ĐV đặt vậy)
        if n == "3b": return 5
        if "vu an" in n and ("tam dinh chi" in n or "tdc" in n):
            return 10 if n.startswith("vu an tam dinh chi") or n.startswith("vu an tdc") else 8
        if "vu an" in n and "3b" in n: return 8     # vd 'Vụ án 3B' (file tổng)
        return 0

def _content_kind(ws):
    """Nhận diện sheet là 3A/3B theo NỘI DUNG tiêu đề (khi tên sheet lạ)."""
    n = na(ws.title).strip()
    for ex in SHEET_EXCLUDE:
        if ex in n: return None
    if n in ("nhan",): return None
    hdr, stt_col = find_header(ws)
    if hdr is None: return None
    # gom text khối tiêu đề
    txt = ""
    for r in range(hdr, min(hdr + 5, ws.max_row + 1)):
        for c in range(1, min(ws.max_column, 45) + 1):
            v = cv(ws, r, c)
            if v is not None: txt += " " + na(v)
    txt = txt.lower()
    has_va = ("bi can" in txt or "tom tat noi dung vu an" in txt or "khoi to vu an" in txt
              or "quyet dinh khoi to" in txt or "ma va" in txt)
    has_vv = ("nguyen don" in txt or "bi don" in txt or "trich yeu noi dung vu viec" in txt
              or "ma vv" in txt)
    if has_va and not has_vv: return "3B"
    if has_vv and not has_va: return "3A"
    # nếu cả hai: dựa vào 'tom tat noi dung vu an' (3B) vs 'trich yeu' (3A)
    if "tom tat noi dung vu an" in txt: return "3B"
    if "trich yeu noi dung vu viec" in txt: return "3A"
    return None

def sheet_cd_signature(ws):
    """Sheet có phải 3C/3D không, dựa vào CỘT ĐẶC TRƯNG ở cuối:
    3C có 'Quyết định Không Khởi Tố VAHS'; 3D có 'Quyết định Đình chỉ điều tra'.
    (3C/3D nhiều khi đặt TÊN SHEET y hệt 3A/3B là 'Vụ việc/Vụ án tạm đình chỉ'.)"""
    maxc = ws.max_column
    for i in range(1, min(11, ws.max_row) + 1):
        for c in range(max(1, maxc - 9), maxc + 1):
            t = na(cv(ws, i, c))
            if not t: continue
            if "dinh chi dieu tra" in t: return "3D"
            if "khong khoi to va" in t or "khong khoi to vahs" in t: return "3C"
    return None

def pick_best_sheets(wb):
    """Chọn đúng 1 sheet 3A và 1 sheet 3B tốt nhất cho workbook (tên → nội dung dự phòng).
    BỎ QUA sheet có dấu hiệu 3C/3D (để không nhận nhầm khi 3C/3D đặt tên như 3A/3B)."""
    best = {"3A": (0, None), "3B": (0, None)}
    for ws in wb.worksheets:
        if sheet_cd_signature(ws):   # là 3C/3D -> không phải 3A/3B
            continue
        for kind in ("3A", "3B"):
            s = _sheet_score(ws.title, kind)
            if s > best[kind][0]:
                best[kind] = (s, ws.title)
    picked = {"3A": best["3A"][1], "3B": best["3B"][1]}
    # dự phòng theo nội dung cho loại còn thiếu
    used = set(v for v in picked.values() if v)
    for kind in ("3A", "3B"):
        if picked[kind]: continue
        cand = (0, None)
        for ws in wb.worksheets:
            if ws.title in used: continue
            if sheet_cd_signature(ws): continue
            if _content_kind(ws) != kind: continue
            # ưu tiên sheet nhiều dòng dữ liệu nhất
            hdr, sc = find_header(ws)
            ndata = sum(1 for i in range((hdr or 1), ws.max_row + 1) if is_int_stt(cv(ws, i, sc or 1)))
            if ndata > cand[0]: cand = (ndata, ws.title)
        if cand[1]:
            picked[kind] = cand[1]; used.add(cand[1])
    return picked

FOOTER_KEYS = ["can bo thong ke", "thu truong", "kt. truong", "kt.truong", "pho truong",
               "truong cong an", "ha noi, ngay", "(ky ten", "chot t", "nguoi lap",
               "xac nhan don vi", "canh bao"]
def is_footer(ws, i, maxcol):
    # chỉ soi cột STT/nhãn (1-2) và vùng chữ ký (20-26) — TRÁNH cột nội dung
    for j in [1, 2] + list(range(20, min(maxcol, 27) + 1)):
        v = na(cv(ws, i, j))
        if any(k in v for k in FOOTER_KEYS): return True
    return False

def find_header(ws):
    for i in range(1, min(15, ws.max_row) + 1):
        for j in range(1, min(8, ws.max_column) + 1):
            if norm(cv(ws, i, j)).upper() == "STT":
                return i, j
    return None, None

def is_int_stt(v):
    if isinstance(v, bool): return False
    if isinstance(v, int): return True
    if isinstance(v, float) and float(v).is_integer(): return True
    return bool(re.fullmatch(r"\d{1,3}", norm(v)))

def header_text_of_col(ws, hdr, data_start, c):
    return na(" ".join(norm(cv(ws, r, c)) for r in range(hdr, max(hdr + 1, data_start))))

def detect_columns(ws, kind, hdr, stt_col, data_start):
    """Trả về (he_col, con_col). he_col: cột ghi hệ; con_col: cột trạng thái 'còn/kết thúc'."""
    maxcol = ws.max_column
    he_col = None; con_col = None
    # xem trước vài dòng dữ liệu để kiểm chứng
    sample_rows = [r for r in range(data_start, min(data_start + 40, ws.max_row + 1))]
    for c in range(1, maxcol + 1):
        h = header_text_of_col(ws, hdr, data_start, c).strip()
        # --- cột HỆ ---
        if he_col is None and (h in ("he", "he phong", "he:") or h.startswith("he phong")
                               or re.fullmatch(r"he", h) or h == "he phong"):
            hits = sum(1 for r in sample_rows if he_from_cell(cv(ws, r, c))
                       and is_int_stt(cv(ws, r, stt_col)))
            if hits >= 1: he_col = c
        # --- cột trạng thái CÒN ---
        if con_col is None and ("hien con" in h or "ket thuc thang" in h
                                or ("con" in h and "ket thuc" in h)):
            con_col = c
    return he_col, con_col

def detect_unit_name(ws, dia_ban_col, fallback):
    c = Counter()
    for i in range(1, ws.max_row + 1):
        v = norm(cv(ws, i, dia_ban_col))
        if v and len(v) < 40 and not na(v).startswith(("dia ban", "(4)", "(3)")):
            v2 = re.sub(r"^(xã|phường|thị trấn|xa|phuong)\s+", "", v, flags=re.I).strip()
            if v2 and not v2.isdigit(): c[v2] += 1
    if not c: return fallback
    name = c.most_common(1)[0][0]
    return " ".join(w.capitalize() for w in name.split())

def extract_from_sheet(ws, kind, unit_hint, std_keys=None):
    cfg = SHEET_CFG[kind]; n_std = cfg["n_std"]; maxcol = ws.max_column
    warnings = []
    hdr, stt_col = find_header(ws)
    if hdr is None:
        return [], ["Không tìm thấy dòng tiêu đề (STT)"], None
    offset = stt_col - 1

    # dòng bắt đầu dữ liệu: sau dòng số cột "(1)"
    data_start = hdr + 1
    for r in range(hdr, hdr + 9):
        if norm(cv(ws, r, stt_col)) in ("(1)", "1)"):
            data_start = r + 1; break

    # Căn cột: tìm cột Mã VV/VA thực tế trong file nguồn.
    hdr_rows = list(range(hdr, data_start))
    src_ma_col = None
    for c in range(offset + 1, min(maxcol, offset + n_std + 8) + 1):
        if cfg["last_hdr"] in flat_key(ws, hdr_rows, c):
            src_ma_col = c; break
    # Nếu Mã KHÔNG ở đúng vị trí chuẩn -> file dùng mẫu hẹp/khác chuẩn:
    # ánh xạ cột theo TIÊU ĐỀ để đổ đúng cột (thay vì chép theo vị trí).
    col_map = None
    if std_keys and src_ma_col is not None and src_ma_col != offset + n_std:
        col_map = build_col_map(ws, hdr_rows, stt_col, src_ma_col, std_keys)
        warnings.append(f"Mẫu KHÁC CHUẨN (Mã ở cột {get_column_letter(src_ma_col)} thay vì "
                        f"{get_column_letter(offset + n_std)}) → đã ÁNH XẠ CỘT THEO TIÊU ĐỀ; nên rà lại.")
    elif src_ma_col is None:
        warnings.append(f"Không tìm thấy cột '{cfg['last_hdr'].upper()}' → có thể lệch cột, cần kiểm tra tay.")

    dia_ban_col = offset + cfg["dia_ban_rel"]
    unit_name = detect_unit_name(ws, dia_ban_col, unit_hint)
    he_col, con_col = detect_columns(ws, kind, hdr, stt_col, data_start)
    mode = "cột" if he_col else "nhóm"
    dropped_con = 0

    # Tìm TIÊU ĐỀ HỆ ĐẦU TIÊN trong sheet (dò cả hàng, không chỉ cột STT).
    STD = ["PC01", "PC02", "PC03", "PC04", "CAP"]
    first_he = None
    if he_col is None:
        for i in range(data_start, ws.max_row + 1):
            if is_footer(ws, i, maxcol): continue
            h = he_in_row(ws, i, stt_col, offset, maxcol)   # tiêu đề (kể cả khi có STT)
            if h and not row_has_case_data(ws, i, offset, n_std, col_map):
                first_he = h; break
    # Các dòng NẰM TRƯỚC tiêu đề đầu tiên: suy ra là hệ đứng NGAY TRƯỚC nó theo
    # thứ tự chuẩn (vd tiêu đề đầu là PC02 -> các dòng trước là PC01). KHÔNG mặc
    # định PC01; nếu tiêu đề đầu đã là hệ số 1 thì để None (?), tránh gán sai khi
    # đơn vị đặt CAP/khác lên đầu.
    cur_he = None
    if he_col is None and first_he in STD:
        idx = STD.index(first_he)
        cur_he = STD[idx - 1] if idx >= 1 else None
    qtdc_pos = cfg.get("qtdc", 8 if kind == "3A" else 9)   # cột Quyết định TĐC (để nhận vụ thật)
    rows = []; unknown = 0
    section_had_gap = False   # trong mục hệ hiện tại đã gặp dòng trống chưa
    section_gap_warned = False
    for i in range(data_start, ws.max_row + 1):
        # DÒNG TIÊU ĐỀ HỆ trước (kể cả khi dòng đó có STT, vd Vĩnh Hưng đặt
        # 'II. Hệ...' vào cột Tội danh của dòng vẫn đánh số) -> đổi hệ, KHÔNG đếm.
        hh = he_in_row(ws, i, stt_col, offset, maxcol)
        if hh and not row_has_case_data(ws, i, offset, n_std, col_map):
            cur_he = hh
            section_had_gap = False; section_gap_warned = False   # sang mục mới
            continue
        # DÒNG VỪA LÀ TIÊU ĐỀ HỆ (đặt ở CỘT STT) VỪA CÓ DỮ LIỆU VỤ (vd Sóc Sơn
        # ghi '2. Hệ CSĐT...TTXH' vào cột STT của vụ đầu tiên) -> cập nhật hệ rồi
        # VẪN đếm. Chỉ nhận tiêu đề ở CỘT STT để tránh nhầm ghi chú 'PC02 vừa bàn
        # giao' nằm ở cột Tội danh (Gia Lâm).
        he_stt = is_he_header(cv(ws, i, stt_col))
        if he_stt and row_has_case_data(ws, i, offset, n_std, col_map):
            cur_he = he_stt
            section_had_gap = False; section_gap_warned = False   # sang mục mới
        # DÒNG SỐ THỨ TỰ CỘT (2,3,4,...,34) đơn vị để lẫn -> KHÔNG phải vụ, bỏ qua.
        if is_colnum_row(ws, i, offset, n_std, col_map):
            warnings.append(f"[BỎ QUA] Hàng {i}: dòng đánh số thứ tự cột "
                            f"(2,3,4,...), không phải vụ → không tính.")
            continue
        sval = cv(ws, i, stt_col)
        has_stt = is_int_stt(sval)
        # QUYẾT ĐỊNH ĐẾM HAY KHÔNG DỰA VÀO NỘI DUNG HÀNG, KHÔNG DỰA VÀO STT.
        if not has_stt:
            # Không có STT: footer -> dừng; còn lại chỉ tính nếu ĐỦ DẤU HIỆU CHẶT
            # (Tội danh + Mã/QĐ TĐC) để tránh dòng rác 'Column2', '(2)', 'tổng'...
            # (vd Sơn Đồng vụ án hàng 31 đơn vị quên đánh số nhưng là vụ thật).
            if is_footer(ws, i, maxcol):
                break
            if not is_strong_case_row(ws, i, offset, n_std, col_map, qtdc_pos):
                continue
        else:
            # Có STT nhưng thực ra là dòng chữ ký/nhãn (vd 'THỦ TRƯỞNG ĐƠN VỊ',
            # '(Ký tên...)' đặt nhầm trên hàng có đánh số) -> bỏ qua im lặng, không
            # coi là vụ, không cảnh báo.
            if is_footer(ws, i, maxcol):
                continue
            # Có STT: phân loại theo nội dung.
            rk = classify_case_row(ws, i, offset, n_std, col_map, qtdc_pos)
            if rk == "empty":
                section_had_gap = True       # có khoảng trống trong mục hệ
                continue                    # placeholder trống (hệ không có vụ)
            if rk == "stray":
                # Chỉ có ô lẻ (vd chỉ mỗi tên 'Phạm Thị Liên'), thiếu Tội danh/Mã/
                # QĐ TĐC -> KHÔNG tính là 1 vụ, GHI CHÚ vào báo cáo để rà tay.
                stray_txt = ""
                for c in range(2, n_std + 1):
                    v = src_val(ws, i, c, offset, col_map)
                    if _real_cell(v):
                        stray_txt = norm(v)[:40]; break
                warnings.append(f"[BỎ QUA - CẦN KIỂM TRA] Hàng {i} (STT "
                                f"{norm(sval)}): chỉ có nội dung lẻ "
                                f"'{stray_txt}', thiếu Tội danh/Mã/Quyết định TĐC "
                                f"→ KHÔNG tính là 1 vụ. Rà lại file gốc.")
                continue
            # rk == "case" -> đếm
            # VỤ XUẤT HIỆN SAU KHOẢNG TRỐNG trong cùng mục hệ -> nghi đơn vị đặt
            # tiêu đề hệ kế tiếp SAI CHỖ (vd Sóc Sơn 3A: 6 vụ kinh tế gõ phía trên
            # dòng '3. Hệ kinh tế'). Ghi cảnh báo để rà phân hệ (KHÔNG đổi số đếm).
            if section_had_gap and not section_gap_warned:
                warnings.append(f"[NGHI PHÂN HỆ SAI - CẦN KIỂM TRA] Có vụ (hàng {i}, "
                                f"STT {norm(sval)}, hệ đang gán {cur_he or '?'}) nằm SAU "
                                f"khoảng trống trong cùng mục hệ → có thể tiêu đề hệ kế "
                                f"tiếp bị đặt xuống dưới, rà lại phân hệ đoạn này.")
                section_gap_warned = True
        # bộ lọc CÒN
        if con_col is not None:
            tt = na(cv(ws, i, con_col))
            if not tt.startswith("con"):   # chỉ giữ 'còn'
                dropped_con += 1; continue
        # xác định hệ: ưu tiên cột Hệ; ô cột Hệ để trống thì lấy theo dòng
        # tiêu đề nhóm gần nhất (nhiều ĐV vừa có cột Hệ vừa có dòng nhóm).
        if he_col is not None:
            he = he_from_cell(cv(ws, i, he_col)) or cur_he
        else:
            he = cur_he
        if he is None:
            unknown += 1
        if col_map is not None:   # mẫu khác chuẩn: đổ theo ánh xạ tiêu đề
            vals = [cv(ws, i, col_map[p]) if p in col_map else None
                    for p in range(1, n_std + 1)]
        else:                     # mẫu chuẩn: chép theo vị trí (dịch theo offset)
            vals = [cv(ws, i, offset + c) for c in range(1, n_std + 1)]
        rows.append({"vals": vals, "he": he, "src_row": i})

    if unknown:
        warnings.append(f"{unknown}/{len(rows)} dòng CHƯA XÁC ĐỊNH được Hệ "
                        f"(file không chia nhóm Hệ và không có cột 'Hệ') → cột Hệ để '?', cần điền tay.")

    info = f"căn cột: neo cột {get_column_letter(stt_col)} (dịch {offset:+d}); Hệ theo {mode}"
    if con_col is not None:
        info += f"; lọc 'còn' ở cột {get_column_letter(con_col)} (bỏ {dropped_con} dòng đã kết thúc)"
    warnings.insert(0, "[thông tin] " + info)
    return rows, warnings, unit_name

def find_self_total(ws):
    """Tìm số đơn vị tự chốt: 'CHỐT ... còn: N', hoặc số lẻ ở dòng ngay trên tiêu đề."""
    for i in range(1, ws.max_row + 1):
        t = norm(cv(ws, i, 1))
        m = re.search(r"ch[oố]t.*?c[oò]n[:\s]*([0-9]+)", t, flags=re.I)
        if m: return int(m.group(1))
    return None

def is_cum_doi_pc01(*names):
    """Đơn vị 'Cụm 1..8 PC01' hoặc 'Đội 1..4 PC01' -> toàn bộ vụ thuộc Hệ PC01."""
    for nm in names:
        t = na(nm)
        if not t:
            continue
        has_cd = bool(re.search(r"\bcum\b", t) or re.search(r"\bdoi\b", t)
                      or re.search(r"(cum|doi)\s*\d", t))
        has_pc01 = bool(re.search(r"pc\s*0?1\b", t) or "pc01" in t)
        if has_cd and has_pc01:
            return True
    return False

def load_unit_wb(path):
    """Mở file đơn vị (lấy GIÁ TRỊ đã tính của công thức). Mỗi file chỉ mở 1 lần
    rồi dùng chung cho phân loại + trích 3A/3B + 3C/3D + PL7/PL8.

    Đọc dạng LUỒNG (read_only) và chỉ chép các ô CÓ GIÁ TRỊ sang 1 workbook gọn:
    file bị tô viền/màu cả cột, cả sheet (hàng trăm nghìn ô trống có định dạng)
    không còn làm chậm/treo, và max_row/max_column = đúng vùng có dữ liệu."""
    src = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        wb = openpyxl.Workbook(); wb.remove(wb.active)
        for s in src.worksheets:
            ws = wb.create_sheet(s.title)
            if not hasattr(s, "iter_rows"):      # chartsheet: không có ô
                continue
            s.reset_dimensions()   # không tin thẻ kích thước ghi trong file (hay sai)
            for row in s.iter_rows():
                for c in row:
                    v = c.value
                    if v is None:
                        continue          # ô trống (kể cả ô chỉ có định dạng)
                    cell = ws.cell(c.row, c.column)
                    try:
                        cell.value = v
                    except Exception:     # ký tự điều khiển lạ trong chữ -> giữ nguyên
                        cell._value = v; cell.data_type = "s"
        return wb
    finally:
        src.close()

def process_unit_file(path, std_keys=None, unit_hint=None, wb=None):
    wb = wb or load_unit_wb(path)
    # unit_hint = tên THƯ MỤC con (nếu để file trong thư mục đơn vị) hoặc tên file
    unit_hint = unit_hint or re.sub(r"\.(xlsx|xlsm)$", "", os.path.basename(path), flags=re.I)
    res = {"file": os.path.basename(path), "3A": [], "3B": [], "warnings": [],
           "unit_name": None, "diaban": None, "fname": unit_hint,
           "self_total": {}, "sheets_used": {}}
    picks = pick_best_sheets(wb)
    # phát hiện file CHỈ có Phụ lục tổng hợp 07/08 (không có danh sách chi tiết)
    if not picks["3A"] and not picks["3B"]:
        names = " ".join(na(s) for s in wb.sheetnames)
        if "thong ke" in names or "phu luc" in names:
            res["warnings"].append("[LOẠI FILE] Đây là PHỤ LỤC TỔNG HỢP 07/08 (chỉ có số liệu đã cộng, "
                                   "KHÔNG có danh sách chi tiết 3A/3B) → không nối dòng được. "
                                   "Cần yêu cầu đơn vị gửi bản Mẫu 3A/3B chi tiết.")
    for kind in ("3A", "3B"):
        sheet = picks[kind]
        if not sheet:
            res["warnings"].append(f"[{kind}] Không tìm thấy sheet {kind} phù hợp trong file → BỎ QUA, kiểm tra tay.")
            continue
        res["sheets_used"][kind] = sheet
        sk = std_keys.get(kind) if std_keys else None
        rows, warns, uname = extract_from_sheet(wb[sheet], kind, unit_hint, sk)
        res[kind] = rows
        res["warnings"] += [f"[{kind}:{sheet}] {w}" for w in warns]
        if uname and not res["diaban"]: res["diaban"] = uname
        st = find_self_total(wb[sheet])
        if st is not None: res["self_total"][kind] = st
    res["unit_name"] = clean_name_from_file(unit_hint) or res["diaban"] or unit_hint
    # ĐƠN VỊ Cụm/Đội PC01 -> toàn bộ vụ việc/vụ án thuộc Hệ PC01 (bỏ qua nhận diện Hệ).
    if is_cum_doi_pc01(unit_hint, res["diaban"], res["unit_name"]):
        n = 0
        for kind in ("3A", "3B"):
            for row in res[kind]:
                if row["he"] != "PC01":
                    row["he"] = "PC01"; n += 1
        res["warnings"].append(f"[HỆ] Đơn vị Cụm/Đội PC01 → gán toàn bộ {len(res['3A'])+len(res['3B'])} vụ vào Hệ PC01.")
    return res

# Từ nhiễu ĐƠN LẺ: chỉ gồm những từ KHÔNG trùng với tên xã/phường.
# (bản cũ bỏ cả 'an', 'tam', 'dinh', 'chi', 'so', 'loc'... -> 'An Khánh' thành 'Khánh',
#  'Tam Hiệp' thành 'Hiệp', 'Vân Đình' thành 'Vân', 'Phúc Lộc' thành 'Phúc')
NOISE_TOKENS = {"mau", "3ab", "3cd", "thang", "cax", "cap", "ca", "catp", "hn", "nhat",
                "chot", "tdc", "tdct9", "copy", "ds", "va", "vu", "viec", "final", "bc",
                "sl", "ngay", "ban"}
# Từ nhiễu dạng CỤM: chỉ bỏ khi đứng liền nhau đúng cụm.
NOISE_PHRASES = sorted((tuple(p.split()) for p in [
    "tam dinh chi", "dinh chi", "phu luc", "danh sach", "hien con", "den ngay",
    "moi nhat", "ban moi", "ban loc", "da loc", "vu an", "vu viec", "don vi",
    "toan bo", "so lieu", "giai quyet", "thong ke", "bao cao"]), key=len, reverse=True)
_RE_NOISE = re.compile(r"t\d{1,2}|3[a-d]{1,2}|pl\d*|[a-d]|\d+")   # T9, 3A, 3C, PL7, 'B' trong '3A-B', số

def clean_name_from_file(fname):
    """Rút tên đơn vị từ TÊN FILE bằng cách bỏ các cụm/từ nhiễu."""
    base = re.sub(r"\.(xlsx|xlsm)$", "", fname, flags=re.I)
    base = re.sub(r"[_\-.,()]+", " ", base)
    words = base.split(); keys = [na(w) for w in words]; keep = [True] * len(words)
    for ph in NOISE_PHRASES:
        n = len(ph)
        for i in range(len(keys) - n + 1):
            if tuple(keys[i:i + n]) == ph:
                keep[i:i + n] = [False] * n
    out = []
    for i, (w, k, ok) in enumerate(zip(words, keys, keep)):
        if not ok or not k or k in NOISE_TOKENS: continue
        # giữ SỐ ngay sau 'Cụm'/'Đội' ('Cụm 3 PC01'), nếu không 8 cụm trùng tên nhau
        if k.isdigit() and i > 0 and keys[i - 1] in ("cum", "doi"):
            out.append(w); continue
        if _RE_NOISE.fullmatch(k): continue
        out.append(w)
    name = " ".join(out).strip()
    return name if name else None

# ---------- Đọc Phụ lục biểu ngang để đối chiếu ----------
def _pl_key(name):
    key = re.sub(r"^công an\s+(xã|phường|thị trấn)\s+", "", name, flags=re.I)
    key = na(re.sub(r"^(xã|phường|thị trấn)\s+", "", key, flags=re.I))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", key)).strip()

def load_phuluc(path):
    """Đọc Phụ lục biểu ngang. Mỗi đơn vị:
      vviec/van       = số HIỆN CÒN (cột D/E) -> đối chiếu 3A/3B
      vviec_gq/van_gq = số ĐÃ GIẢI QUYẾT/PHỤC HỒI (cột G/H) -> đối chiếu 3C/3D (nếu có)
    """
    if not path or not os.path.exists(path): return {}
    wb = openpyxl.load_workbook(path, data_only=True); ws = wb.active
    d = {}
    for i in range(1, ws.max_row + 1):
        name = norm(cv(ws, i, 2))
        vviec = cv(ws, i, 4); van = cv(ws, i, 5)
        if name and isinstance(vviec, (int, float)) and isinstance(van, (int, float)):
            gq_vv = cv(ws, i, 7); gq_va = cv(ws, i, 8)
            d[_pl_key(name)] = {"vviec": int(vviec), "van": int(van), "ten": name,
                                "vviec_gq": int(gq_vv) if isinstance(gq_vv, (int, float)) else None,
                                "van_gq": int(gq_va) if isinstance(gq_va, (int, float)) else None}
    return d

def match_phuluc(candidates, pl):
    """candidates: list chuỗi (tên file, địa bàn, tên ĐV). Khớp key Phụ lục là chuỗi con,
    ưu tiên key DÀI nhất để tránh khớp nhầm (vd 'Đông' khớp nhiều nơi)."""
    # thử LẦN LƯỢT từng ứng viên theo thứ tự ưu tiên (tên file > tên ĐV > địa bàn);
    # địa bàn hay chứa tên huyện cũ (vd 'Thạch Thất') gây khớp nhầm nên để cuối.
    for c in candidates:
        if not c: continue
        cc = re.sub(r"[^a-z0-9]+", " ", na(c))
        best = None; best_len = 0
        for key, v in pl.items():
            if not key or len(key) < 3: continue
            if key in cc and len(key) > best_len:
                best = v; best_len = len(key)
        if best:
            return best
    return None

# ---------- Ghi FILE TỔNG ----------
def _clear_data_area(ws, data_start):
    """Xoá dữ liệu cũ từ dòng data_start trở xuống: gỡ ô gộp (ghi vào ô gộp sẽ lỗi
    'MergedCell ... read-only') và chỉ xoá các ô ĐANG CÓ, không tạo thêm ô trống."""
    for mr in list(ws.merged_cells.ranges):
        if mr.bounds[3] >= data_start: ws.unmerge_cells(str(mr))
    for (r, c), cell in list(ws._cells.items()):
        if r >= data_start and cell.value is not None:
            cell.value = None

def build_master(master_path, units, out_path):
    wb = openpyxl.load_workbook(master_path)
    picks = pick_best_sheets(wb)
    target = {picks["3A"]: "3A", picks["3B"]: "3B"}
    plan = {}
    for ws in wb.worksheets:
        kind = target.get(ws.title)
        if not kind: continue
        cfg = SHEET_CFG[kind]
        hdr, stt_col = find_header(ws)
        hdr = hdr or (2 if kind == "3A" else 1)
        data_start = None
        for i in range(hdr, hdr + 9):
            if is_int_stt(cv(ws, i, 1)): data_start = i; break
        if data_start is None: data_start = hdr + (3 if kind == "3A" else 4)
        n_std = cfg["n_std"]; col_dv = n_std + 1; col_he = n_std + 2; col_cnt = n_std + 3
        styles = {c: ws.cell(data_start, c)._style for c in range(1, col_cnt + 1)} \
                 if cv(ws, data_start, 1) not in (None, "") else {}
        _clear_data_area(ws, data_start)
        plan[ws.title] = dict(kind=kind, start=data_start, col_dv=col_dv, col_he=col_he,
                              col_cnt=col_cnt, n_std=n_std, styles=styles)
    written = {}
    for ws in wb.worksheets:
        if ws.title not in plan: continue
        p = plan[ws.title]; kind = p["kind"]; r = p["start"]; stt = 0
        for u in units:
            for row in u[kind]:
                stt += 1
                for c in range(1, p["n_std"] + 1):
                    cell = ws.cell(r, c); cell.value = row["vals"][c - 1]
                    if p["styles"].get(c) is not None: cell._style = p["styles"][c]
                ws.cell(r, 1).value = stt
                ws.cell(r, p["col_dv"]).value = u["unit_name"]
                ws.cell(r, p["col_he"]).value = row["he"] or "?"
                ws.cell(r, p["col_cnt"]).value = 1
                for c in (p["col_dv"], p["col_he"], p["col_cnt"]):
                    if p["styles"].get(c) is not None: ws.cell(r, c)._style = p["styles"][c]
                r += 1
        written[kind] = stt
    wb.save(out_path)
    return written

# ============================================================================
#  3C / 3D  (Vụ việc / Vụ án đã giải quyết-phục hồi) — dùng lại engine 3A/3B
# ============================================================================
def pick_3cd(wb):
    """Chọn sheet 3C/3D. Ưu tiên CỘT ĐẶC TRƯNG (sheet_cd_signature), rồi tới tên sheet.
    Nếu 1 sheet vừa có dấu hiệu 3C/3D vừa cho biết là vụ việc/vụ án -> phân đúng loại."""
    best = {"3C": (0, None), "3D": (0, None)}
    for ws in wb.worksheets:
        n = na(ws.title); sig = sheet_cd_signature(ws); s3c = s3d = 0
        if sig == "3C": s3c = 9
        if sig == "3D": s3d = 9
        if n == "3c" or n.startswith("3c ") or n.startswith("3c_"): s3c = max(s3c, 10)
        if n == "3d" or n.startswith("3d ") or n.startswith("3d_"): s3d = max(s3d, 10)
        # sheet tên 'vụ việc/vụ án' + có dấu hiệu 3C/3D -> phân theo việc/án
        if sig and "vu an" in n: s3d = max(s3d, 9); s3c = 0
        if sig and "vu viec" in n: s3c = max(s3c, 9); s3d = 0
        if s3c > best["3C"][0]: best["3C"] = (s3c, ws.title)
        if s3d > best["3D"][0]: best["3D"] = (s3d, ws.title)
    return {"3C": best["3C"][1], "3D": best["3D"][1]}

def std_keys_3cd(master_path):
    wb = openpyxl.load_workbook(master_path); picks = pick_3cd(wb); out = {}
    for kind in ("3C", "3D"):
        if not picks[kind]: continue
        ws = wb[picks[kind]]; n_std = SHEET_CFG[kind]["n_std"]
        hdr, stt = find_header(ws)
        if hdr is None: continue
        ds = None
        for i in range(hdr, hdr + 9):
            if is_int_stt(cv(ws, i, 1)): ds = i; break
        ds = ds or hdr + 4
        out[kind] = [(c, flat_key(ws, list(range(hdr, ds)), c)) for c in range(1, n_std + 1)]
    return out

def process_unit_3cd(path, std_keys=None, unit_hint=None, wb=None):
    wb = wb or load_unit_wb(path); picks = pick_3cd(wb)
    unit_hint = unit_hint or re.sub(r"\.(xlsx|xlsm)$", "", os.path.basename(path), flags=re.I)
    res = {"file": os.path.basename(path), "3C": [], "3D": [], "warnings": [],
           "unit_name": None, "diaban": None, "fname": unit_hint, "sheets_used": {}}
    for kind in ("3C", "3D"):
        if not picks[kind]:
            res["warnings"].append(f"[{kind}] Không tìm thấy sheet {kind} → BỎ QUA."); continue
        res["sheets_used"][kind] = picks[kind]
        sk = std_keys.get(kind) if std_keys else None
        rows, warns, uname = extract_from_sheet(wb[picks[kind]], kind, unit_hint, sk)
        res[kind] = rows
        res["warnings"] += [f"[{kind}:{picks[kind]}] {w}" for w in warns]
        if uname and not res["diaban"]: res["diaban"] = uname
    res["unit_name"] = clean_name_from_file(unit_hint) or res["diaban"] or unit_hint
    if is_cum_doi_pc01(unit_hint, res["diaban"], res["unit_name"]):
        for kind in ("3C", "3D"):
            for row in res[kind]: row["he"] = "PC01"
        res["warnings"].append("[HỆ] Đơn vị Cụm/Đội PC01 → gán toàn bộ vụ 3C/3D vào Hệ PC01.")
    return res

def build_master_3cd(master_path, units, out_path):
    wb = openpyxl.load_workbook(master_path); picks = pick_3cd(wb)
    target = {picks["3C"]: "3C", picks["3D"]: "3D"}; plan = {}
    for ws in wb.worksheets:
        kind = target.get(ws.title)
        if not kind: continue
        cfg = SHEET_CFG[kind]; n_std = cfg["n_std"]
        hdr, stt_col = find_header(ws)
        hdr = hdr or 1   # mẫu không có ô 'STT' -> coi dòng 1 là tiêu đề thay vì crash
        data_start = None
        for i in range(hdr, hdr + 9):
            if is_int_stt(cv(ws, i, 1)): data_start = i; break
        if data_start is None: data_start = hdr + 5
        col_dv = n_std + 1; col_he = n_std + 2; col_cnt = n_std + 3
        if not norm(cv(ws, hdr, col_dv)): ws.cell(hdr, col_dv).value = "Đơn vị"
        if not norm(cv(ws, hdr, col_he)): ws.cell(hdr, col_he).value = "Hệ"
        if not norm(cv(ws, hdr, col_cnt)): ws.cell(hdr, col_cnt).value = "Đếm"
        styles = {c: ws.cell(data_start, c)._style for c in range(1, col_cnt + 1)} \
                 if cv(ws, data_start, 1) not in (None, "") else {}
        _clear_data_area(ws, data_start)
        plan[ws.title] = dict(kind=kind, start=data_start, col_dv=col_dv, col_he=col_he,
                              col_cnt=col_cnt, n_std=n_std, styles=styles)
    written = {}
    for ws in wb.worksheets:
        if ws.title not in plan: continue
        p = plan[ws.title]; kind = p["kind"]; r = p["start"]; stt = 0
        for u in units:
            for row in u[kind]:
                stt += 1
                for c in range(1, p["n_std"] + 1):
                    cell = ws.cell(r, c); cell.value = row["vals"][c - 1]
                    if p["styles"].get(c) is not None: cell._style = p["styles"][c]
                ws.cell(r, 1).value = stt
                ws.cell(r, p["col_dv"]).value = u["unit_name"]
                ws.cell(r, p["col_he"]).value = row["he"] or "?"
                ws.cell(r, p["col_cnt"]).value = 1
                r += 1
        written[kind] = stt
    wb.save(out_path); return written

# ============================================================================
#  PL7 / PL8  (biểu thống kê dọc -> biểu ngang tổng hợp)
# ============================================================================
PL_NOT_UNIT = {"stt", "danh muc thong ke", "tong so", "ghi chu", "vu", "bc", ""}

def _pl_num(v):
    if isinstance(v, bool): return 0
    if isinstance(v, (int, float)): return v
    s = norm(v).replace(",", "")
    return float(s) if re.fullmatch(r"-?\d+(\.\d+)?", s) else 0

def _pl_is_breakdown(lab):
    return bool(re.match(r"^(cum|doi)\s*\d", na(lab)))

def _pl_find_hdr(ws):
    for i in range(1, min(12, ws.max_row) + 1):
        rv = [na(cv(ws, i, c)) for c in range(1, min(ws.max_column, 12) + 1)]
        if "stt" in rv and any("danh muc" in v for v in rv):
            return i, rv.index("stt") + 1
    return 4, 1

def _pl_codes(ws, hdr, stt_c):
    out = {}
    for i in range(hdr + 1, ws.max_row + 1):
        code = norm(cv(ws, i, stt_c))
        if re.fullmatch(r"\d+(\.\d+)*", code): out[code] = i
    return out

def is_pl_sheet(ws):
    """PL7/PL8 = biểu thống kê dọc: có 'danh mục thống kê'."""
    joined = " ".join(na(cv(ws, r, c)) for r in range(1, 6)
                      for c in range(1, min(ws.max_column, 10) + 1))
    if "danh muc thong ke" not in joined: return None
    if "vu an" in joined: return "PL8"
    if "vu viec" in joined: return "PL7"
    return None

def read_unit_pl78(path, wb=None):
    wb = wb or load_unit_wb(path)
    res = {"PL7": {}, "PL8": {}}
    for ws in wb.worksheets:
        ns = na(ws.title)
        # tên sheet: PL7/07/'thống kê sl vụ việc'  |  PL8/08/'thống kê sl vụ án'
        if "pl7" in ns or ns == "07" or ("thong ke sl" in ns and "vu viec" in ns):
            kind = "PL7"
        elif "pl8" in ns or ns == "08" or ("thong ke sl" in ns and "vu an" in ns):
            kind = "PL8"
        else:
            kind = is_pl_sheet(ws)
        if kind not in ("PL7", "PL8"): continue
        hdr, stt_c = _pl_find_hdr(ws)
        tong_c = None
        for i in range(hdr, hdr + 3):
            for c in range(stt_c + 1, ws.max_column + 1):
                if na(cv(ws, i, c)) == "tong so": tong_c = c; break
            if tong_c: break
        if tong_c is None: tong_c = stt_c + 3
        for code, r in _pl_codes(ws, hdr, stt_c).items():
            if kind == "PL7":
                res["PL7"][code] = _pl_num(cv(ws, r, tong_c))
            else:
                res["PL8"][code] = (_pl_num(cv(ws, r, tong_c)), _pl_num(cv(ws, r, tong_c + 1)))
    return res

def _pl_unit_hdr_row(ws, hdr, stt_c):
    """Dòng chứa NHÃN đơn vị: ở sheet chính là chính dòng tiêu đề (hdr),
    ở 2 sheet con PC01 nhãn đơn vị nằm TRÊN dòng tiêu đề 1 dòng (row 3)."""
    def _cnt(row):
        n = 0
        for c in range(stt_c + 1, ws.max_column + 1):
            v = na(cv(ws, row, c))
            if (v and v not in PL_NOT_UNIT and "phu luc" not in v
                    and "kiem tra" not in v and "moc thoi gian" not in v):
                n += 1
        return n
    best, bn = hdr, _cnt(hdr)
    for row in (hdr - 1, hdr - 2):
        if row >= 1:
            n = _cnt(row)
            if n > bn: best, bn = row, n
    return best

def _pl_unit_cols(ws, lab_row, kind):
    units = []
    # ws.max_column phải quét toàn bộ ô mỗi lần gọi -> chỉ tính 1 lần
    for c in range(1, ws.max_column + 1):
        lab = norm(cv(ws, lab_row, c)); nlab = na(lab)
        skip = (not lab or nlab in PL_NOT_UNIT or "phu luc" in nlab
                or "kiem tra" in nlab or "moc thoi gian" in nlab)
        if not skip:
            key = _pl_key(lab)
            if key and key not in PL_NOT_UNIT and re.search(r"[a-z]", key):
                units.append((key, lab, c, c + 1) if kind == "PL8" else (key, lab, c))
    return units

def _pl_match(fkey, umap):
    if fkey in umap: return fkey
    best, blen = None, 0
    for k in umap:
        if len(k) >= 2 and (k in fkey or fkey in k) and len(k) > blen: best, blen = k, len(k)
    return best

def _pl_prep_sheet(ws, kind):
    """Đọc cấu trúc 1 sheet biểu ngang + xoá sạch các ô số liệu đơn vị."""
    hdr, stt_c = _pl_find_hdr(ws)
    codes = _pl_codes(ws, hdr, stt_c)
    lab_row = _pl_unit_hdr_row(ws, hdr, stt_c)
    units = _pl_unit_cols(ws, lab_row, kind)
    tong_c = None
    for c in range(stt_c + 1, ws.max_column + 1):
        if na(cv(ws, hdr, c)) == "tong so": tong_c = c; break
    for r in codes.values():
        for u in units:
            ws.cell(r, u[2]).value = None
            if kind == "PL8": ws.cell(r, u[3]).value = None
    return dict(ws=ws, hdr=hdr, stt_c=stt_c, codes=codes, lab_row=lab_row,
                units=units, umap={u[0]: u for u in units}, tong_c=tong_c)

def _pl_fill(info, kind, dv_list):
    """Điền số liệu các đơn vị trong dv_list vào các cột tương ứng."""
    ws = info["ws"]; codes = info["codes"]; umap = info["umap"]
    matched = 0; unmatched = []
    for fkey, base, data in dv_list:
        d = data[kind]
        if not d: continue
        mk = _pl_match(fkey, umap)
        if not mk: unmatched.append(base); continue
        u = umap[mk]; matched += 1
        for code, r in codes.items():
            if code not in d: continue
            if kind == "PL7": ws.cell(r, u[2]).value = d[code]
            else:
                vu, bc = d[code]; ws.cell(r, u[2]).value = vu; ws.cell(r, u[3]).value = bc
    return matched, unmatched

def _pl_tong(info, kind, sum_all):
    """Cột Tổng số = cộng ngang. sheet con: cộng TẤT CẢ cột; sheet chính: bỏ cột
    'Cụm/Đội' (chi tiết) để tránh đếm trùng."""
    ws = info["ws"]; tc = info["tong_c"]
    if not tc: return
    us = info["units"] if sum_all else [u for u in info["units"] if not _pl_is_breakdown(u[1])]
    for r in info["codes"].values():
        ws.cell(r, tc).value = sum(_pl_num(cv(ws, r, u[2])) for u in us)
        if kind == "PL8":
            ws.cell(r, tc + 1).value = sum(_pl_num(cv(ws, r, u[3])) for u in us)

def build_pl78(mau_path, dv_pl, out_path, qc_path):
    wb = openpyxl.load_workbook(mau_path)
    # tách đơn vị: Cụm 1..8 PC01 / Đội 1..4 PC01 -> 2 sheet con; còn lại -> sheet chính
    pc01_dv = [x for x in dv_pl if is_cum_doi_pc01(x[1], x[0])]
    main_dv = [x for x in dv_pl if x not in pc01_dv]

    def find_sheet(need, is_pc01):
        cand = [ws for ws in wb.worksheets
                if need in na(ws.title) and ("pc01" in na(ws.title)) == is_pc01]
        return max(cand, key=lambda w: w.max_column) if cand else None
    sh = {("PL7", 1): find_sheet("vu viec", True),  ("PL7", 0): find_sheet("vu viec", False),
          ("PL8", 1): find_sheet("vu an", True),    ("PL8", 0): find_sheet("vu an", False)}

    stats = {}
    for kind in ("PL7", "PL8"):
        main_ws = sh[(kind, 0)]; sub_ws = sh[(kind, 1)]
        sub_info = None
        # 1) sheet con PC01: điền các Cụm/Đội PC01, tính Tổng (= cộng tất cả cột)
        if sub_ws is not None:
            sub_info = _pl_prep_sheet(sub_ws, kind)
            m_sub, un_sub = _pl_fill(sub_info, kind, pc01_dv)
            _pl_tong(sub_info, kind, sum_all=True)
        # 2) sheet chính: điền PC02..xã/phường, rồi CHÈN Tổng PC01 con vào cột PC01
        if main_ws is not None:
            main_info = _pl_prep_sheet(main_ws, kind)
            m_mn, un_mn = _pl_fill(main_info, kind, main_dv)
            if sub_info is not None:
                pc01_u = next((u for u in main_info["units"]
                               if re.fullmatch(r"pc\s*0?1", na(u[1]))), None)
                if pc01_u is not None and sub_info["tong_c"]:
                    for code, r in main_info["codes"].items():
                        sr = sub_info["codes"].get(code)
                        if sr is None: continue
                        main_ws.cell(r, pc01_u[2]).value = \
                            cv(sub_info["ws"], sr, sub_info["tong_c"])
                        if kind == "PL8":
                            main_ws.cell(r, pc01_u[3]).value = \
                                cv(sub_info["ws"], sr, sub_info["tong_c"] + 1)
            # 3) Tổng số sheet chính (sau khi đã có cột PC01)
            _pl_tong(main_info, kind, sum_all=False)
            stats[kind] = dict(matched=m_mn, cols=len(main_info["units"]), unmatched=un_mn,
                               matched_pc01=(m_sub if sub_info else 0),
                               cols_pc01=(len(sub_info["units"]) if sub_info else 0),
                               unmatched_pc01=(un_sub if sub_info else []))
        elif sub_info is not None:
            stats[kind] = dict(matched=0, cols=0, unmatched=[],
                               matched_pc01=m_sub, cols_pc01=len(sub_info["units"]),
                               unmatched_pc01=un_sub)
    wb.save(out_path)
    wq = openpyxl.Workbook(); wsq = wq.active; wsq.title = "Doi soat PL78"
    wsq.append(["Loại", "Sheet chính: đơn vị khớp", "Số cột", "KHÔNG khớp (chính)",
                "PC01 con: Cụm/Đội khớp", "Số cột con", "KHÔNG khớp (con)"])
    for kind in ("PL7", "PL8"):
        if kind in stats:
            s = stats[kind]
            wsq.append([kind, s["matched"], s["cols"], "; ".join(s["unmatched"]) or "(không)",
                        s["matched_pc01"], s["cols_pc01"], "; ".join(s["unmatched_pc01"]) or "(không)"])
    wq.save(qc_path)
    return stats

# ============================================================================
#  BÁO CÁO đối chiếu (3A/3B và 3C/3D dùng chung khung, khác cột Phụ lục)
# ============================================================================
def _build_report(units, kinds, pl_field, out_path, nguong):
    """kinds=('3A','3B') hoặc ('3C','3D'); pl_field=('vviec','van') hoặc ('vviec_gq','van_gq')."""
    from openpyxl import Workbook
    ka, kb = kinds; fa, fb = pl_field
    la = "VViệc" if ka in ("3A", "3C") else ka
    wbq = Workbook(); ws = wbq.active; ws.title = "Tong hop"
    ws.append(["File", "Đơn vị", "PC01", "PC02", "PC03", "PC04", "CAP", "Chưa rõ Hệ",
               f"{ka} (máy)", f"{kb} (máy)", "Tổng (máy)",
               f"{ka} (Phụ lục)", f"{kb} (Phụ lục)", f"Lệch {ka}", f"Lệch {kb}",
               "Vượt ngưỡng?", "Số cảnh báo"])
    HE = ["PC01", "PC02", "PC03", "PC04", "CAP"]
    for u in units:
        cnt = {h: 0 for h in HE}; unk = 0
        for kk in kinds:
            for row in u[kk]:
                h = row["he"]
                if h in cnt: cnt[h] += 1
                else: unk += 1
        na_, nb_ = len(u[ka]), len(u[kb])
        p = u.get("phuluc")
        pv = p[fa] if (p and p.get(fa) is not None) else ""
        pa = p[fb] if (p and p.get(fb) is not None) else ""
        da = (na_ - pv) if pv != "" else ""; db = (nb_ - pa) if pa != "" else ""
        over = ""
        if pv != "" or pa != "":
            over = "CÓ" if ((pv != "" and abs(na_ - pv) > nguong) or (pa != "" and abs(nb_ - pa) > nguong)) else "không"
        ws.append([u["file"], u["unit_name"], cnt["PC01"], cnt["PC02"], cnt["PC03"], cnt["PC04"],
                   cnt["CAP"], unk, na_, nb_, na_ + nb_, pv, pa, da, db, over, len(u["warnings"])])
    ws2 = wbq.create_sheet("Canh bao chi tiet"); ws2.append(["File", "Nội dung"])
    for u in units:
        for w in u["warnings"]: ws2.append([u["file"], w])
    wbq.save(out_path)

def _classify(wb):
    """Trả về tập loại {'3AB','3CD','PL78'} mà workbook này có dữ liệu."""
    cats = set()
    p = pick_best_sheets(wb)
    if p.get("3A") or p.get("3B"): cats.add("3AB")
    p = pick_3cd(wb)
    if p["3C"] or p["3D"]: cats.add("3CD")
    for ws in wb.worksheets:
        ns = na(ws.title)
        if ("pl7" in ns or "pl8" in ns or ns in ("07", "08")
                or "thong ke sl" in ns or is_pl_sheet(ws)):
            cats.add("PL78"); break
    return cats

def main():
    ap = argparse.ArgumentParser(description="Gộp 3A/3B, 3C/3D, PL7/PL8 — 3 file tổng + 3 báo cáo")
    ap.add_argument("--don-vi", nargs="+", required=True, help="Thư mục donvi (chứa mọi loại file)")
    ap.add_argument("--mau-3ab", default="mau_chuan.xlsx", help="Mẫu file tổng 3A/3B")
    ap.add_argument("--mau-3cd", default="mau_3C_3D.xlsx", help="Mẫu file tổng 3C/3D")
    ap.add_argument("--mau-pl78", default="mau_PL78.xlsx", help="Mẫu biểu ngang PL7/PL8")
    ap.add_argument("--phu-luc", default="phu_luc.xlsx")
    ap.add_argument("--out-dir", default="ket_qua")
    ap.add_argument("--nguong", type=int, default=50)
    a = ap.parse_args()

    # Thu thập file. Hỗ trợ 2 kiểu:
    #  (a) file .xlsx để TRỰC TIẾP trong donvi  -> tên đơn vị lấy từ TÊN FILE.
    #  (b) THƯ MỤC CON theo đơn vị (vd donvi/Cửa Nam/ chứa 3A,3B,3C,3D,PL7,PL8)
    #      -> tên đơn vị lấy từ TÊN THƯ MỤC CON (mọi file trong đó cùng 1 đơn vị).
    def _ok(fn): return fn.lower().endswith((".xlsx", ".xlsm")) and not fn.startswith("~$")
    def _old(fn): return fn.lower().endswith(".xls") and not fn.startswith("~$")
    items = []   # (path, unit_hint)
    loi = []     # (file, lý do) — file KHÔNG đọc được, báo lại cuối chương trình
    for p in a.don_vi:
        if os.path.isdir(p):
            for entry in sorted(os.listdir(p)):
                full = os.path.join(p, entry)
                if os.path.isdir(full):                       # thư mục con = 1 đơn vị
                    for f in sorted(glob.glob(os.path.join(full, "**", "*"), recursive=True)):
                        if os.path.isfile(f) and _ok(os.path.basename(f)): items.append((f, entry))
                        elif os.path.isfile(f) and _old(os.path.basename(f)): loi.append((f, "định dạng .xls cũ"))
                elif _ok(entry):                              # file rời trong donvi
                    items.append((full, None))
                elif _old(entry):
                    loi.append((full, "định dạng .xls cũ"))
        elif _ok(os.path.basename(p)):
            items.append((p, None))
    os.makedirs(a.out_dir, exist_ok=True)
    pl = load_phuluc(a.phu_luc)
    t0 = time.time()

    # Khóa tiêu đề chuẩn của các mẫu (đọc 1 lần)
    sk_ab = compute_std_keys(a.mau_3ab) if os.path.exists(a.mau_3ab) else None
    sk_cd = std_keys_3cd(a.mau_3cd) if os.path.exists(a.mau_3cd) else None

    # MỖI FILE CHỈ MỞ 1 LẦN: phân loại + trích mọi loại dữ liệu ngay, rồi giải phóng.
    # 1 file lỗi -> ghi vào danh sách lỗi, KHÔNG làm dừng cả chương trình.
    units_ab, units_cd, dv_pl = [], [], []
    cat = {"3AB": 0, "3CD": 0, "PL78": 0}
    for k, (f, hint) in enumerate(items, 1):
        print(f"  [{k}/{len(items)}] {os.path.basename(f)}", flush=True)
        t1 = time.time()
        try:
            wb = load_unit_wb(f)
        except Exception as e:
            loi.append((f, f"không mở được: {e}")); continue
        if time.time() - t1 > 10:
            print(f"      (file nặng, mở mất {time.time() - t1:.0f} giây - thường do "
                  f"tô định dạng cả cột/cả sheet; nên xoá định dạng thừa)", flush=True)
        try:
            cats = _classify(wb)
            for c in cats: cat[c] += 1
            if "3AB" in cats and sk_ab is not None:
                units_ab.append(process_unit_file(f, sk_ab, hint, wb=wb))
            if "3CD" in cats and sk_cd is not None:
                units_cd.append(process_unit_3cd(f, sk_cd, hint, wb=wb))
            if "PL78" in cats:
                base = hint or re.sub(r"\.(xlsx|xlsm)$", "", os.path.basename(f), flags=re.I)
                fkey = _pl_key(re.sub(r"\b(pl\s*7|pl\s*8|07|08|phu luc|mau|thang|t9|2026|2025)\b", " ", base, flags=re.I))
                dv_pl.append((fkey, base, read_unit_pl78(f, wb=wb)))
            if not cats:
                loi.append((f, "không nhận ra sheet 3A/3B, 3C/3D hay PL7/PL8"))
        except Exception as e:
            loi.append((f, f"lỗi khi xử lý: {type(e).__name__}: {e}"))
            traceback.print_exc()
        finally:
            del wb
    print("Phân loại file:", cat)

    def _gan_phuluc(units):
        for u in units:
            p = match_phuluc([u["fname"], u["unit_name"], u["diaban"]], pl); u["phuluc"] = p
            if p: u["unit_name"] = re.sub(r"^công an\s+(xã|phường|thị trấn)\s+", "", p["ten"], flags=re.I).strip()
            elif pl: u["warnings"].insert(0, f"[đối chiếu] KHÔNG khớp Phụ lục ('{u['fname'][:30]}').")

    # ---- 3A/3B ----
    if units_ab:
        _gan_phuluc(units_ab)
        w = build_master(a.mau_3ab, units_ab, os.path.join(a.out_dir, "FILE_TONG_3AB.xlsx"))
        _build_report(units_ab, ("3A", "3B"), ("vviec", "van"), os.path.join(a.out_dir, "BAO_CAO_3AB.xlsx"), a.nguong)
        print("  3A/3B:", w, "->", len(units_ab), "đơn vị")
    elif cat["3AB"]:
        print("  [BỎ QUA 3A/3B] thiếu mẫu:", a.mau_3ab)

    # ---- 3C/3D ----
    if units_cd:
        _gan_phuluc(units_cd)
        build_master_3cd(a.mau_3cd, units_cd, os.path.join(a.out_dir, "FILE_TONG_3CD.xlsx"))
        _build_report(units_cd, ("3C", "3D"), ("vviec_gq", "van_gq"), os.path.join(a.out_dir, "BAO_CAO_3CD.xlsx"), a.nguong)
        print("  3C/3D:", {k: sum(len(u[k]) for u in units_cd) for k in ("3C", "3D")}, "->", len(units_cd), "đơn vị")
    elif cat["3CD"]:
        print("  [BỎ QUA 3C/3D] thiếu mẫu:", a.mau_3cd)

    # ---- PL7/PL8 ----
    if dv_pl and os.path.exists(a.mau_pl78):
        st = build_pl78(a.mau_pl78, dv_pl, os.path.join(a.out_dir, "FILE_TONG_PL78.xlsx"),
                        os.path.join(a.out_dir, "BAO_CAO_PL78.xlsx"))
        print("  PL7/PL8:", {k: f"{st[k]['matched']} chính + {st[k]['matched_pc01']} PC01(con)" for k in st})
    elif dv_pl:
        print("  [BỎ QUA PL7/PL8] thiếu mẫu:", a.mau_pl78)

    # ---- File lỗi / bỏ qua ----
    loi_path = os.path.join(a.out_dir, "FILE_LOI.xlsx")
    if loi:
        wl = openpyxl.Workbook(); wsl = wl.active; wsl.title = "File loi"
        wsl.append(["File", "Lý do (cần kiểm tra tay)"])
        for f, why in loi: wsl.append([f, why])
        wl.save(loi_path)
        print(f"\n[CẢNH BÁO] {len(loi)} file KHÔNG xử lý được -> xem {loi_path}")
        for f, why in loi: print("   -", os.path.basename(f), ":", why)
    elif os.path.exists(loi_path):
        os.remove(loi_path)   # xoá danh sách lỗi cũ của lần chạy trước

    print(f"XONG sau {time.time() - t0:.1f} giây. Kết quả trong thư mục:", a.out_dir)

if __name__ == "__main__":
    main()
