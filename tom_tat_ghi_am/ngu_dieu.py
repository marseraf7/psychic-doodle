# -*- coding: utf-8 -*-
"""Đo NGỮ ĐIỆU (âm lượng, cao độ, tốc độ nói) và dự đoán CẢM XÚC qua giọng (emotion2vec)
cho từng đơn vị lời nói.

Nguyên tắc: mọi nhãn ngữ điệu so với MỨC BÌNH THƯỜNG CỦA CHÍNH NGƯỜI ĐÓ trong cuộc họp
(người vốn nói to không bị gắn 'nói to' suốt buổi). Tiếng Việt có thanh điệu nên cao độ
dao động tự nhiên theo từ; chỉ lệch rõ so với mức thường mới gắn nhãn.

Nhãn cảm xúc là DỰ ĐOÁN của máy (emotion2vec chủ yếu học từ giọng Anh/Trung),
chỉ dùng làm gợi ý để nghe lại, không phải kết luận."""
import contextlib
import io
import logging
import math
import os
import statistics
from collections import defaultdict

import numpy as np

SR = 16000

NHAN_CAM_XUC = {
    "angry": "giận dữ", "disgusted": "khó chịu", "fearful": "lo lắng", "happy": "vui vẻ",
    "neutral": "bình thường", "other": "khác", "sad": "buồn", "surprised": "ngạc nhiên",
    "unknown": "không rõ", "<unk>": "không rõ",
}
KHONG_NOI_BAT = {"neutral", "other", "unknown", "<unk>"}

# Ngưỡng gắn nhãn (so với mức thường của chính người nói)
NGUONG = {
    "to_db": 6.0,         # to/nhỏ hơn >= 6 dB
    "cao_st": 3.0,        # cao hơn >= 3 nửa cung
    "nhanh": 1.35,        # nhanh hơn >= 35%
    "cham": 0.65,         # chậm hơn <= 65%
    "nhan_nha": 1.6,      # biên độ cao độ >= 1.6 lần mức thường
    "don_vi_toi_thieu": 5,  # người nói có ít hơn 5 đơn vị -> không đủ mức thường để so
}


def cat_doan(audio, bat_dau, ket_thuc, sr=SR):
    return audio[max(0, int(bat_dau * sr)):max(0, int(ket_thuc * sr))]


# ---------------------------------------------------------------------
#  Ngữ điệu
# ---------------------------------------------------------------------
def do_mot_doan(clip, so_tu, sr=SR):
    """Trả về dict đặc trưng thô của 1 đoạn, hoặc {} nếu đoạn quá ngắn."""
    import librosa
    thoi_luong = len(clip) / sr
    if thoi_luong < 0.3:
        return {}
    clip = clip.astype(np.float32, copy=False)
    rms = float(np.sqrt(np.mean(np.square(clip))))
    kq = {"am_luong_db": round(20 * math.log10(rms + 1e-9), 2),
          "toc_do": round(so_tu / thoi_luong, 3)}

    fmin, fmax = 70.0, 400.0
    f0 = librosa.yin(clip, fmin=fmin, fmax=fmax, sr=sr, frame_length=1024, hop_length=256)
    e = librosa.feature.rms(y=clip, frame_length=1024, hop_length=256)[0]
    n = min(len(f0), len(e))
    f0, e = f0[:n], e[:n]
    # Khung "có tiếng": đủ năng lượng và F0 không dính biên dải tìm (yin trả biên khi không có tiếng)
    co_tieng = (e > max(np.median(e) * 0.5, 1e-4)) & (f0 > fmin * 1.05) & (f0 < fmax * 0.95)
    if co_tieng.sum() >= 10:
        st = 12 * np.log2(f0[co_tieng] / 100.0)
        kq["cao_do_st"] = round(float(np.median(st)), 2)
        kq["bien_do_st"] = round(float(np.std(st)), 2)
    return kq


def do_ngu_dieu(don_vi_list, audio, sr=SR, in_tien_do=True):
    for i, dv in enumerate(don_vi_list):
        dv.ngu_dieu = do_mot_doan(cat_doan(audio, dv.bat_dau, dv.ket_thuc, sr), dv.so_tu, sr)
        if in_tien_do and i and i % 500 == 0:
            print(f"    ngữ điệu: {i}/{len(don_vi_list)}", flush=True)
    so_sanh_muc_thuong(don_vi_list)


def so_sanh_muc_thuong(don_vi_list):
    """Tính độ lệch so với trung vị của chính người nói -> gắn nhãn dv.nhan."""
    theo_nguoi = defaultdict(list)
    for dv in don_vi_list:
        theo_nguoi[dv.nguoi].append(dv)

    for nguoi, ds in theo_nguoi.items():
        def trung_vi(khoa, loc=lambda dv: True):
            v = [dv.ngu_dieu[khoa] for dv in ds if khoa in dv.ngu_dieu and loc(dv)]
            return statistics.median(v) if v else None

        du_mau = len(ds) >= NGUONG["don_vi_toi_thieu"]
        # tốc độ chỉ tin được ở đoạn đủ dài
        du_dai = lambda dv: dv.thoi_luong >= 2 and dv.so_tu >= 4
        muc = {"am_luong_db": trung_vi("am_luong_db"), "cao_do_st": trung_vi("cao_do_st"),
               "bien_do_st": trung_vi("bien_do_st"), "toc_do": trung_vi("toc_do", du_dai)}
        for dv in ds:
            nd, nhan = dv.ngu_dieu, []
            if du_mau and nd:
                if muc["am_luong_db"] is not None and "am_luong_db" in nd:
                    lech = nd["am_luong_db"] - muc["am_luong_db"]
                    nd["lech_db"] = round(lech, 1)
                    if lech >= NGUONG["to_db"]:
                        nhan.append("nói to")
                    elif lech <= -NGUONG["to_db"]:
                        nhan.append("nói nhỏ")
                if muc["cao_do_st"] is not None and "cao_do_st" in nd:
                    lech = nd["cao_do_st"] - muc["cao_do_st"]
                    nd["lech_st"] = round(lech, 1)
                    if lech >= NGUONG["cao_st"]:
                        nhan.append("giọng cao")
                if muc["bien_do_st"] and nd.get("bien_do_st") is not None \
                        and nd["bien_do_st"] >= NGUONG["nhan_nha"] * muc["bien_do_st"]:
                    nhan.append("nhấn giọng mạnh")
                if muc["toc_do"] and du_dai(dv):
                    tl = nd["toc_do"] / muc["toc_do"]
                    nd["ti_le_toc_do"] = round(tl, 2)
                    if tl >= NGUONG["nhanh"]:
                        nhan.append("nói nhanh")
                    elif tl <= NGUONG["cham"]:
                        nhan.append("nói chậm")
            if dv.cam_xuc and dv.cam_xuc.get("noi_bat"):
                nhan.insert(0, f"{NHAN_CAM_XUC.get(dv.cam_xuc['nhan'], dv.cam_xuc['nhan'])} "
                               f"{dv.cam_xuc['diem']:.2f}")
            dv.nhan = nhan


# ---------------------------------------------------------------------
#  Cảm xúc (emotion2vec qua funasr)
# ---------------------------------------------------------------------
def nap_model_cam_xuc(thu_muc_model, thiet_bi):
    if not os.path.isdir(thu_muc_model):
        # funasr coi đường dẫn không tồn tại là tên model và thử tải từ modelscope.cn
        raise RuntimeError(f"Chưa có model cảm xúc tại {thu_muc_model}. Chạy 'python tai_model.py' trước.")
    from funasr import AutoModel
    # disable_update: funasr mặc định hỏi pypi.org xem có bản mới không -> tắt
    # disable_pbar: không in 1 thanh tiến trình cho MỖI đoạn (họp 3 giờ ~ vài nghìn đoạn)
    # log_level của funasr không có tác dụng khi logging đã được cấu hình (basicConfig bỏ qua), nên khi nạp
    # nó in ~200 dòng "init param" + "Warning, miss key ... decoder" (bình thường: phần decoder không dùng).
    goc = logging.getLogger().level
    logging.getLogger().setLevel(logging.ERROR)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            return AutoModel(model=thu_muc_model, device=thiet_bi, disable_update=True, disable_pbar=True,
                             log_level="ERROR")
    finally:
        logging.getLogger().setLevel(goc)


def _ten_nhan(nhan):
    # emotion2vec trả dạng "生气/angry"
    return str(nhan).split("/")[-1].strip().lower()


def phan_tich_cam_xuc(don_vi_list, audio, model, nguong=0.6, sr=SR, in_tien_do=True):
    """Dự đoán cảm xúc cho từng đơn vị >= 1 giây. Đoạn ngắn hơn không đủ thông tin."""
    for i, dv in enumerate(don_vi_list):
        clip = cat_doan(audio, dv.bat_dau, dv.ket_thuc, sr)
        if len(clip) < sr:
            dv.cam_xuc = None
            continue
        kq = model.generate(clip.astype(np.float32, copy=False), granularity="utterance",
                            extract_embedding=False)
        r = kq[0] if isinstance(kq, list) else kq
        tat_ca = {}
        for nhan, diem in zip(r.get("labels", []), r.get("scores", [])):
            tat_ca[_ten_nhan(nhan)] = round(float(diem), 3)
        if not tat_ca:
            dv.cam_xuc = None
            continue
        nhan = max(tat_ca, key=tat_ca.get)
        dv.cam_xuc = {"nhan": nhan, "diem": tat_ca[nhan], "tat_ca": tat_ca,
                      "noi_bat": nhan not in KHONG_NOI_BAT and tat_ca[nhan] >= nguong}
        if in_tien_do and i and i % 200 == 0:
            print(f"    cảm xúc: {i}/{len(don_vi_list)}", flush=True)


# ---------------------------------------------------------------------
#  Thời điểm đáng chú ý
# ---------------------------------------------------------------------
TRONG_SO_CAM_XUC = {"angry": 1.0, "disgusted": 1.0, "fearful": 0.8, "sad": 0.7,
                    "surprised": 0.6, "happy": 0.4}


def diem_cuong_do(dv):
    d = 0.0
    if dv.cam_xuc and dv.cam_xuc.get("noi_bat"):
        d += dv.cam_xuc["diem"] * TRONG_SO_CAM_XUC.get(dv.cam_xuc["nhan"], 0.3)
    lech_db = dv.ngu_dieu.get("lech_db", 0)
    if lech_db > 3:
        d += min((lech_db - 3) / 6, 1.0)
    tl = dv.ngu_dieu.get("ti_le_toc_do", 1)
    if tl > 1.2:
        d += min((tl - 1.2), 0.5)
    if dv.ngu_dieu.get("lech_st", 0) > 2:
        d += 0.3
    return d


def thoi_diem_dang_chu_y(don_vi_list, so_luong=10, cach_nhau=60.0, diem_toi_thieu=0.5):
    """Các đoạn có cường độ cảm xúc / giọng nói cao nhất, cách nhau >= cach_nhau giây."""
    ung_vien = sorted(((diem_cuong_do(dv), dv) for dv in don_vi_list),
                      key=lambda x: -x[0])
    chon = []
    for d, dv in ung_vien:
        if d < diem_toi_thieu or len(chon) >= so_luong:
            break
        if all(abs(dv.bat_dau - c.bat_dau) >= cach_nhau for _, c in chon):
            chon.append((d, dv))
    return sorted(chon, key=lambda x: x[1].bat_dau)
