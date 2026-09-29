#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Công cụ PHÂN TÍCH & TÓM TẮT file ghi âm / cuộc họp (tiếng Việt, tiếng Anh, tiếng Nga).

Quy trình cho mỗi file:
  1. Nhận dạng giọng nói -> văn bản (faster-whisper, chạy OFFLINE trên máy).
     Tự nhận diện ngôn ngữ; chế độ 'tron' nhận diện theo TỪNG ĐOẠN cho cuộc họp
     nói lẫn nhiều thứ tiếng.
  2. Tóm tắt nội dung bằng Claude (cần API key): tổng quan, ý chính, quyết định,
     việc cần làm (ai / hạn), vấn đề còn mở.
     Không có API key -> tự chuyển sang tóm tắt đơn giản OFFLINE (trích câu quan trọng).

Kết quả (trong thư mục --out-dir, mặc định 'ket_qua_tom_tat'):
  <ten>_van_ban.txt   văn bản đầy đủ có mốc thời gian
  <ten>_phu_de.srt    phụ đề (mở cùng video/audio được)
  <ten>_tom_tat.md    bản tóm tắt

Cách chạy:
    python tom_tat_ghi_am.py cuoc_hop.mp3
    python tom_tat_ghi_am.py thu_muc_ghi_am/ --ngon-ngu tron --model large-v3
    python tom_tat_ghi_am.py bien_ban.txt              (tóm tắt file văn bản có sẵn)
"""
import argparse, glob, json, os, re, sys, time, unicodedata
from collections import Counter

# Console Windows mặc định cp1252 -> in tiếng Việt/Nga bị lỗi
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

THU_MUC_SCRIPT = os.path.dirname(os.path.abspath(__file__))
FILE_KEY = os.path.join(THU_MUC_SCRIPT, "anthropic_api_key.txt")

DUOI_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".wma",
              ".amr", ".3gp", ".mp4", ".m4v", ".mkv", ".mov", ".avi", ".webm", ".mpeg", ".mpg"}
DUOI_VAN_BAN = {".txt"}

NGON_NGU = {"vi": "tiếng Việt", "en": "tiếng Anh", "ru": "tiếng Nga"}
CHE_DO_NGON_NGU = ("auto", "tron", "vi", "en", "ru")

MODEL_CLAUDE = "claude-opus-5-5"


# =====================================================================
#  Tiện ích thời gian / văn bản
# =====================================================================
def mm_ss(giay):
    """Giây -> 'mm:ss' (hoặc 'h:mm:ss' khi >= 1 giờ)."""
    giay = max(0, int(round(giay)))
    h, du = divmod(giay, 3600)
    m, s = divmod(du, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def srt_time(giay):
    """Giây -> 'hh:mm:ss,mmm' theo chuẩn SRT."""
    ms = max(0, int(round(giay * 1000)))
    h, du = divmod(ms, 3_600_000)
    m, du = divmod(du, 60_000)
    s, ms = divmod(du, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def norm(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "")).strip()


# Chữ cái chỉ tiếng Việt mới có (ngoài a-z): dùng để phân biệt Việt / Anh theo chữ viết
_CHU_VIET = set("ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ")
_RE_KIRIN = re.compile(r"[\u0400-\u04FF]")


def doan_ngon_ngu(van_ban, mac_dinh=None):
    """Đoán vi/en/ru theo CHỮ VIẾT (Whisper không trả ngôn ngữ cho từng đoạn).
    Kirin -> ru; có chữ cái riêng của tiếng Việt -> vi; chữ Latin thường -> en."""
    s = van_ban.lower()
    chu = [c for c in s if c.isalpha()]
    if not chu:
        return mac_dinh
    kirin = len(_RE_KIRIN.findall(s))
    viet = sum(c in _CHU_VIET for c in chu)
    if kirin >= len(chu) * 0.2:
        return "ru"
    if viet >= max(1, len(chu) * 0.03):
        return "vi"
    if sum(c.isascii() for c in chu) >= len(chu) * 0.9:
        return "en"
    return mac_dinh


# Câu Whisper hay "bịa" ra ở đoạn im lặng/nhạc (học từ phụ đề YouTube), không phải lời nói thật
_RE_AO_GIAC = re.compile(
    r"ghiền mì gõ|subscribe cho kênh|đăng ký kênh|like,? share và subscribe|"
    r"субтитры (?:сделал|создавал|подогнал)|редактор субтитров|продолжение следует|"
    r"thanks? (?:you )?for watching|please subscribe|amara\.org", re.IGNORECASE)


def la_ao_giac(van_ban):
    """Chỉ loại khi cả đoạn ngắn (<= 20 từ) mà khớp, để không xóa nhầm lời nói thật."""
    return bool(_RE_AO_GIAC.search(van_ban)) and len(van_ban.split()) <= 20


def ten_goc(duong_dan):
    return os.path.splitext(os.path.basename(duong_dan))[0]


# =====================================================================
#  1. Nhận dạng giọng nói (faster-whisper)
# =====================================================================
class Doan:
    """Một đoạn lời nói đã nhận dạng."""
    __slots__ = ("bat_dau", "ket_thuc", "noi_dung", "ngon_ngu", "tu")

    def __init__(self, bat_dau, ket_thuc, noi_dung, ngon_ngu=None, tu=None):
        self.bat_dau, self.ket_thuc = float(bat_dau), float(ket_thuc)
        self.noi_dung, self.ngon_ngu = norm(noi_dung), ngon_ngu
        self.tu = tu or []   # [(bat_dau, ket_thuc, chữ)] khi nhận dạng có mốc từng từ

    def __repr__(self):
        return f"Doan({self.bat_dau:.1f}-{self.ket_thuc:.1f}, {self.ngon_ngu}, {self.noi_dung!r})"


def nap_model_whisper(ten_model, thiet_bi="cpu"):
    """Nạp model. GPU chỉ dùng khi chọn rõ 'cuda': máy có card NVIDIA nhưng thiếu
    thư viện CUDA/cuDNN thường bị crash khi nhận dạng, không bắt lỗi được."""
    from faster_whisper import WhisperModel
    if thiet_bi == "cuda":
        try:
            return WhisperModel(ten_model, device="cuda", compute_type="float16")
        except Exception as e:
            print(f"  [!] Không dùng được GPU ({e}). Chuyển sang CPU.")
    return WhisperModel(ten_model, device="cpu", compute_type="int8",
                        cpu_threads=os.cpu_count() or 4)


def nhan_dang(model, duong_dan, che_do="auto", in_tien_do=True, moc_tung_tu=False):
    """Trả về (danh sách Doan, mã ngôn ngữ chính, thời lượng giây).
    duong_dan có thể là đường dẫn file hoặc mảng audio 16kHz đã giải mã.
    moc_tung_tu=True: lấy thêm mốc thời gian từng từ (để ghép với người nói)."""
    tham_so = dict(beam_size=5, vad_filter=True, word_timestamps=moc_tung_tu,
                   vad_parameters={"min_silence_duration_ms": 500},
                   condition_on_previous_text=False)  # tránh lặp câu vô hạn ở đoạn ồn
    if che_do in NGON_NGU:
        tham_so["language"] = che_do
    elif che_do == "tron":
        tham_so["multilingual"] = True     # nhận diện ngôn ngữ cho từng đoạn
    else:
        tham_so["language_detection_segments"] = 4  # đoán ngôn ngữ trên ~2 phút đầu thay vì 30 giây

    segs, info = model.transcribe(duong_dan, **tham_so)
    ngon_ngu_chinh = info.language
    if che_do == "auto" and ngon_ngu_chinh not in NGON_NGU:
        # Tạp âm dễ làm Whisper đoán nhầm (vd tiếng Việt -> tiếng Khmer): chọn ngôn ngữ
        # có xác suất cao nhất trong Việt/Anh/Nga rồi gọi lại. segs là generator chưa chạy,
        # nên chỉ tốn thêm bước giải mã audio + lọc khoảng lặng (vài chục giây với file dài).
        xac_suat = {k: p for k, p in (getattr(info, "all_language_probs", None) or []) if k in NGON_NGU}
        if xac_suat:
            ngon_ngu_chinh = max(xac_suat, key=xac_suat.get)
            if in_tien_do:
                print(f"  [!] Whisper đoán '{info.language}', chuyển sang {NGON_NGU[ngon_ngu_chinh]}. "
                      f"Nếu sai, chạy lại với --ngon-ngu vi|en|ru.")
            tham_so.pop("language_detection_segments")
            segs, info = model.transcribe(duong_dan, language=ngon_ngu_chinh, **tham_so)
    tong = info.duration or 0.0
    if in_tien_do:
        print(f"  Ngôn ngữ: {NGON_NGU.get(ngon_ngu_chinh, ngon_ngu_chinh)} "
              f"({info.language_probability:.0%}) | thời lượng {mm_ss(tong)}")

    ket_qua, moc_in = [], time.time()
    for s in segs:  # generator: nhận dạng thực sự diễn ra khi lặp
        if not norm(s.text) or la_ao_giac(s.text):
            continue
        ngon_ngu = doan_ngon_ngu(s.text, ngon_ngu_chinh) if che_do == "tron" else ngon_ngu_chinh
        tu = [(w.start, w.end, w.word) for w in (getattr(s, "words", None) or [])]
        ket_qua.append(Doan(s.start, s.end, s.text, ngon_ngu, tu))
        if in_tien_do and time.time() - moc_in >= 2:
            moc_in = time.time()
            pt = f"{min(s.end / tong, 1):.0%}" if tong else "?"
            print(f"  ... {mm_ss(s.end)} / {mm_ss(tong)} ({pt})", flush=True)
    return ket_qua, ngon_ngu_chinh, tong


# =====================================================================
#  Ghi / đọc văn bản
# =====================================================================
def van_ban_co_moc(doan_list, hien_ngon_ngu=False):
    dong = []
    for d in doan_list:
        if d.bat_dau < 0:  # dòng của file .txt tự do: không có mốc thời gian
            dong.append(d.noi_dung)
            continue
        nhan = f" ({d.ngon_ngu})" if hien_ngon_ngu and d.ngon_ngu else ""
        dong.append(f"[{mm_ss(d.bat_dau)}]{nhan} {d.noi_dung}")
    return "\n".join(dong)


def noi_dung_srt(doan_list):
    khoi = []
    for i, d in enumerate(doan_list, 1):
        ket_thuc = max(d.ket_thuc, d.bat_dau + 0.5)
        khoi.append(f"{i}\n{srt_time(d.bat_dau)} --> {srt_time(ket_thuc)}\n{d.noi_dung}\n")
    return "\n".join(khoi)


_RE_MOC = re.compile(r"^\[(?:(\d+):)?(\d{1,2}):(\d{2})\](?:\s*\((\w{2,3})\))?\s*(.*)$")


def doc_van_ban(duong_dan):
    """Đọc file .txt: nếu đúng định dạng '[mm:ss] ...' do công cụ này ghi thì
    khôi phục cả mốc thời gian; ngược lại mỗi dòng/đoạn là 1 Doan không mốc."""
    with open(duong_dan, encoding="utf-8-sig", errors="replace") as f:
        dong_list = [l.rstrip("\n") for l in f]
    ket_qua = []
    for dong in dong_list:
        if not dong.strip():
            continue
        m = _RE_MOC.match(dong.strip())
        if m:
            h, mi, s, nn, nd = m.groups()
            t = int(h or 0) * 3600 + int(mi) * 60 + int(s)
            ket_qua.append(Doan(t, t, nd, nn))
        else:
            ket_qua.append(Doan(-1, -1, dong, None))
    return ket_qua


def ghi_file(duong_dan, noi_dung):
    tam = duong_dan + ".tmp"
    with open(tam, "w", encoding="utf-8", newline="\n") as f:
        f.write(noi_dung if noi_dung.endswith("\n") else noi_dung + "\n")
    os.replace(tam, duong_dan)  # ghi xong mới thay -> không bao giờ để file dở dang


# =====================================================================
#  2a. Tóm tắt bằng Claude
# =====================================================================
HUONG_DAN_TOM_TAT = """Bạn là thư ký cuộc họp chuyên nghiệp. Bạn nhận được bản chép lời tự động \
(speech-to-text) của một cuộc họp hoặc file ghi âm. Nội dung có thể bằng tiếng Việt, tiếng Anh, \
tiếng Nga hoặc trộn lẫn. Bản chép lời KHÔNG ghi tên người nói và có thể sai chính tả, nghe nhầm từ \
— hãy suy luận theo ngữ cảnh, nhưng tuyệt đối không bịa thông tin không có trong bản chép lời. \
Nếu tên người, con số hoặc thời hạn không nghe rõ, ghi rõ là "(không rõ)".

Viết bản tóm tắt bằng {ngon_ngu_ra}, định dạng Markdown, theo đúng các mục sau \
(bỏ qua mục nào không có nội dung, ghi "Không có"):

## Tổng quan
2–4 câu: chủ đề, mục đích, kết quả chính. Nêu ngôn ngữ đã dùng trong buổi ghi âm.

## Nội dung chính
Các ý quan trọng theo từng chủ đề, gạch đầu dòng, kèm mốc thời gian [mm:ss] nếu có.

## Quyết định đã thống nhất
## Việc cần làm
Bảng: | Việc | Người phụ trách | Thời hạn | Mốc thời gian |
## Vấn đề còn bỏ ngỏ / cần làm rõ
## Số liệu, mốc thời gian, tên riêng quan trọng

Các tiêu đề mục phải viết bằng {ngon_ngu_ra}."""

NGON_NGU_RA = {"vi": "tiếng Việt", "en": "English (tiếng Anh)", "ru": "русский язык (tiếng Nga)"}


class LoiKhongCoKey(Exception):
    pass


def lay_api_key():
    """API key: biến môi trường ANTHROPIC_API_KEY, hoặc file anthropic_api_key.txt cạnh script."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    if os.path.isfile(FILE_KEY):
        with open(FILE_KEY, encoding="utf-8-sig") as f:
            key = f.read().strip()
        if key:
            return key
    return None


def tom_tat_claude(van_ban, ngon_ngu_ra="vi", ten_file="", do_ky="medium", client=None,
                   huong_dan=None):
    """Gọi Claude tóm tắt. Trả về chuỗi Markdown.
    Ném LoiKhongCoKey nếu chưa cấu hình key; lỗi khác ném RuntimeError có thông báo rõ ràng."""
    try:
        import anthropic
    except ImportError:
        raise LoiKhongCoKey("chưa cài thư viện 'anthropic' (pip install anthropic)")

    if client is None:
        key = lay_api_key()
        if not key and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
            raise LoiKhongCoKey("chưa có API key (đặt ANTHROPIC_API_KEY hoặc tạo file anthropic_api_key.txt)")
        client = anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()

    he_thong = (huong_dan or HUONG_DAN_TOM_TAT).format(
        ngon_ngu_ra=NGON_NGU_RA.get(ngon_ngu_ra, ngon_ngu_ra))
    tieu_de = f"Tên file: {ten_file}\n\n" if ten_file else ""
    yeu_cau = (f"{tieu_de}<ban_chep_loi>\n{van_ban}\n</ban_chep_loi>\n\n"
               f"Hãy tóm tắt bản chép lời trên theo hướng dẫn.")
    try:
        # Stream để cuộc họp dài không bị timeout; get_final_message() gom kết quả.
        # fallbacks="default": nếu bộ lọc an toàn từ chối nhầm, server tự chạy lại bằng model dự phòng.
        with client.beta.messages.stream(
            model=MODEL_CLAUDE,
            max_tokens=32000,
            system=he_thong,
            messages=[{"role": "user", "content": yeu_cau}],
            output_config={"effort": do_ky},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError:
        raise LoiKhongCoKey("API key không hợp lệ (sửa hoặc xóa file anthropic_api_key.txt / "
                            "biến ANTHROPIC_API_KEY rồi chạy lại)")
    except anthropic.PermissionDeniedError as e:
        raise RuntimeError(f"API key không có quyền dùng model {MODEL_CLAUDE}: {e.message}")
    except anthropic.RateLimitError:
        raise RuntimeError("Vượt giới hạn tần suất gọi API. Đợi vài phút rồi chạy lại.")
    except anthropic.BadRequestError as e:
        raise RuntimeError(f"Yêu cầu bị từ chối: {e.message}")
    except anthropic.APIStatusError as e:
        raise RuntimeError(f"Lỗi máy chủ Anthropic ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        raise RuntimeError("Không kết nối được tới api.anthropic.com. Kiểm tra mạng.")

    if msg.stop_reason == "refusal":
        raise RuntimeError("Claude từ chối tóm tắt nội dung này.")
    ket_qua = "".join(b.text for b in msg.content if b.type == "text").strip()
    if not ket_qua:
        raise RuntimeError("Claude không trả về nội dung.")
    if msg.stop_reason == "max_tokens":
        ket_qua += "\n\n> ⚠ Bản tóm tắt bị cắt do quá dài."
    return ket_qua


# =====================================================================
#  2b. Tóm tắt OFFLINE (không cần AI): trích câu quan trọng
# =====================================================================
TU_DUNG = set("""
và của là có cho được các những một này đó thì mà với trong khi để không đã sẽ đang cũng như
rằng thế nào gì ở tại từ theo về ra vào lên xuống lại nữa rồi thôi nhé nhỉ ạ à ừ ờ vâng dạ ok
anh chị em bạn tôi mình chúng ta họ ông bà nó ấy kia đây vậy nên nếu nhưng hay hoặc bị do vì
rất lắm quá hơn nhất nhiều ít đều chỉ còn cái con người việc làm
the a an and or but if of to in on at for with by from as is are was were be been being it
this that these those i you he she we they me him her us them my your our their not no so do
does did have has had will would can could should just very really yeah okay ok um uh like
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее
мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был
него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней
для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того
потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем
всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего
них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя
такой им более всегда конечно всю между это
""".split())

TU_KHOA_VIEC = re.compile(
    r"\b(cần|phải|sẽ làm|giao|phụ trách|chịu trách nhiệm|hạn chót|thời hạn|trước ngày|deadline|"
    r"quyết định|thống nhất|chốt|kết luận|"
    r"need to|must|will|should|action item|assign|responsible|due|by (?:monday|tuesday|wednesday|"
    r"thursday|friday|next week|tomorrow)|decid\w*|agree\w*|"
    r"нужно|надо|должн\w*|необходимо|поручить|ответственн\w*|срок|до \d|решил\w*|договорил\w*)\b",
    re.IGNORECASE)

_RE_TU = re.compile(r"[^\W\d_]+", re.UNICODE)
_RE_CAU = re.compile(r"(?<=[.!?…])\s+")


def tach_cau(doan_list):
    """Tách thành (mốc thời gian, câu). Whisper thường cho mỗi đoạn là 1–2 câu."""
    cau = []
    for d in doan_list:
        for c in _RE_CAU.split(d.noi_dung):
            c = c.strip()
            if len(_RE_TU.findall(c)) >= 4:  # bỏ câu cụt "Vâng.", "Ok, yes."
                cau.append((d.bat_dau, c))
    return cau


def tu_khoa_noi_bat(tu_theo_cau, tan_suat, so_luong=12):
    """Ưu tiên cụm 2 từ lặp lại (tiếng Việt là ngôn ngữ đơn lập: 'sản phẩm', 'ra mắt'
    có nghĩa, còn 'sản', 'phẩm' đứng riêng thì không), sau đó mới đến từ đơn."""
    cum = Counter()
    for ds in tu_theo_cau:
        for a, b in zip(ds, ds[1:]):
            if a not in TU_DUNG and b not in TU_DUNG and len(a) > 1 and len(b) > 1:
                cum[f"{a} {b}"] += 1
    ket_qua = [c for c, n in cum.most_common(so_luong) if n >= 2]
    da_dung = {t for c in ket_qua for t in c.split()}
    ket_qua += [t for t, _ in tan_suat.most_common() if t not in da_dung][:so_luong - len(ket_qua)]
    return ket_qua


def tom_tat_offline(doan_list, so_cau=None):
    """Chọn câu quan trọng theo tần suất từ khóa (TF, bỏ từ dừng Việt/Anh/Nga), giữ thứ tự gốc."""
    cau = tach_cau(doan_list)
    if not cau:
        return "## Tổng quan\n\nKhông nhận được nội dung lời nói nào đủ dài để tóm tắt.\n"

    tu_theo_cau = [[t.lower() for t in _RE_TU.findall(c)] for _, c in cau]
    tan_suat = Counter(t for ds in tu_theo_cau for t in ds if t not in TU_DUNG and len(t) > 1)
    if not tan_suat:
        tan_suat = Counter(t for ds in tu_theo_cau for t in ds)
    dinh = max(tan_suat.values())

    diem = []
    for i, ds in enumerate(tu_theo_cau):
        co_nghia = [t for t in ds if t in tan_suat and t not in TU_DUNG]
        d = sum(tan_suat[t] / dinh for t in co_nghia) / (len(ds) ** 0.5) if ds else 0
        diem.append(d)

    if so_cau is None:
        so_cau = max(3, min(15, round(len(cau) * 0.15)))
    chon = sorted(sorted(range(len(cau)), key=lambda i: -diem[i])[:so_cau])

    viec = [cau[i] for i in range(len(cau)) if TU_KHOA_VIEC.search(cau[i][1])]
    tu_khoa = ", ".join(tu_khoa_noi_bat(tu_theo_cau, tan_suat))

    def dong(t, c):
        return f"- [{mm_ss(t)}] {c}" if t >= 0 else f"- {c}"

    phan = [
        "> Tóm tắt tự động đơn giản (OFFLINE, không dùng AI): trích nguyên văn các câu quan trọng.",
        "> Để có bản tóm tắt đầy đủ (quyết định, người phụ trách, thời hạn...), cấu hình API key Claude.",
        "",
        "## Từ khóa nổi bật", "", tu_khoa, "",
        "## Các câu quan trọng", "", *[dong(*cau[i]) for i in chon], "",
        "## Câu có thể liên quan tới quyết định / việc cần làm", "",
        *([dong(t, c) for t, c in viec[:20]] or ["Không phát hiện."]),
    ]
    return "\n".join(phan) + "\n"


# =====================================================================
#  Luồng xử lý chính
# =====================================================================
def liet_ke_file(dau_vao):
    """Mở rộng thư mục / wildcard thành danh sách file hỗ trợ (giữ thứ tự, bỏ trùng)."""
    ds = []
    for muc in dau_vao:
        if os.path.isdir(muc):
            for f in sorted(os.listdir(muc)):
                p = os.path.join(muc, f)
                if os.path.isfile(p) and os.path.splitext(f)[1].lower() in DUOI_AUDIO:
                    ds.append(p)
        elif any(ch in muc for ch in "*?["):
            ds.extend(sorted(glob.glob(muc)))
        else:
            ds.append(muc)
    da_co, ket_qua = set(), []
    for p in ds:
        k = os.path.normcase(os.path.abspath(p))
        if k not in da_co:
            da_co.add(k)
            ket_qua.append(p)
    return ket_qua


FILE_BO_NHO = ".bo_nho_dem.json"


def dau_van_tay(duong_dan, args):
    """Thông tin quyết định văn bản đã nhận dạng còn dùng lại được hay không:
    đúng file nguồn (đường dẫn + kích thước + giờ sửa) VÀ đúng model/ngôn ngữ."""
    st = os.stat(duong_dan)
    return {"nguon": os.path.normcase(os.path.abspath(duong_dan)), "kich_thuoc": st.st_size,
            "sua_luc": int(st.st_mtime), "model": args.model, "ngon_ngu": args.ngon_ngu}


def doc_bo_nho(out_dir):
    try:
        with open(os.path.join(out_dir, FILE_BO_NHO), encoding="utf-8") as f:
            du_lieu = json.load(f)
        return du_lieu if isinstance(du_lieu, dict) else {}
    except (OSError, ValueError):
        return {}


def ghi_bo_nho(out_dir, ten, van_tay):
    du_lieu = doc_bo_nho(out_dir)
    du_lieu[ten] = van_tay
    ghi_file(os.path.join(out_dir, FILE_BO_NHO), json.dumps(du_lieu, ensure_ascii=False, indent=1))


def xu_ly_mot_file(duong_dan, ten, args, lay_model):
    """Xử lý 1 file; 'ten' là tiền tố tên file kết quả.
    Trả về (đường dẫn kết quả, phương pháp tóm tắt hoặc None)."""
    duoi = os.path.splitext(duong_dan)[1].lower()
    f_txt = os.path.join(args.out_dir, f"{ten}_van_ban.txt")
    f_srt = os.path.join(args.out_dir, f"{ten}_phu_de.srt")
    f_md = os.path.join(args.out_dir, f"{ten}_tom_tat.md")
    thong_tin = []

    if duoi in DUOI_VAN_BAN:
        print("  Đọc văn bản có sẵn (bỏ qua bước nhận dạng giọng nói).")
        doan = doc_van_ban(duong_dan)
        f_txt = duong_dan
    elif (not args.lam_lai and os.path.isfile(f_txt)
          and doc_bo_nho(args.out_dir).get(ten) == dau_van_tay(duong_dan, args)):
        print(f"  Dùng lại văn bản đã nhận dạng: {f_txt}  (thêm --lam-lai để nhận dạng lại)")
        doan = doc_van_ban(f_txt)
    else:
        cu = doc_bo_nho(args.out_dir).get(ten)
        if cu and cu.get("nguon") != dau_van_tay(duong_dan, args)["nguon"]:
            print(f"  [!] Ghi đè kết quả cũ '{ten}_*' của một file khác cùng tên: {cu.get('nguon')}")
        bat_dau = time.time()
        doan, ngon_ngu, tong = nhan_dang(lay_model(), duong_dan, args.ngon_ngu)
        dem = Counter(d.ngon_ngu for d in doan)
        hien_nn = len(dem) > 1
        ghi_file(f_txt, van_ban_co_moc(doan, hien_ngon_ngu=hien_nn))
        ghi_file(f_srt, noi_dung_srt(doan))
        ghi_bo_nho(args.out_dir, ten, dau_van_tay(duong_dan, args))
        print(f"  Nhận dạng xong trong {mm_ss(time.time() - bat_dau)} -> {f_txt}")
        ds_nn = [f"{NGON_NGU.get(k, k)} ({v} đoạn)" for k, v in dem.most_common()]
        thong_tin.append(f"- Thời lượng: {mm_ss(tong)}")
        thong_tin.append("- Ngôn ngữ: " + (", ".join(ds_nn) or NGON_NGU.get(ngon_ngu, ngon_ngu)))

    if not doan:
        ghi_file(f_md, f"# Tóm tắt: {ten}\n\nKhông nhận dạng được lời nói nào trong file.\n")
        print("  [!] Không có lời nói nào được nhận dạng.")
        return f_md, None

    if args.chi_chep_loi:
        return f_txt, None

    van_ban = van_ban_co_moc(doan, hien_ngon_ngu=len({d.ngon_ngu for d in doan}) > 1)

    phuong_phap = None
    if not args.offline:
        print(f"  Đang tóm tắt bằng Claude ({MODEL_CLAUDE})...", flush=True)
        try:
            tom_tat = tom_tat_claude(van_ban, args.ngon_ngu_tom_tat, os.path.basename(duong_dan),
                                     args.do_ky)
            phuong_phap = f"Claude ({MODEL_CLAUDE})"
        except LoiKhongCoKey as e:
            print(f"  [!] Không dùng được Claude: {e}. Chuyển sang tóm tắt OFFLINE.")
        except RuntimeError as e:
            print(f"  [!] {e} Chuyển sang tóm tắt OFFLINE.")
    if phuong_phap is None:
        tom_tat = tom_tat_offline(doan)
        phuong_phap = "offline (trích câu)"

    dau = [f"# Tóm tắt: {os.path.basename(duong_dan)}", "",
           f"- Ngày xử lý: {time.strftime('%d/%m/%Y %H:%M')}",
           *thong_tin,
           f"- Phương pháp tóm tắt: {phuong_phap}",
           f"- Văn bản đầy đủ: `{os.path.basename(f_txt)}`", "", "---", ""]
    ghi_file(f_md, "\n".join(dau) + tom_tat)
    return f_md, phuong_phap


def tao_parser():
    p = argparse.ArgumentParser(
        description="Phân tích & tóm tắt file ghi âm/cuộc họp tiếng Việt, Anh, Nga.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Ví dụ:\n  python tom_tat_ghi_am.py hop_giao_ban.m4a\n"
               "  python tom_tat_ghi_am.py ghi_am/ --ngon-ngu tron --tom-tat-bang en")
    p.add_argument("dau_vao", nargs="+",
                   help="file audio/video, file .txt, hoặc thư mục chứa file ghi âm")
    p.add_argument("--ngon-ngu", default="auto", choices=CHE_DO_NGON_NGU,
                   help="ngôn ngữ nói: auto (tự nhận diện, mặc định), tron (nhiều thứ tiếng lẫn nhau), "
                        "vi, en, ru")
    p.add_argument("--tom-tat-bang", dest="ngon_ngu_tom_tat", default="vi", choices=("vi", "en", "ru"),
                   help="ngôn ngữ của bản tóm tắt (mặc định vi)")
    p.add_argument("--model", default="large-v3-turbo",
                   help="model Whisper: tiny, base, small, medium, large-v3, large-v3-turbo (mặc định). "
                        "Model lớn chính xác hơn nhưng chậm hơn")
    p.add_argument("--thiet-bi", default="cpu", choices=("cpu", "cuda"),
                   help="cpu (mặc định) hoặc cuda: GPU NVIDIA, nhanh hơn nhiều nhưng cần cài CUDA 12 + cuDNN 9")
    p.add_argument("--do-ky", default="medium", choices=("low", "medium", "high"),
                   help="mức suy nghĩ của Claude khi tóm tắt (mặc định medium)")
    p.add_argument("--offline", action="store_true", help="không gọi Claude, chỉ tóm tắt đơn giản offline")
    p.add_argument("--chi-chep-loi", action="store_true", help="chỉ chép lời, không tóm tắt")
    p.add_argument("--lam-lai", action="store_true", help="nhận dạng lại dù đã có văn bản từ lần trước")
    p.add_argument("--out-dir", default="ket_qua_tom_tat", help="thư mục kết quả")
    return p


def main(argv=None):
    args = tao_parser().parse_args(argv)
    ds = liet_ke_file(args.dau_vao)
    hop_le, loi = [], []
    for p in ds:
        duoi = os.path.splitext(p)[1].lower()
        if not os.path.isfile(p):
            loi.append((p, "không tìm thấy file"))
        elif duoi not in DUOI_AUDIO | DUOI_VAN_BAN:
            loi.append((p, f"định dạng '{duoi}' không hỗ trợ"))
        else:
            hop_le.append(p)
    for p, ly_do in loi:
        print(f"[BỎ QUA] {p}: {ly_do}")
    if not hop_le:
        print("[LỖI] Không có file nào để xử lý.")
        return 1
    os.makedirs(args.out_dir, exist_ok=True)

    model = []  # nạp lười: chỉ nạp Whisper khi thực sự cần nhận dạng, và chỉ 1 lần

    def lay_model():
        if not model:
            print(f"  Nạp model nhận dạng '{args.model}' (lần đầu sẽ tải về, có thể mất vài phút)...",
                  flush=True)
            try:
                model.append(nap_model_whisper(args.model, args.thiet_bi))
            except ImportError:
                raise RuntimeError("Chưa cài faster-whisper: pip install faster-whisper")
        return model[0]

    thanh_cong, that_bai, offline_ngoai_y = [], [], []
    ten_da_dung = set()
    for i, p in enumerate(hop_le, 1):
        print(f"\n[{i}/{len(hop_le)}] {p}")
        # 'a.mp3' + 'a.m4a', hoặc 2 thư mục đều có 'Recording 1.m4a' -> không được ghi đè nhau
        ten, so = ten_goc(p), 2
        while ten.lower() in ten_da_dung:
            ten, so = f"{ten_goc(p)}_{so}", so + 1
        ten_da_dung.add(ten.lower())
        try:
            ket_qua, phuong_phap = xu_ly_mot_file(p, ten, args, lay_model)
            thanh_cong.append(ket_qua)
            if phuong_phap and phuong_phap.startswith("offline") and not args.offline:
                offline_ngoai_y.append(p)
            print(f"  XONG -> {ket_qua}")
        except KeyboardInterrupt:
            print("\nĐã dừng theo yêu cầu.")
            return 130
        except Exception as e:  # 1 file hỏng không được làm dừng cả lô
            that_bai.append((p, e))
            print(f"  [LỖI] {type(e).__name__}: {e}")

    print(f"\nHoàn tất: {len(thanh_cong)} thành công, {len(that_bai)} lỗi. Kết quả trong '{args.out_dir}'.")
    for p, e in that_bai:
        print(f"  - {p}: {e}")
    if offline_ngoai_y:
        print(f"\n[!] {len(offline_ngoai_y)} file chỉ có bản tóm tắt OFFLINE đơn giản vì không gọi được Claude "
              f"(xem thông báo ở trên). Sửa lỗi rồi chạy lại: văn bản đã nhận dạng được dùng lại, "
              f"chỉ mất thời gian tóm tắt.")
    return 0 if not that_bai else 1


if __name__ == "__main__":
    sys.exit(main())
