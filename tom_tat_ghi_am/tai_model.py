#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tải MỘT LẦN toàn bộ model cho phan_tich_cuoc_hop.py (cần mạng + token HuggingFace),
rồi tự KIỂM TRA nạp lại từng model ở CHẾ ĐỘ CẤM MẠNG để chắc chắn máy offline chạy được.

    python tai_model.py                 # tải + kiểm tra
    python tai_model.py --kiem-tra      # chỉ kiểm tra (vd: trên máy offline sau khi chép USB)

Token: đặt biến môi trường HF_TOKEN, hoặc nhập khi được hỏi (không hiện trên màn hình).
Model tách người nói cần bấm đồng ý điều khoản trước tại:
    https://huggingface.co/pyannote/speaker-diarization-community-1
"""
import argparse
import os
import shutil
import subprocess
import sys

THU_MUC_SCRIPT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THU_MUC_SCRIPT)

# (thư mục trong models/, repo HuggingFace, cần token?)
DANH_SACH = [
    ("whisper-large-v3", "Systran/faster-whisper-large-v3", False),
    ("pyannote-community-1", "pyannote/speaker-diarization-community-1", True),
    ("emotion2vec_plus_large", "emotion2vec/emotion2vec_plus_large", False),
]


def kich_thuoc(thu_muc):
    return sum(os.path.getsize(os.path.join(g, f)) for g, _, fs in os.walk(thu_muc) for f in fs)


def tai(models, token):
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import GatedRepoError, RepositoryNotFoundError
    for ten, repo, can_token in DANH_SACH:
        dich = os.path.join(models, ten)
        print(f"\n== Tải {repo} -> {dich}")
        try:
            snapshot_download(repo, local_dir=dich, token=token if can_token else None)
        except GatedRepoError:
            print(f"[LỖI] Chưa được cấp quyền tải {repo}. Mở https://huggingface.co/{repo}, đăng nhập, "
                  f"điền thông tin và bấm đồng ý điều khoản, rồi chạy lại.")
            return False
        except RepositoryNotFoundError:
            print(f"[LỖI] Không tìm thấy {repo} (token sai hoặc thiếu?).")
            return False
        except Exception as e:   # mất mạng, tường lửa/proxy chặn huggingface.co, hết dung lượng...
            print(f"[LỖI] Không tải được {repo}: {type(e).__name__}: {e}\n"
                  f"      Kiểm tra kết nối mạng, tường lửa/proxy (cần truy cập huggingface.co) "
                  f"và dung lượng ổ đĩa, rồi chạy lại (phần đã tải sẽ không tải lại).")
            return False
        print(f"   xong ({kich_thuoc(dich) / 2**30:.1f} GB)")
    return True


def tai_ollama(model):
    if not shutil.which("ollama"):
        print(f"\n[!] Chưa cài Ollama. Tải tại https://ollama.com/download, cài xong chạy:  ollama pull {model}")
        return
    print(f"\n== Tải model AI viết biên bản qua Ollama: {model} (khoảng 18 GB)")
    subprocess.run(["ollama", "pull", model], check=False)


def kiem_tra(models, llm):
    """Chạy trong tiến trình riêng, đã bật cấm mạng -> nạp được là máy offline chạy được."""
    import chan_mang
    chan_mang.truoc_khi_import()
    chan_mang.bat()
    import numpy as np
    loi = 0

    def muc(ten, ham, thu_muc=None):
        nonlocal loi
        if thu_muc and not os.path.isdir(os.path.join(models, thu_muc)):
            loi += 1   # báo rõ thay vì để thư viện coi đường dẫn là tên repo và thử tải qua mạng
            print(f"  [LỖI] {ten}: chưa có thư mục model {os.path.join(models, thu_muc)}")
            return
        try:
            ham()
            print(f"  [OK]  {ten}")
        except Exception as e:
            loi += 1
            print(f"  [LỖI] {ten}: {type(e).__name__}: {e}")

    def whisper():
        from faster_whisper import WhisperModel
        m = WhisperModel(os.path.join(models, "whisper-large-v3"), device="cpu", compute_type="int8")
        list(m.transcribe(np.zeros(16000, dtype=np.float32), language="vi")[0])

    def pyannote():
        import torch
        from pyannote.audio import Pipeline
        p = Pipeline.from_pretrained(os.path.join(models, "pyannote-community-1"))
        assert p is not None, "không nạp được pipeline"
        p({"waveform": torch.zeros(1, 16000 * 3), "sample_rate": 16000})

    def cam_xuc():
        import ngu_dieu
        m = ngu_dieu.nap_model_cam_xuc(os.path.join(models, "emotion2vec_plus_large"), "cpu")
        m.generate(np.zeros(16000 * 2, dtype=np.float32), granularity="utterance", extract_embedding=False)

    def ollama():
        import llm_cuc_bo
        llm_cuc_bo.kiem_tra(llm)

    print("\n== Kiểm tra nạp model ở CHẾ ĐỘ CẤM MẠNG")
    muc("Chép lời (Whisper large-v3)", whisper, "whisper-large-v3")
    muc("Tách người nói (pyannote community-1)", pyannote, "pyannote-community-1")
    muc("Cảm xúc (emotion2vec+ large)", cam_xuc, "emotion2vec_plus_large")
    muc(f"AI viết biên bản (Ollama {llm})", ollama)
    try:
        import torch
        print(f"  GPU: {torch.cuda.get_device_name(0)}" if torch.cuda.is_available()
              else "  [!] PyTorch KHÔNG thấy GPU -> sẽ chạy CPU rất chậm. Cài lại bằng cai_dat.bat.")
    except ImportError:
        pass
    if chan_mang.nhat_ky:
        print(f"  (đã chặn các lần thử kết nối ra ngoài: {', '.join(sorted(set(chan_mang.nhat_ky)))})")
    print("\nTất cả sẵn sàng, dùng được khi không có mạng." if not loi else f"\n{loi} mục lỗi — xem ở trên.")
    return loi == 0


def main():
    import llm_cuc_bo
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--models", default=os.path.join(THU_MUC_SCRIPT, "models"))
    p.add_argument("--llm", default=llm_cuc_bo.MAC_DINH_MODEL)
    p.add_argument("--kiem-tra", action="store_true", help="chỉ kiểm tra, không tải")
    p.add_argument("--_kiem_tra_noi_bo", action="store_true", help=argparse.SUPPRESS)
    a = p.parse_args()

    if a._kiem_tra_noi_bo:
        return 0 if kiem_tra(a.models, a.llm) else 1

    if not a.kiem_tra:
        token = os.environ.get("HF_TOKEN", "").strip()
        if not token:
            import getpass
            token = getpass.getpass("Dán token HuggingFace (hf_..., không hiện trên màn hình): ").strip()
        os.makedirs(a.models, exist_ok=True)
        if not tai(a.models, token or None):
            return 1
        tai_ollama(a.llm)

    # Tiến trình mới: biến môi trường cấm mạng phải có TRƯỚC khi import thư viện
    kq = subprocess.run([sys.executable, os.path.abspath(__file__), "--_kiem_tra_noi_bo",
                         "--models", a.models, "--llm", a.llm])
    if kq.returncode == 0 and not a.kiem_tra:
        print(f"\nĐể dùng trên máy KHÔNG nối mạng, chép sang bằng USB:\n"
              f"  1. Thư mục công cụ này (kèm '{a.models}', khoảng {kich_thuoc(a.models) / 2**30:.0f} GB)\n"
              f"  2. Thư mục model của Ollama: %USERPROFILE%\\.ollama\\models (Windows) "
              f"hoặc ~/.ollama/models\n"
              f"  3. Bộ cài Python, Ollama và thư viện: xem README mục 'Máy không nối mạng'.")
    return kq.returncode


if __name__ == "__main__":
    sys.exit(main())
