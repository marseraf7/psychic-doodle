# -*- coding: utf-8 -*-
"""Gọi AI chạy TRÊN MÁY qua Ollama (http://127.0.0.1:11434) để viết biên bản.

Bản chép lời 3 giờ quá dài cho 1 lần gọi model 27B trên card 24GB, nên làm 2 bước:
  1. MAP   : chia bản chép lời thành từng phần (~25 phút), mỗi phần -> ghi chú.
  2. REDUCE: gộp các ghi chú -> biên bản hoàn chỉnh (gộp nhiều tầng nếu ghi chú vẫn quá dài).
Chỉ dùng thư viện chuẩn; KHÔNG đi qua proxy hệ thống (dữ liệu không rời khỏi máy)."""
import json
import os
import time
import urllib.error
import urllib.request

MAC_DINH_MODEL = "qwen3.8:27b"


class LoiOllama(RuntimeError):
    pass


def dia_chi_ollama():
    host = os.environ.get("OLLAMA_HOST", "127.0.0.1:11434").strip()
    if not host.startswith(("http://", "https://")):
        host = "http://" + host
    return host.rstrip("/")


# Không dùng proxy của hệ thống: HTTP_PROXY có thể trỏ ra ngoài -> dữ liệu lọt khỏi máy
_mo = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _post(duong_dan, du_lieu, timeout):
    req = urllib.request.Request(dia_chi_ollama() + duong_dan, data=json.dumps(du_lieu).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    return _mo.open(req, timeout=timeout)


def kiem_tra(model):
    """Ollama có chạy và đã có model chưa? Ném LoiOllama kèm hướng dẫn nếu không."""
    try:
        with _mo.open(dia_chi_ollama() + "/api/tags", timeout=10) as r:
            ds = json.load(r).get("models", [])
    except (urllib.error.URLError, OSError) as e:
        raise LoiOllama(f"Không kết nối được Ollama tại {dia_chi_ollama()} ({e}). "
                        f"Cài Ollama (https://ollama.com) và mở ứng dụng Ollama trước khi chạy.")
    ten = {m.get("name") for m in ds} | {m.get("model") for m in ds}
    if model not in ten and f"{model}:latest" not in ten:
        raise LoiOllama(f"Ollama chưa có model '{model}'. Trên máy có mạng chạy: ollama pull {model} "
                        f"(model hiện có: {', '.join(sorted(x for x in ten if x)) or 'không có'})")


def chat(model, he_thong, noi_dung, num_ctx=16384, suy_nghi=False, timeout=1800, in_tien_do=True):
    """Gọi /api/chat dạng stream (để in tiến độ, không bị timeout với câu trả lời dài)."""
    du_lieu = {"model": model, "stream": True, "think": bool(suy_nghi),
               "messages": [{"role": "system", "content": he_thong},
                            {"role": "user", "content": noi_dung}],
               "options": {"num_ctx": num_ctx, "temperature": 0.2}}
    try:
        r = _post("/api/chat", du_lieu, timeout)
    except urllib.error.HTTPError as e:
        loi = e.read().decode("utf-8", "replace")
        if "think" in loi.lower():   # model không hỗ trợ tham số think -> gọi lại không có nó
            du_lieu.pop("think")
            r = _post("/api/chat", du_lieu, timeout)
        else:
            raise LoiOllama(f"Ollama báo lỗi {e.code}: {loi[:300]}")
    except (urllib.error.URLError, OSError) as e:
        raise LoiOllama(f"Mất kết nối tới Ollama: {e}")

    phan, moc = [], time.time()
    with r:
        for dong in r:
            if not dong.strip():
                continue
            goi = json.loads(dong)
            if goi.get("error"):
                raise LoiOllama(f"Ollama báo lỗi: {goi['error']}")
            phan.append((goi.get("message") or {}).get("content", ""))
            if in_tien_do and time.time() - moc > 15:
                moc = time.time()
                print(f"      ... đã viết {sum(map(len, phan))} ký tự", flush=True)
            if goi.get("done"):
                if goi.get("done_reason") == "length":
                    phan.append("\n\n> ⚠ Bị cắt do vượt giới hạn độ dài.")
                break
    kq = "".join(phan).strip()
    if not kq:
        raise LoiOllama("Model không trả về nội dung.")
    return kq


def chia_phan(dong_list, toi_da_ky_tu=12000):
    """Gom các dòng bản chép lời thành từng phần <= toi_da_ky_tu (không cắt giữa dòng)."""
    phan, hien_tai, dai = [], [], 0
    for d in dong_list:
        if hien_tai and dai + len(d) + 1 > toi_da_ky_tu:
            phan.append(hien_tai)
            hien_tai, dai = [], 0
        hien_tai.append(d)
        dai += len(d) + 1
    if hien_tai:
        phan.append(hien_tai)
    return phan


def tom_tat_map_reduce(dong_list, model, he_thong_map, he_thong_reduce, tao_yeu_cau_map,
                       tao_yeu_cau_reduce, toi_da_ky_tu=12000, ctx_map=16384, ctx_reduce=32768,
                       suy_nghi=False, in_tien_do=True, goi=chat):
    """dong_list: các dòng bản chép lời đã gắn nhãn. Trả về biên bản (Markdown)."""
    phan = chia_phan(dong_list, toi_da_ky_tu)
    ghi_chu = []
    for i, p in enumerate(phan, 1):
        if in_tien_do:
            print(f"    AI đọc phần {i}/{len(phan)}...", flush=True)
        ghi_chu.append(goi(model, he_thong_map, tao_yeu_cau_map(i, len(phan), "\n".join(p)),
                           num_ctx=ctx_map, suy_nghi=suy_nghi, in_tien_do=in_tien_do))

    # Gộp nhiều tầng nếu tổng ghi chú vẫn quá dài cho 1 lần gọi
    gioi_han_gop = toi_da_ky_tu * 3
    tang = 0
    while sum(map(len, ghi_chu)) > gioi_han_gop and len(ghi_chu) > 1:
        tang += 1
        nhom = chia_phan([f"### Ghi chú phần {k}\n{g}" for k, g in enumerate(ghi_chu, 1)], gioi_han_gop)
        if len(nhom) == len(ghi_chu):   # không gộp được thêm (mỗi ghi chú đã quá dài)
            break
        if in_tien_do:
            print(f"    Gộp ghi chú tầng {tang}: {len(ghi_chu)} -> {len(nhom)} nhóm", flush=True)
        ghi_chu = [goi(model, he_thong_map,
                       "Gộp các ghi chú sau thành MỘT ghi chú theo đúng cấu trúc cũ, giữ mốc thời gian "
                       "và dẫn chứng, bỏ trùng lặp:\n\n" + "\n\n".join(n),
                       num_ctx=ctx_reduce, suy_nghi=suy_nghi, in_tien_do=in_tien_do) for n in nhom]

    if in_tien_do:
        print("    AI viết biên bản tổng hợp...", flush=True)
    return goi(model, he_thong_reduce, tao_yeu_cau_reduce(ghi_chu),
               num_ctx=ctx_reduce, suy_nghi=suy_nghi, in_tien_do=in_tien_do)


def giai_phong(model):
    """Bảo Ollama nhả VRAM ngay (keep_alive=0) khi xong việc."""
    try:
        _post("/api/generate", {"model": model, "keep_alive": 0}, 30).close()
    except Exception:
        pass
