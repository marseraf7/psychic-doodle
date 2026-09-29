# -*- coding: utf-8 -*-
"""Ghép lời nói (từng từ, có mốc thời gian) với kết quả tách người nói (pyannote),
chia thành các ĐƠN VỊ LỜI NÓI (1 người, <= ~30 giây) để đo ngữ điệu / cảm xúc,
và thống kê hành vi nói của từng người (thời lượng, số lượt, ngắt lời...).

Toàn bộ module là logic thuần (không cần model) -> kiểm thử được đầy đủ."""
import bisect
from collections import Counter, defaultdict

KHONG_RO = "?"


class Tu:
    """Một từ Whisper nhận dạng được."""
    __slots__ = ("bat_dau", "ket_thuc", "chu", "nguoi")

    def __init__(self, bat_dau, ket_thuc, chu, nguoi=None):
        self.bat_dau, self.ket_thuc, self.chu, self.nguoi = float(bat_dau), float(ket_thuc), chu, nguoi

    def to_list(self):
        return [round(self.bat_dau, 3), round(self.ket_thuc, 3), self.chu, self.nguoi]

    @classmethod
    def from_list(cls, x):
        return cls(*x)


class DonVi:
    """Một đoạn lời nói liền mạch của MỘT người (đơn vị đo ngữ điệu / cảm xúc)."""

    def __init__(self, nguoi, tu_list):
        self.nguoi = nguoi
        self.tu = tu_list
        self.bat_dau = tu_list[0].bat_dau
        self.ket_thuc = tu_list[-1].ket_thuc
        self.noi_dung = "".join(t.chu for t in tu_list).strip()
        self.ngu_dieu = {}    # âm lượng / cao độ / tốc độ (điền ở module ngu_dieu)
        self.cam_xuc = None   # {"nhan": ..., "diem": ..., "tat_ca": {...}}
        self.nhan = []        # nhãn hiển thị: ["nói to", "giận dữ 0.72", ...]

    @property
    def thoi_luong(self):
        return max(0.0, self.ket_thuc - self.bat_dau)

    @property
    def so_tu(self):
        return sum(1 for t in self.tu if t.chu.strip())

    def to_dict(self):
        return {"nguoi": self.nguoi, "tu": [t.to_list() for t in self.tu],
                "ngu_dieu": self.ngu_dieu, "cam_xuc": self.cam_xuc}

    @classmethod
    def from_dict(cls, d):
        dv = cls(d["nguoi"], [Tu.from_list(x) for x in d["tu"]])
        dv.ngu_dieu, dv.cam_xuc = d.get("ngu_dieu") or {}, d.get("cam_xuc")
        return dv


# ---------------------------------------------------------------------
#  Gán người nói cho từng từ
# ---------------------------------------------------------------------
def gan_nguoi_noi(tu_list, doan_nguoi_noi, lan_can=1.0):
    """Gán người nói cho mỗi từ theo đoạn tách người nói TRÙNG NHIỀU NHẤT về thời gian.
    doan_nguoi_noi: [(bat_dau, ket_thuc, nhan)] KHÔNG chồng lấn (exclusive diarization).
    Từ rơi vào khoảng trống: lấy đoạn gần nhất trong phạm vi `lan_can` giây,
    nếu không có thì theo người nói của từ ngay trước.
    Sau đó sửa từ ĐẦU LƯỢT bị dính vào người trước (xem _sua_tu_dau_luot)."""
    doan = sorted(doan_nguoi_noi)
    bat_dau_list = [d[0] for d in doan]
    truoc = KHONG_RO
    for t in tu_list:
        # các đoạn có thể giao với [t.bat_dau, t.ket_thuc]
        i = bisect.bisect_right(bat_dau_list, t.ket_thuc)
        tot_nhat, trung = None, 0.0
        j = i - 1
        while j >= 0:
            s, e, nhan = doan[j]
            if e <= t.bat_dau:   # đoạn không chồng lấn + đã sắp xếp -> các đoạn trước còn xa hơn
                break
            giao = min(e, t.ket_thuc) - max(s, t.bat_dau)
            if giao > trung:
                tot_nhat, trung = nhan, giao
            j -= 1
        if tot_nhat is None:
            giua = (t.bat_dau + t.ket_thuc) / 2
            gan, kc = None, lan_can
            for k in (i - 1, i):
                if 0 <= k < len(doan):
                    s, e, nhan = doan[k]
                    d = 0.0 if s <= giua <= e else min(abs(giua - s), abs(giua - e))
                    if d <= kc:
                        gan, kc = nhan, d
            tot_nhat = gan if gan is not None else truoc
        t.nguoi = tot_nhat
        truoc = tot_nhat
    _sua_tu_dau_luot(tu_list, doan)
    return tu_list


def _sua_tu_dau_luot(tu_list, doan, phu_toi_thieu=0.5):
    """Whisper hay đặt mốc từ đầu câu sau khoảng lặng QUÁ SỚM và kéo dài (~1 giây, phủ lên khoảng lặng),
    nên từ đầu lượt của người mới dính vào cuối đoạn của người trước ("... ủng hộ các kiến nghị này Khắp | nơi").
    Đo trên audio thật: nếu từ nằm ngay trước chỗ đổi người mà phần lớn thời lượng lòi ra SAU đoạn của
    người được gán -> thực chất là từ đầu lượt của người sau."""
    for k in range(len(tu_list) - 1):
        t, sau = tu_list[k], tu_list[k + 1]
        if sau.nguoi == t.nguoi or sau.nguoi == KHONG_RO or t.ket_thuc <= t.bat_dau:
            continue
        cua_minh = [(s, e) for s, e, n in doan if n == t.nguoi and s < t.ket_thuc and e > t.bat_dau]
        if not cua_minh:
            continue
        phu = sum(min(e, t.ket_thuc) - max(s, t.bat_dau) for s, e in cua_minh)
        if phu < phu_toi_thieu * (t.ket_thuc - t.bat_dau) and max(e for _, e in cua_minh) < t.ket_thuc:
            t.nguoi = sau.nguoi


def _ket_thuc_cau(chu):
    return chu.rstrip().endswith((".", "?", "!", "…", "。"))


def chia_don_vi(tu_list, nghi_toi_da=1.5, dai_toi_da=30.0):
    """Cắt chuỗi từ thành các đơn vị: đổi người nói, hoặc ngừng > nghi_toi_da giây,
    hoặc đã dài quá dai_toi_da giây (ưu tiên cắt ở cuối câu nếu có)."""
    ket_qua, hien_tai = [], []
    for t in tu_list:
        if hien_tai:
            cuoi = hien_tai[-1]
            dai = t.ket_thuc - hien_tai[0].bat_dau
            cat = (t.nguoi != cuoi.nguoi
                   or t.bat_dau - cuoi.ket_thuc > nghi_toi_da
                   or (dai > dai_toi_da * 0.6 and _ket_thuc_cau(cuoi.chu))
                   or dai > dai_toi_da)
            if cat:
                ket_qua.append(DonVi(hien_tai[0].nguoi, hien_tai))
                hien_tai = []
        hien_tai.append(t)
    if hien_tai:
        ket_qua.append(DonVi(hien_tai[0].nguoi, hien_tai))
    return [dv for dv in ket_qua if dv.noi_dung]


def dat_ten_hien_thi(don_vi_list, ten_tuy_chon=None):
    """SPEAKER_00... -> 'Người nói 1', 'Người nói 2' theo thứ tự xuất hiện;
    ten_tuy_chon {'Người nói 1': 'Anh Nam'} (hoặc theo nhãn gốc 'SPEAKER_00') để đặt tên thật."""
    ten_tuy_chon = ten_tuy_chon or {}
    bang, so = {}, 0
    for dv in don_vi_list:
        if dv.nguoi not in bang:
            if dv.nguoi == KHONG_RO:
                bang[dv.nguoi] = "Không rõ"
            else:
                so += 1
                bang[dv.nguoi] = f"Người nói {so}"
    for goc, mac_dinh in list(bang.items()):
        bang[goc] = ten_tuy_chon.get(goc) or ten_tuy_chon.get(mac_dinh) or mac_dinh
    return bang


# ---------------------------------------------------------------------
#  Ngắt lời & thống kê
# ---------------------------------------------------------------------
def dem_ngat_loi(doan_chong_lan, truoc_it_nhat=1.0, sau_it_nhat=1.0):
    """Đếm số lần A bắt đầu nói khi B đang nói (B đã nói >= truoc_it_nhat giây
    và còn nói thêm >= sau_it_nhat giây sau đó). Dùng kết quả tách người nói CÓ chồng lấn.
    Trả về Counter {(nguoi_ngat, nguoi_bi_ngat): so_lan}."""
    doan = sorted(doan_chong_lan)
    dem = Counter()
    dang_noi = []   # các đoạn còn đang diễn ra
    for s, e, a in doan:
        dang_noi = [x for x in dang_noi if x[1] > s]
        bi_ngat = set()
        for s2, e2, b in dang_noi:
            if b != a and s - s2 >= truoc_it_nhat and e2 - s >= sau_it_nhat:
                bi_ngat.add(b)
        for b in bi_ngat:
            dem[(a, b)] += 1
        dang_noi.append((s, e, a))
    return dem


def thong_ke(don_vi_list, ngat_loi=None):
    """Thống kê theo người nói (khóa = nhãn gốc)."""
    tk = defaultdict(lambda: {"thoi_luong": 0.0, "so_luot": 0, "so_tu": 0, "so_don_vi": 0,
                              "cam_xuc": Counter(), "noi_to": 0, "noi_nhanh": 0,
                              "ngat_loi": 0, "bi_ngat": 0})
    truoc = None
    for dv in don_vi_list:
        x = tk[dv.nguoi]
        x["thoi_luong"] += dv.thoi_luong
        x["so_tu"] += dv.so_tu
        x["so_don_vi"] += 1
        if dv.nguoi != truoc:
            x["so_luot"] += 1
        truoc = dv.nguoi
        if dv.cam_xuc and dv.cam_xuc.get("noi_bat"):
            x["cam_xuc"][dv.cam_xuc["nhan"]] += 1
        if "nói to" in dv.nhan:
            x["noi_to"] += 1
        if "nói nhanh" in dv.nhan:
            x["noi_nhanh"] += 1
    for (a, b), n in (ngat_loi or {}).items():
        tk[a]["ngat_loi"] += n
        tk[b]["bi_ngat"] += n
    tong = sum(x["thoi_luong"] for x in tk.values()) or 1.0
    for x in tk.values():
        x["ti_le"] = x["thoi_luong"] / tong
        x["tu_moi_phut"] = x["so_tu"] / (x["thoi_luong"] / 60) if x["thoi_luong"] > 0 else 0.0
    return dict(tk)
