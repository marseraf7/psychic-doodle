#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kiểm tra trợ lý AI trên MÁY THẬT (Windows + OneDrive + Ollama) rồi ghi báo cáo.

    python kiem_tra_may_that.py

An toàn:
  - CHỈ ĐỌC thuộc tính file OneDrive (không mở file nào, không làm Windows tải file về).
  - Chỉ mục thử nằm trong thư mục tạm, xóa khi xong; không đụng chỉ mục thật trong du_lieu/.
  - Báo cáo KHÔNG chứa tên file hay nội dung cá nhân, chỉ có số liệu -> gửi lại cho người hỗ trợ được.
Báo cáo: du_lieu/bao_cao_kiem_tra.txt
"""
import os, platform, shutil, sqlite3, sys, tempfile, time

import tro_ly_ai as t

KET_QUA, DONG = [], []


_HOME = os.path.expanduser("~")


def ghi(s=""):
    s = str(s).replace(_HOME, "~")   # đường dẫn chứa tên người dùng Windows -> che đi
    print(s, flush=True)
    DONG.append(s)


def kiem(ten, dat, chi_tiet=""):
    KET_QUA.append((ten, dat))
    ghi(f"  [{'ĐẠT ' if dat else 'LỖI '}] {ten}" + (f" — {chi_tiet}" if chi_tiet else ""))
    return dat


def muc(tieu_de):
    ghi()
    ghi(f"== {tieu_de} ==")


# ---------------------------------------------------------------------
def kiem_moi_truong(tmp):
    muc("1. Môi trường")
    ghi(f"  Hệ điều hành: {platform.platform()}")
    ghi(f"  Python: {sys.version.split()[0]}")
    ghi(f"  SQLite: {sqlite3.sqlite_version}")
    kiem("Python >= 3.9", sys.version_info >= (3, 9))
    try:
        t.Kho(os.path.join(tmp, "thu_fts")).dong()
        kiem("SQLite có FTS5 (tìm kiếm)", True)
    except RuntimeError as e:
        kiem("SQLite có FTS5 (tìm kiếm)", False, str(e))
        return False
    kiem("Đọc PDF (pypdf)", _co("pypdf"), "" if _co("pypdf") else "pip install pypdf")
    kiem("numpy (tìm theo nghĩa nhanh)", _co("numpy"), "" if _co("numpy") else "pip install numpy")
    return True


def _co(ten):
    try:
        __import__(ten)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------
def thu_muc_onedrive():
    ds = []
    for bien in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
        p = os.environ.get(bien)
        if p and os.path.isdir(p) and p not in ds:
            ds.append(p)
    home = os.path.expanduser("~")
    try:
        for ten in os.listdir(home):
            p = os.path.join(home, ten)
            if ten.lower().startswith("onedrive") and os.path.isdir(p) and p not in ds:
                ds.append(p)
    except OSError:
        pass
    return ds


def kiem_onedrive(tmp):
    muc("2. OneDrive (chỉ đọc thuộc tính, không mở file)")
    if os.name != "nt":
        ghi("  Không phải Windows -> bỏ qua.")
        return
    goc = thu_muc_onedrive()
    if not goc:
        ghi("  Không thấy thư mục OneDrive trên máy -> bỏ qua.")
        return
    tong, tren_may_chu, mau, bat_dau = 0, 0, [], time.time()
    for g in goc:
        for dirpath, dirnames, filenames in os.walk(g):
            for ten in filenames:
                try:
                    st = t._lstat(os.path.join(dirpath, ten))
                except OSError:
                    continue
                tong += 1
                if t.la_file_tren_may_chu(st):
                    tren_may_chu += 1
                    if len(mau) < 3:
                        mau.append(os.path.join(dirpath, ten))
            if time.time() - bat_dau > 120 or tong > 300_000:
                break
    ghi(f"  {len(goc)} thư mục OneDrive, duyệt {tong} file ({time.time() - bat_dau:.0f}s): "
        f"{tren_may_chu} file chỉ có trên mạng")
    kiem("Windows trả về thuộc tính file (st_file_attributes)",
         hasattr(os.lstat(goc[0]), "st_file_attributes"))
    if not mau:
        ghi("  Không có file 'chỉ có trên mạng' (mọi file đã ở trên máy) -> không thử được bước tải về.")
        ghi("  Muốn thử: chuột phải 1 thư mục nhỏ trong OneDrive > 'Free up space', rồi chạy lại.")
        return
    # Đưa file chỉ-có-trên-mạng qua đúng hàm lập chỉ mục + tìm trùng, rồi xem Windows có tải về không
    kho = t.Kho(os.path.join(tmp, "onedrive"))
    kho.cau_hinh["dung_ngu_nghia"] = False
    for p in mau:
        st = t._lstat(p)
        _, co_chu, loi = t._luu_file(kho, p, st, 1, None, 50 * 1024 * 1024)
        kiem("File chỉ-có-trên-mạng: không đọc nội dung", not co_chu and bool(loi) and "OneDrive" in loi)
    t.tim_trung_lap(kho, toi_thieu_kb=0, in_ra=lambda *a: None)
    time.sleep(3)
    con_tren_mang = sum(t.la_file_tren_may_chu(t._lstat(p)) for p in mau)
    kiem("Sau lập chỉ mục + tìm trùng, file VẪN chỉ ở trên mạng (không bị tải về)",
         con_tren_mang == len(mau), f"{con_tren_mang}/{len(mau)} file")
    kho.dong()


# ---------------------------------------------------------------------
CAP_GIONG = [   # (câu hỏi, đoạn văn liên quan)
    ("tiền điện tháng này bao nhiêu", "Hóa đơn EVN kỳ tháng 8: điện năng tiêu thụ 350 kWh, số tiền 1.250.000 đồng."),
    ("hợp đồng thuê nhà hết hạn khi nào", "Hợp đồng thuê nhà số 12, thời hạn thuê đến hết ngày 31/12/2026."),
    ("lịch họp phụ huynh", "Thông báo: nhà trường tổ chức họp cha mẹ học sinh lúc 8h sáng Chủ nhật."),
    ("bảo hiểm xe máy", "Giấy chứng nhận bảo hiểm bắt buộc trách nhiệm dân sự của chủ xe mô tô, hiệu lực 1 năm."),
    ("công thức nấu phở", "Nước dùng: ninh xương bò 8 tiếng với gừng nướng, hành nướng, quế, hồi, thảo quả."),
]
KHONG_LIEN_QUAN = ["zzqqxx", "kế hoạch du lịch Đà Lạt", "mật khẩu wifi", "báo cáo doanh thu quý 3"]


def cos(a, b):
    import math
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def kiem_ollama():
    muc("3. Ollama và mô hình")
    ch = t.CAU_HINH_MAC_DINH
    try:
        ol = t.Ollama(ch["ollama_url"])
        ds = ol.danh_sach_mo_hinh()
    except t.LoiOllama as e:
        kiem("Ollama đang chạy", False, str(e))
        return None, False, False
    kiem("Ollama đang chạy", True, f"{len(ds)} mô hình")
    co_nhung = kiem(f"Có mô hình nhúng {ch['mo_hinh_nhung']}", ol.co_mo_hinh(ch["mo_hinh_nhung"]),
                    "" if ol.co_mo_hinh(ch["mo_hinh_nhung"]) else f"ollama pull {ch['mo_hinh_nhung']}")
    mo_hinh_chat = next((m for m in (ch["mo_hinh_chat"], "qwen2.5:3b", "qwen2.5:14b") if ol.co_mo_hinh(m)), None)
    kiem("Có mô hình trò chuyện qwen2.5", bool(mo_hinh_chat),
         mo_hinh_chat or f"ollama pull {ch['mo_hinh_chat']}  (máy 8GB RAM: qwen2.5:3b)")
    return ol, co_nhung, mo_hinh_chat


def hieu_chinh_nguong(ol):
    muc("4. Hiệu chỉnh ngưỡng tìm theo nghĩa (bge-m3 thật)")
    model = t.CAU_HINH_MAC_DINH["mo_hinh_nhung"]
    bat_dau = time.time()
    doan = [d for _, d in CAP_GIONG]
    cau = [c for c, _ in CAP_GIONG] + KHONG_LIEN_QUAN
    v = ol.nhung(model, doan + cau)
    ghi(f"  Nhúng {len(v)} câu mất {time.time() - bat_dau:.1f}s (lần đầu gồm cả nạp mô hình)")
    vd, vc = v[:len(doan)], v[len(doan):]
    dung, sai = [], []
    for i in range(len(cau)):
        for j in range(len(doan)):
            (dung if i == j else sai).append(cos(vc[i], vd[j]))
    ghi(f"  Câu hỏi - đoạn LIÊN QUAN:      thấp nhất {min(dung):.3f}, trung bình {sum(dung) / len(dung):.3f}")
    ghi(f"  Câu hỏi - đoạn KHÔNG liên quan: cao nhất {max(sai):.3f}, trung bình {sum(sai) / len(sai):.3f}")
    nguong = t.CAU_HINH_MAC_DINH["nguong_ngu_nghia"]
    kiem(f"Ngưỡng {nguong} giữ được mọi cặp liên quan", min(dung) >= nguong, f"thấp nhất {min(dung):.3f}")
    kiem(f"Ngưỡng {nguong} loại được mọi cặp không liên quan", max(sai) < nguong, f"cao nhất {max(sai):.3f}")
    if min(dung) > max(sai):
        ghi(f"  Gợi ý ngưỡng: {(min(dung) + max(sai)) / 2:.2f} (giữa hai nhóm)")
    else:
        ghi("  Hai nhóm chồng lên nhau: không ngưỡng nào tách hoàn hảo -> giữ ngưỡng thấp, dựa thêm vào từ khóa.")


# ---------------------------------------------------------------------
def tao_mau(thu_muc):
    import test_tro_ly_ai as tt
    os.makedirs(os.path.join(thu_muc, "Hóa đơn"))
    for i, (_, d) in enumerate(CAP_GIONG):
        with open(os.path.join(thu_muc, f"tai_lieu_{i}.txt"), "w", encoding="utf-8") as f:
            f.write(d)
    tt.tao_docx(os.path.join(thu_muc, "Hóa đơn", "hoa_don_nuoc.docx"),
                ["Hóa đơn tiền nước tháng 8", "Tổng cộng: 180.000 đồng, hạn thanh toán 15/09/2026"])
    tt.tao_xlsx(os.path.join(thu_muc, "chi_tieu.xlsx"), "Tháng 8",
                [["Khoản", "Số tiền"], ["Đi chợ", "3.200.000"], ["Học phí", "5.000.000"]])


def kiem_quy_trinh(tmp, co_nhung, mo_hinh_chat):
    muc("5. Quét + tìm kiếm trên bộ tài liệu mẫu (không phải dữ liệu của bạn)")
    mau = os.path.join(tmp, "mau")
    tao_mau(mau)
    kho = t.Kho(os.path.join(tmp, "du_lieu"))
    kho.cau_hinh["dung_ngu_nghia"] = bool(co_nhung)
    bat_dau = time.time()
    tk = t.quet(kho, [mau], in_ra=lambda *a: None)
    kiem("Quét + đọc nội dung txt/docx/xlsx", tk.get("co_noi_dung") == 7,
         f"{tk.get('co_noi_dung')}/7 file, {time.time() - bat_dau:.1f}s, vector: {tk.get('nhung', 0)} đoạn")

    def top(cau):
        return [os.path.basename(d["path"]) for d in t.tim_file(kho, cau, k=3)]

    kiem("Tìm có dấu", "tai_lieu_1.txt" in top("hợp đồng thuê nhà")[:1])
    kiem("Tìm không dấu", "tai_lieu_1.txt" in top("hop dong thue nha")[:1])
    kiem("Tìm trong Excel", "chi_tieu.xlsx" in top("học phí")[:1])
    kiem("Từ không có ở đâu -> không trả kết quả", top("zzqqxx") == [], str(top("zzqqxx")))
    if co_nhung:
        # Các câu này KHÔNG có chữ nào trùng với file cần tìm -> chỉ tìm theo nghĩa mới ra
        for cau, can, mo_ta in (("lịch gặp giáo viên của con", "tai_lieu_2.txt", "thông báo họp phụ huynh"),
                                ("đặc sản ẩm thực Việt", "tai_lieu_4.txt", "công thức phở")):
            assert not t._tim_tu_khoa(kho, cau, 50, "OR", t._loc_sql())   # đúng là không trùng chữ
            kq = top(cau)
            kiem(f"Tìm theo nghĩa: '{cau}' -> {mo_ta}", can in kq[:2], str(kq))
    if not mo_hinh_chat:
        kho.dong()
        return
    muc(f"6. Hỏi đáp thật với {mo_hinh_chat}")
    kho.cau_hinh["mo_hinh_chat"] = mo_hinh_chat
    for cau, can_co in (("Hợp đồng thuê nhà hết hạn ngày nào?", "31/12/2026"),
                        ("Hóa đơn tiền nước tháng 8 phải trả bao nhiêu và hạn khi nào?", "180.000"),
                        ("Tôi có giấy tờ gì về chuyến bay đi Nhật không?", None)):
        bat_dau, dau = time.time(), []
        try:
            tl, nguon = t.hoi(kho, cau, moi_token=lambda x: dau or dau.append(time.time()))
        except t.LoiOllama as e:
            kiem(f"Hỏi: {cau}", False, str(e))
            continue
        ghi(f"  Hỏi: {cau}")
        ghi(f"  Đáp ({(dau[0] - bat_dau) if dau else 0:.1f}s tới chữ đầu, {time.time() - bat_dau:.1f}s tổng): "
            + tl.strip().replace("\n", " ")[:400])
        if can_co:
            kiem("  trả lời đúng + ghi nguồn", can_co in tl and "[" in tl)
        else:
            kiem("  không bịa khi dữ liệu không có", any(x in t.bo_dau(tl) for x in
                 ("khong tim thay", "khong co", "khong thay", "chua co")), "phải nói là không tìm thấy")
    kho.dong()


# ---------------------------------------------------------------------
def main():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    tmp = tempfile.mkdtemp(prefix="kiem_tra_tro_ly_")
    ghi(f"BÁO CÁO KIỂM TRA TRỢ LÝ AI — {time.strftime('%d/%m/%Y %H:%M')}")
    ghi("(chỉ có số liệu, không có tên file hay nội dung cá nhân)")
    try:
        if kiem_moi_truong(tmp):
            kiem_onedrive(tmp)
            ol, co_nhung, mo_hinh_chat = kiem_ollama()
            if ol and co_nhung:
                hieu_chinh_nguong(ol)
            kiem_quy_trinh(tmp, co_nhung, mo_hinh_chat)
    except Exception as e:   # vẫn ghi báo cáo để gửi lại
        import traceback
        kiem("Chạy hết bài kiểm tra", False, f"{type(e).__name__}: {e}")
        ghi(traceback.format_exc())
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    dat = sum(1 for _, d in KET_QUA if d)
    muc(f"TỔNG: ĐẠT {dat}/{len(KET_QUA)}")
    ghi("Còn cần tự thử bằng tay (file .bat):")
    ghi("  a) Nhấp đúp chay_tro_ly_ai.bat, chọn 2, gõ 'hợp đồng' CÓ DẤU -> phải ra kết quả, chữ không lỗi.")
    ghi("  b) Tại menu gõ  \"  (dấu ngoặc kép) rồi Enter -> menu hiện lại, không bị tắt.")
    ghi("  c) Chọn 8 -> thấy danh sách file, gõ k -> 'Đã hủy', Downloads không đổi.")
    d = os.path.join(t.THU_MUC_DU_LIEU_MAC_DINH)
    os.makedirs(d, exist_ok=True)
    duong_dan = os.path.join(d, "bao_cao_kiem_tra.txt")
    with open(duong_dan, "w", encoding="utf-8") as f:
        f.write("\n".join(DONG) + "\n")
    print(f"\nĐã ghi báo cáo: {duong_dan}")
    return 0 if dat == len(KET_QUA) else 1


if __name__ == "__main__":
    sys.exit(main())
