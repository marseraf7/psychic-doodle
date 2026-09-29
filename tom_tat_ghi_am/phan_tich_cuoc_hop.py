#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHÂN TÍCH CUỘC HỌP DÀI (tới vài giờ) — chạy 100% trên máy, không gửi dữ liệu ra ngoài.

  1. Chép lời      : Whisper large-v3 (GPU), có mốc thời gian từng từ.
  2. Tách người nói: pyannote community-1 -> ai nói câu nào, ai ngắt lời ai.
  3. Ngữ điệu      : âm lượng / cao độ / tốc độ so với mức thường của CHÍNH người đó.
  4. Cảm xúc       : emotion2vec (dự đoán qua giọng, chỉ là gợi ý).
  5. Biên bản      : AI trên máy (Qwen qua Ollama): nội dung, quyết định, việc cần làm,
                     thái độ / quan điểm từng người kèm dẫn chứng mốc thời gian.
                     Tùy chọn --dung-claude: gửi VĂN BẢN (không gửi audio) lên Claude.

Khi chạy, mọi kết nối ra ngoài máy đều bị CHẶN (xem chan_mang.py).
Model phải tải trước bằng: python tai_model.py

Cách chạy:
    python phan_tich_cuoc_hop.py hop_3_tieng.m4a
    python phan_tich_cuoc_hop.py hop.m4a --so-nguoi 5 --ten "Người nói 1=Anh Nam" --ten "Người nói 2=Chị Lan"
"""
import chan_mang
chan_mang.truoc_khi_import()   # PHẢI đứng trước mọi import thư viện AI

import argparse
import gc
import json
import os
import sys
import time
from collections import Counter

import tom_tat_ghi_am as T
import nguoi_noi as NN
import ngu_dieu as ND
import llm_cuc_bo as LLM

THU_MUC_SCRIPT = os.path.dirname(os.path.abspath(__file__))
TEN_MODEL = {"whisper": "whisper-large-v3",
             "pyannote": "pyannote-community-1",
             "cam_xuc": "emotion2vec_plus_large"}
PHIEN_BAN_DU_LIEU = 1
PHIEN_BAN_GAN_NGUOI_NOI = 3   # tăng khi đổi cách ghép từ với người nói -> bước 3-4 tự chạy lại


# =====================================================================
#  Prompt cho AI viết biên bản
# =====================================================================
CHU_GIAI = """Mỗi dòng bản chép lời có dạng:
[giờ:phút:giây] Tên người nói [[nhãn]]: lời nói
[[nhãn]] (nếu có) do MÁY ĐO từ giọng nói: cảm xúc dự đoán kèm độ tin cậy 0–1, và ngữ điệu so với \
mức bình thường của CHÍNH người đó (nói to/nhỏ, giọng cao, nói nhanh/chậm, nhấn giọng mạnh). \
Nhãn có thể sai (máy nhận diện cảm xúc kém chính xác với tiếng Việt): chỉ dùng làm tín hiệu phụ, \
ưu tiên LỜI LẼ (từ ngữ, cách phản bác, đồng tình, né tránh, ra lệnh...). \
Bản chép lời do máy nhận dạng, có thể sai chính tả hoặc nhầm người nói ở chỗ chuyển lượt."""

HE_THONG_MAP = ("Bạn là thư ký cuộc họp chuyên nghiệp, ghi chép khách quan, không bịa thông tin.\n"
                + CHU_GIAI + """

Với phần bản chép lời được giao, viết GHI CHÚ ngắn gọn bằng tiếng Việt theo đúng cấu trúc:
### Nội dung chính
- ý chính [mốc thời gian]
### Quyết định
### Việc cần làm
- việc — người phụ trách — thời hạn [mốc]
### Quan điểm và thái độ từng người
- Tên: lập trường/thái độ, DẪN CHỨNG bằng lời trích ngắn + [mốc]
### Bất đồng, căng thẳng
Mục nào không có thì ghi "Không có". Chỉ dùng thông tin trong phần được giao.""")

HE_THONG_REDUCE = ("Bạn là thư ký cuộc họp chuyên nghiệp, viết biên bản khách quan, không bịa thông tin. "
                   "Nhận định về thái độ phải kèm dẫn chứng và nói rõ đó là nhận định.\n" + CHU_GIAI + """

Viết BIÊN BẢN HOÀN CHỈNH bằng {ngon_ngu_ra}, Markdown, đúng các mục (tiêu đề mục cũng viết bằng {ngon_ngu_ra}):
## Tổng quan
3–5 câu: mục đích, diễn biến chính, kết quả.
## Nội dung chính theo chủ đề
## Quyết định đã thống nhất
## Việc cần làm
Bảng: | Việc | Người phụ trách | Thời hạn | Mốc thời gian |
## Quan điểm và thái độ của từng người
Mỗi người: lập trường chính, thái độ (hợp tác / phản đối / dè dặt / căng thẳng...), thay đổi thái độ \
trong buổi họp nếu có — kèm dẫn chứng [mốc thời gian].
## Bất đồng và thời điểm căng thẳng
## Vấn đề còn bỏ ngỏ""")


def yeu_cau_map(i, n, van_ban):
    return f"Phần {i}/{n} của bản chép lời:\n\n{van_ban}"


def yeu_cau_reduce(ghi_chu):
    return ("Dưới đây là ghi chú của từng phần cuộc họp theo thứ tự thời gian. "
            "Tổng hợp thành biên bản hoàn chỉnh, gộp các ý trùng lặp:\n\n"
            + "\n\n".join(f"## Ghi chú phần {i}\n{g}" for i, g in enumerate(ghi_chu, 1)))


# =====================================================================
#  Thiết bị / model
# =====================================================================
def them_duong_dan_dll():
    """Windows: faster-whisper (CTranslate2) cần cuBLAS/cuDNN của CUDA 12. Dùng chung DLL đi kèm
    PyTorch bản CUDA và các gói nvidia-* của pip thay vì bắt cài CUDA Toolkit riêng."""
    if os.name != "nt":
        return
    import glob
    import importlib.util
    ds = []
    spec = importlib.util.find_spec("torch")
    if spec and spec.origin:
        ds.append(os.path.join(os.path.dirname(spec.origin), "lib"))
    for sp in sys.path:
        ds.extend(glob.glob(os.path.join(sp, "nvidia", "*", "bin")))
    for d in ds:
        if os.path.isdir(d):
            try:
                os.add_dll_directory(d)
            except OSError:
                pass
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def chon_thiet_bi(yeu_cau):
    if yeu_cau == "cpu":
        return "cpu"
    try:
        import torch
        if torch.cuda.is_available():
            ten = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / 2**30
            print(f"GPU: {ten} ({vram:.0f} GB VRAM)")
            return "cuda"
    except ImportError:
        pass
    print("[!] Không thấy GPU NVIDIA dùng được (hoặc PyTorch bản CPU). Chạy bằng CPU sẽ RẤT chậm "
          "với file dài. Xem README phần cài đặt GPU.")
    return "cpu"


def giai_phong_vram():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


def duong_dan_model(args, khoa):
    p = os.path.join(args.models, TEN_MODEL[khoa])
    if not os.path.isdir(p):
        raise RuntimeError(f"Chưa có model '{TEN_MODEL[khoa]}' trong {args.models}. "
                           f"Chạy 'python tai_model.py' trên máy có mạng trước.")
    return p


# =====================================================================
#  Lưu kết quả trung gian (tránh xử lý lại 3 giờ audio khi chỉ đổi tên / chạy lại AI)
# =====================================================================
def van_tay_nguon(duong_dan):
    st = os.stat(duong_dan)
    return {"nguon": os.path.normcase(os.path.abspath(duong_dan)), "kich_thuoc": st.st_size,
            "sua_luc": int(st.st_mtime)}


def doc_du_lieu(f_json):
    try:
        with open(f_json, encoding="utf-8") as f:
            d = json.load(f)
        return d if d.get("phien_ban") == PHIEN_BAN_DU_LIEU else {}
    except (OSError, ValueError, AttributeError):
        return {}


def ghi_du_lieu(f_json, du_lieu):
    du_lieu["phien_ban"] = PHIEN_BAN_DU_LIEU
    T.ghi_file(f_json, json.dumps(du_lieu, ensure_ascii=False))


# =====================================================================
#  Các bước xử lý
# =====================================================================
def buoc_chep_loi(audio, args, thiet_bi):
    them_duong_dan_dll()
    from faster_whisper import WhisperModel
    kieu = "float16" if thiet_bi == "cuda" else "int8"
    model = WhisperModel(duong_dan_model(args, "whisper"), device=thiet_bi, compute_type=kieu,
                         cpu_threads=os.cpu_count() or 4)
    doan, ngon_ngu, tong = T.nhan_dang(model, audio, args.ngon_ngu, moc_tung_tu=True)
    del model
    giai_phong_vram()
    tu = []
    for d in doan:
        if d.tu:
            tu.extend([round(s, 3), round(e, 3), w] for s, e, w in d.tu)
        else:   # đoạn không có mốc từng từ -> coi cả đoạn là 1 "từ"
            tu.append([round(d.bat_dau, 3), round(d.ket_thuc, 3), " " + d.noi_dung])
    dem = Counter(T.doan_ngon_ngu(d.noi_dung, ngon_ngu) for d in doan)
    return {"ngon_ngu": ngon_ngu, "thoi_luong": tong, "tu": tu,
            "ngon_ngu_dem": dict(dem)}


def buoc_tach_nguoi_noi(audio, args, thiet_bi):
    import torch
    from pyannote.audio import Pipeline
    from pyannote.audio.pipelines.utils.hook import ProgressHook
    pipeline = Pipeline.from_pretrained(duong_dan_model(args, "pyannote"))
    if pipeline is None:
        raise RuntimeError("Không nạp được model tách người nói (thư mục model hỏng?). Chạy lại tai_model.py.")
    pipeline.to(torch.device(thiet_bi))
    # Đưa audio đã giải mã vào bộ nhớ: không cần torchcodec/ffmpeg (hay lỗi trên Windows)
    vao = {"waveform": torch.from_numpy(audio).unsqueeze(0), "sample_rate": ND.SR}
    tuy_chon = {}
    if args.so_nguoi:
        tuy_chon["num_speakers"] = args.so_nguoi
    else:
        if args.it_nhat:
            tuy_chon["min_speakers"] = args.it_nhat
        if args.nhieu_nhat:
            tuy_chon["max_speakers"] = args.nhieu_nhat
    with ProgressHook() as hook:
        kq = pipeline(vao, hook=hook, **tuy_chon)
    # pyannote 4 trả DiarizeOutput; pipeline cấu hình kiểu cũ (legacy) trả thẳng Annotation có chồng lấn
    ann_chong = getattr(kq, "speaker_diarization", kq)
    ann_rieng = getattr(kq, "exclusive_speaker_diarization", None)
    if ann_rieng is None:
        ann_rieng = ann_chong
    rieng = [[round(t.start, 3), round(t.end, 3), nhan] for t, _, nhan in ann_rieng.itertracks(yield_label=True)]
    chong = [[round(t.start, 3), round(t.end, 3), nhan] for t, _, nhan in ann_chong.itertracks(yield_label=True)]
    if ann_rieng is ann_chong:   # bỏ phần chồng lấn: đoạn sau cắt đầu theo đoạn trước
        rieng = lam_khong_chong_lan(rieng)
    del pipeline, kq
    giai_phong_vram()
    return {"rieng": rieng, "chong": chong}


def lam_khong_chong_lan(doan):
    kq = []
    for s, e, nhan in sorted(doan):
        if kq and s < kq[-1][1]:
            s = kq[-1][1]
        if e > s:
            kq.append([s, e, nhan])
    return kq


def buoc_don_vi(audio, asr, nn, args, thiet_bi):
    tu = [NN.Tu(s, e, w) for s, e, w in asr["tu"]]
    NN.gan_nguoi_noi(tu, [tuple(x) for x in nn["rieng"]])
    ds = NN.chia_don_vi(tu)
    print(f"  {len(ds)} đoạn lời nói. Đo ngữ điệu...", flush=True)
    if not args.khong_cam_xuc:
        print("  Dự đoán cảm xúc qua giọng (emotion2vec)...", flush=True)
        model = ND.nap_model_cam_xuc(duong_dan_model(args, "cam_xuc"), thiet_bi)
        ND.phan_tich_cam_xuc(ds, audio, model, args.nguong_cam_xuc)
        del model
        giai_phong_vram()
    ND.do_ngu_dieu(ds, audio)
    return ds


# =====================================================================
#  Báo cáo
# =====================================================================
def dong_ban_chep_loi(ds, ten):
    dong = []
    for dv in ds:
        nhan = f" [[{'; '.join(dv.nhan)}]]" if dv.nhan else ""
        dong.append(f"[{gio(dv.bat_dau)}] {ten.get(dv.nguoi, dv.nguoi)}{nhan}: {dv.noi_dung}")
    return dong


def gio(giay):
    giay = max(0, int(round(giay)))
    return f"{giay // 3600}:{giay % 3600 // 60:02d}:{giay % 60:02d}"


def srt(ds, ten):
    khoi = []
    for i, dv in enumerate(ds, 1):
        kt = max(dv.ket_thuc, dv.bat_dau + 0.5)
        khoi.append(f"{i}\n{T.srt_time(dv.bat_dau)} --> {T.srt_time(kt)}\n"
                    f"{ten.get(dv.nguoi, dv.nguoi)}: {dv.noi_dung}\n")
    return "\n".join(khoi)


def bang_thong_ke(tk, ten):
    dong = ["| Người nói | Thời gian nói | Tỉ lệ | Số lượt | Từ/phút | Ngắt lời người khác | Bị ngắt lời "
            "| Đoạn nói to | Cảm xúc nổi bật (dự đoán) |",
            "|---|---|---|---|---|---|---|---|---|"]
    for nguoi, x in sorted(tk.items(), key=lambda kv: -kv[1]["thoi_luong"]):
        cx = ", ".join(f"{ND.NHAN_CAM_XUC.get(k, k)} ×{v}" for k, v in x["cam_xuc"].most_common(3)) or "—"
        dong.append(f"| {ten.get(nguoi, nguoi)} | {gio(x['thoi_luong'])} | {x['ti_le']:.0%} | {x['so_luot']} "
                    f"| {x['tu_moi_phut']:.0f} | {x['ngat_loi']} | {x['bi_ngat']} | {x['noi_to']} | {cx} |")
    return "\n".join(dong)


def muc_ngat_loi(ngat, ten):
    if not ngat:
        return "Không phát hiện."
    return "\n".join(f"- {ten.get(a, a)} ngắt lời {ten.get(b, b)}: {n} lần"
                     for (a, b), n in ngat.most_common(10))


def muc_dang_chu_y(ds, ten):
    ds_chon = ND.thoi_diem_dang_chu_y(ds)
    if not ds_chon:
        return "Không có đoạn nào nổi bật rõ về giọng nói / cảm xúc."
    dong = []
    for _, dv in ds_chon:
        trich = dv.noi_dung if len(dv.noi_dung) <= 160 else dv.noi_dung[:157] + "..."
        dong.append(f"- **[{gio(dv.bat_dau)}] {ten.get(dv.nguoi, dv.nguoi)}** "
                    f"({'; '.join(dv.nhan) or 'cường độ cao'}): {trich}")
    return "\n".join(dong)


def viet_bien_ban(dong, ds, args, ten_file):
    """Trả về (nội dung Markdown, phương pháp)."""
    if args.dung_claude:
        print("  [!] Gửi VĂN BẢN (không gửi audio) lên Claude theo yêu cầu --dung-claude...", flush=True)
        try:
            with chan_mang.tam_mo():
                kq = T.tom_tat_claude("\n".join(dong), args.tom_tat_bang, ten_file, "high",
                                      huong_dan=HE_THONG_REDUCE)
            return kq, f"Claude ({T.MODEL_CLAUDE}) — văn bản đã được gửi lên Anthropic"
        except (T.LoiKhongCoKey, RuntimeError) as e:
            print(f"  [!] Không dùng được Claude: {e}. Chuyển sang AI trên máy.")
    if not args.khong_llm:
        try:
            LLM.kiem_tra(args.llm)
            kq = LLM.tom_tat_map_reduce(
                dong, args.llm, HE_THONG_MAP,
                HE_THONG_REDUCE.format(ngon_ngu_ra=T.NGON_NGU_RA.get(args.tom_tat_bang, args.tom_tat_bang)),
                yeu_cau_map, yeu_cau_reduce, suy_nghi=args.llm_suy_nghi)
            LLM.giai_phong(args.llm)
            return kq, f"AI trên máy ({args.llm} qua Ollama) — 100% offline"
        except LLM.LoiOllama as e:
            print(f"  [!] {e}\n  Chuyển sang tóm tắt đơn giản (trích câu).")
    doan = [T.Doan(dv.bat_dau, dv.ket_thuc, dv.noi_dung) for dv in ds]
    return T.tom_tat_offline(doan), "trích câu đơn giản (không dùng AI)"


def phan_tich_file(duong_dan, ten_ra, args, thiet_bi, ten_tuy_chon):
    f_json = os.path.join(args.out_dir, f"{ten_ra}_phan_tich.json")
    du_lieu = {} if args.lam_lai else doc_du_lieu(f_json)
    nguon = van_tay_nguon(duong_dan)
    vt_asr = {**nguon, "model": TEN_MODEL["whisper"], "ngon_ngu": args.ngon_ngu}
    vt_nn = {**nguon, "so_nguoi": args.so_nguoi, "it_nhat": args.it_nhat, "nhieu_nhat": args.nhieu_nhat}
    vt_dv = {"asr": vt_asr, "nn": vt_nn, "gan": PHIEN_BAN_GAN_NGUOI_NOI, "cam_xuc": not args.khong_cam_xuc,
             "nguong": args.nguong_cam_xuc}

    audio = []   # giải mã lười: chỉ khi cần chạy ít nhất 1 bước

    def lay_audio():
        if not audio:
            from faster_whisper import decode_audio
            print("  Giải mã audio...", flush=True)
            audio.append(decode_audio(duong_dan, sampling_rate=ND.SR))
            print(f"  Thời lượng {gio(len(audio[0]) / ND.SR)}", flush=True)
        return audio[0]

    def buoc(khoa, van_tay, ten_buoc, ham):
        cu = du_lieu.get(khoa)
        if cu and cu.get("van_tay") == van_tay:
            print(f"  {ten_buoc}: dùng lại kết quả lần trước.")
            return cu
        print(f"  {ten_buoc}...", flush=True)
        bd = time.time()
        kq = ham()
        kq["van_tay"] = van_tay
        du_lieu[khoa] = kq
        ghi_du_lieu(f_json, du_lieu)   # lưu ngay: lỗi ở bước sau không làm mất bước này
        print(f"  {ten_buoc} xong trong {gio(time.time() - bd)}.", flush=True)
        return kq

    asr = buoc("asr", vt_asr, "[1/5] Chép lời (Whisper)",
               lambda: buoc_chep_loi(lay_audio(), args, thiet_bi))
    if not asr["tu"]:
        raise RuntimeError("Không nhận dạng được lời nói nào trong file.")
    nn = buoc("nguoi_noi", vt_nn, "[2/5] Tách người nói (pyannote)",
              lambda: buoc_tach_nguoi_noi(lay_audio(), args, thiet_bi))
    dv_du_lieu = buoc("don_vi", vt_dv, "[3-4/5] Ngữ điệu & cảm xúc",
                      lambda: {"ds": [d.to_dict() for d in buoc_don_vi(lay_audio(), asr, nn, args, thiet_bi)]})
    audio.clear()

    ds = [NN.DonVi.from_dict(d) for d in dv_du_lieu["ds"]]
    ND.so_sanh_muc_thuong(ds)   # gắn lại nhãn (nhanh) — ngưỡng có thể đã đổi
    ten = NN.dat_ten_hien_thi(ds, ten_tuy_chon)
    ngat = NN.dem_ngat_loi([tuple(x) for x in nn["chong"]])
    tk = NN.thong_ke(ds, ngat)
    dong = dong_ban_chep_loi(ds, ten)

    T.ghi_file(os.path.join(args.out_dir, f"{ten_ra}_van_ban.txt"), "\n".join(dong))
    T.ghi_file(os.path.join(args.out_dir, f"{ten_ra}_phu_de.srt"), srt(ds, ten))

    print("  [5/5] Viết biên bản...", flush=True)
    bien_ban, phuong_phap = viet_bien_ban(dong, ds, args, os.path.basename(duong_dan))

    ngon_ngu = ", ".join(f"{T.NGON_NGU.get(k, k)}" for k, _ in
                         Counter(asr.get("ngon_ngu_dem") or {}).most_common() if k) \
        or T.NGON_NGU.get(asr["ngon_ngu"], asr["ngon_ngu"])
    bao_cao = [
        f"# Biên bản phân tích: {os.path.basename(duong_dan)}", "",
        f"- Ngày xử lý: {time.strftime('%d/%m/%Y %H:%M')}",
        f"- Thời lượng: {gio(asr['thoi_luong'])} | Số người nói: {len([k for k in tk if k != NN.KHONG_RO])} "
        f"| Ngôn ngữ: {ngon_ngu}",
        f"- Viết biên bản bằng: {phuong_phap}",
        f"- Bản chép lời đầy đủ: `{ten_ra}_van_ban.txt` — phụ đề: `{ten_ra}_phu_de.srt`", "",
        "> Tên người nói do máy tự phân nhóm theo giọng (Người nói 1, 2...). Đặt tên thật bằng "
        "`--ten \"Người nói 1=Anh Nam\"` rồi chạy lại (chỉ mất thời gian viết lại biên bản).",
        "> Cảm xúc và thái độ là **DỰ ĐOÁN của máy**, có thể sai — hãy nghe lại đoạn ghi âm tại mốc "
        "thời gian tương ứng trước khi dùng.", "",
        "## Thống kê người nói", "", bang_thong_ke(tk, ten), "",
        "### Ngắt lời", "", muc_ngat_loi(ngat, ten), "",
        "## Thời điểm đáng chú ý (giọng nói / cảm xúc mạnh)", "", muc_dang_chu_y(ds, ten), "",
        "---", "", bien_ban,
    ]
    f_md = os.path.join(args.out_dir, f"{ten_ra}_bien_ban.md")
    T.ghi_file(f_md, "\n".join(bao_cao))
    return f_md


# =====================================================================
#  CLI
# =====================================================================
def doc_ten(ds_ten):
    kq = {}
    for x in ds_ten or []:
        if "=" not in x:
            raise SystemExit(f"--ten phải có dạng \"Người nói 1=Tên thật\", nhận được: {x!r}")
        a, b = x.split("=", 1)
        kq[a.strip()] = b.strip()
    return kq


def tao_parser():
    p = argparse.ArgumentParser(
        description="Phân tích cuộc họp dài: chép lời, tách người nói, ngữ điệu, cảm xúc, biên bản. "
                    "Chạy 100%% trên máy.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Ví dụ:\n  python phan_tich_cuoc_hop.py hop.m4a --so-nguoi 4\n"
               "  python phan_tich_cuoc_hop.py hop.m4a --ten \"Người nói 1=Anh Nam\"")
    p.add_argument("dau_vao", nargs="+", help="file ghi âm / video, hoặc thư mục")
    p.add_argument("--ngon-ngu", default="auto", choices=T.CHE_DO_NGON_NGU)
    p.add_argument("--so-nguoi", type=int, help="số người nói, nếu biết chắc (chính xác hơn)")
    p.add_argument("--it-nhat", type=int, help="số người nói tối thiểu")
    p.add_argument("--nhieu-nhat", type=int, help="số người nói tối đa")
    p.add_argument("--ten", action="append", metavar="\"Người nói 1=Tên\"",
                   help="đặt tên thật cho người nói (lặp lại cho nhiều người)")
    p.add_argument("--tom-tat-bang", default="vi", choices=("vi", "en", "ru"), help="ngôn ngữ biên bản")
    p.add_argument("--llm", default=LLM.MAC_DINH_MODEL, help=f"model Ollama (mặc định {LLM.MAC_DINH_MODEL})")
    p.add_argument("--llm-suy-nghi", action="store_true",
                   help="cho AI suy nghĩ kỹ trước khi viết (chậm hơn nhiều)")
    p.add_argument("--khong-llm", action="store_true", help="không dùng AI viết biên bản")
    p.add_argument("--dung-claude", action="store_true",
                   help="GỬI VĂN BẢN lên Claude để viết biên bản (KHÔNG dùng cho nội dung mật)")
    p.add_argument("--khong-cam-xuc", action="store_true", help="bỏ bước dự đoán cảm xúc")
    p.add_argument("--nguong-cam-xuc", type=float, default=0.6,
                   help="độ tin cậy tối thiểu để gắn nhãn cảm xúc (0–1, mặc định 0.6)")
    p.add_argument("--thiet-bi", default="cuda", choices=("cuda", "cpu"))
    p.add_argument("--models", default=os.path.join(THU_MUC_SCRIPT, "models"), help="thư mục model")
    p.add_argument("--lam-lai", action="store_true", help="xử lý lại từ đầu, bỏ kết quả đã lưu")
    p.add_argument("--out-dir", default="ket_qua_phan_tich")
    return p


def main(argv=None):
    args = tao_parser().parse_args(argv)
    ten_tuy_chon = doc_ten(args.ten)
    chan_mang.bat()
    print("CHẾ ĐỘ CẤM MẠNG: BẬT — không có dữ liệu nào được gửi ra khỏi máy"
          + (" (trừ văn bản gửi Claude do bạn bật --dung-claude)." if args.dung_claude else "."))

    ds = [p for p in T.liet_ke_file(args.dau_vao)
          if os.path.isfile(p) and os.path.splitext(p)[1].lower() in T.DUOI_AUDIO]
    if not ds:
        print("[LỖI] Không có file ghi âm nào để xử lý.")
        return 1
    os.makedirs(args.out_dir, exist_ok=True)
    thiet_bi = chon_thiet_bi(args.thiet_bi)

    thanh_cong, that_bai, da_dung = [], [], set()
    for i, p in enumerate(ds, 1):
        ten_ra, so = T.ten_goc(p), 2
        while ten_ra.lower() in da_dung:
            ten_ra, so = f"{T.ten_goc(p)}_{so}", so + 1
        da_dung.add(ten_ra.lower())
        print(f"\n[{i}/{len(ds)}] {p}")
        bd = time.time()
        try:
            f_md = phan_tich_file(p, ten_ra, args, thiet_bi, ten_tuy_chon)
            thanh_cong.append(f_md)
            print(f"  XONG trong {gio(time.time() - bd)} -> {f_md}")
        except KeyboardInterrupt:
            print("\nĐã dừng. Các bước đã xong được lưu lại, chạy lại sẽ làm tiếp.")
            return 130
        except Exception as e:
            that_bai.append((p, e))
            print(f"  [LỖI] {type(e).__name__}: {e}")
    print(f"\nHoàn tất: {len(thanh_cong)} thành công, {len(that_bai)} lỗi. Kết quả trong '{args.out_dir}'.")
    if chan_mang.nhat_ky:
        print(f"[!] Đã chặn {len(chan_mang.nhat_ky)} lần thử kết nối ra ngoài: "
              f"{', '.join(sorted(set(chan_mang.nhat_ky)))}")
    return 0 if not that_bai else 1


if __name__ == "__main__":
    sys.exit(main())
