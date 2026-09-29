# Công cụ xử lý file ghi âm / cuộc họp (tiếng Việt, tiếng Anh, tiếng Nga)

Thư mục này có **hai công cụ**:

| | `phan_tich_cuoc_hop.py` — **phân tích đầy đủ** | `tom_tat_ghi_am.py` — tóm tắt nhanh |
|---|---|---|
| Dùng cho | Họp dài (tới vài giờ), nội dung **mật** | Ghi âm ngắn, không mật |
| Máy cần | Card NVIDIA (khuyến nghị 24GB VRAM) | Máy bất kỳ |
| Phân biệt người nói | Có (ai nói gì, ai ngắt lời ai) | Không |
| Ngữ điệu, cảm xúc, thái độ | Có | Không |
| Viết biên bản | AI chạy trên máy (Qwen). Claude chỉ khi bạn bật | Claude (cần API key), hoặc trích câu |
| Mạng khi chạy | **Bị chặn hoàn toàn** | Gửi văn bản lên Claude |

---

# Phân tích cuộc họp đầy đủ — 100% offline (`phan_tich_cuoc_hop.py`)

## Làm được gì

Với mỗi file ghi âm, công cụ tạo 4 file trong `ket_qua_phan_tich/`:

| File | Nội dung |
|---|---|
| `<tên>_bien_ban.md` | **Biên bản**: bảng thống kê từng người (thời gian nói, số lượt, tốc độ, ngắt lời, cảm xúc nổi bật), các thời điểm căng thẳng, rồi biên bản do AI viết: tổng quan, nội dung theo chủ đề, quyết định, việc cần làm, **quan điểm và thái độ của từng người kèm dẫn chứng mốc thời gian**, bất đồng, vấn đề bỏ ngỏ |
| `<tên>_van_ban.txt` | Bản chép lời đầy đủ: `[0:12:03] Người nói 2 [[giận dữ 0.71; nói to]]: ...` |
| `<tên>_phu_de.srt` | Phụ đề có tên người nói, mở kèm file ghi âm trong VLC để nghe lại |
| `<tên>_phan_tich.json` | Dữ liệu trung gian. Giúp chạy lại mà không phải xử lý lại audio |

Các bước xử lý:

1. **Chép lời**: Whisper large-v3 (hoặc large-v3-turbo, nhanh hơn — xem [Chọn model](#chọn-model)), có mốc thời gian từng từ.
2. **Tách người nói**: pyannote community-1.
3. **Ngữ điệu**: đo âm lượng, cao độ và tốc độ nói, rồi so với **mức bình thường của chính người đó**. Người vốn nói to sẽ không bị gắn nhãn "nói to" suốt buổi.
4. **Cảm xúc qua giọng**: emotion2vec+ large.
5. **Biên bản**: Qwen3.8 27B chạy trên máy qua Ollama.

## Thời gian xử lý (ước tính, chưa đo thực tế)

Với file 3 giờ trên card 24GB (RTX 3090/4090): chép lời khoảng 10–15 phút, tách người nói 3–5 phút, cảm xúc và ngữ điệu 5–10 phút, AI viết biên bản 10–20 phút. **Tổng cộng khoảng 30–50 phút.**

Mỗi bước xong đều được lưu lại. Nếu bị ngắt giữa chừng, chạy lại sẽ làm tiếp từ bước dở. Đặt tên thật cho người nói rồi chạy lại chỉ mất thời gian AI viết lại biên bản.

## Cài đặt (Windows, làm 1 lần, cần mạng)

1. Cài **driver NVIDIA** mới nhất và **Python 3.10–3.13** (nhớ tick "Add python.exe to PATH").
2. Cài **Ollama**: https://ollama.com/download
3. **Token HuggingFace** (miễn phí):
   - Đăng ký tài khoản tại https://huggingface.co.
   - Mở https://huggingface.co/pyannote/speaker-diarization-community-1, điền thông tin và bấm đồng ý điều khoản.
   - Tạo token loại **Read** tại https://huggingface.co/settings/tokens.
4. Chạy **`cai_dat.bat`**. File này làm lần lượt:
   - tạo môi trường `.venv`;
   - cài PyTorch bản GPU và các thư viện;
   - hỏi token HuggingFace (không hiện trên màn hình);
   - tải khoảng 5GB model vào `models/` và 18GB model Qwen qua Ollama;
   - **tự kiểm tra nạp lại mọi model khi đã cắt mạng**.

## Sử dụng

Kéo thả file ghi âm vào **`chay_phan_tich.bat`**. Hoặc dùng dòng lệnh:

```bat
.venv\Scripts\python phan_tich_cuoc_hop.py hop.m4a --so-nguoi 5
.venv\Scripts\python phan_tich_cuoc_hop.py hop.m4a --ten "Người nói 1=Anh Nam" --ten "Người nói 2=Chị Lan"
```

| Tùy chọn | Ý nghĩa |
|---|---|
| `--so-nguoi N` | Số người nói, nếu biết chắc. Tách người nói **chính xác hơn nhiều** khi có thông tin này. Có thể dùng `--it-nhat` / `--nhieu-nhat` nếu chỉ biết khoảng. |
| `--ten "Người nói 1=Anh Nam"` | Đặt tên thật cho người nói. Nghe vài câu trong `_van_ban.txt` để biết ai là ai, rồi chạy lại. |
| `--ngon-ngu vi\|en\|ru\|tron` | Chỉ định ngôn ngữ nói (mặc định tự nhận diện). |
| `--tom-tat-bang vi\|en\|ru` | Ngôn ngữ viết biên bản. |
| `--whisper large-v3-turbo` | Chép lời nhanh hơn (xem [Chọn model](#chọn-model)). Cần tải trước bằng `tai_model.py --turbo`. |
| `--llm qwen3.6:35b-a3b` | Đổi model AI viết biên bản. Bản này nhanh hơn nhưng kém hơn một chút. |
| `--llm-suy-nghi` | Cho AI suy nghĩ kỹ trước khi viết. Tốt hơn nhưng chậm hơn nhiều. |
| `--nguong-cam-xuc 0.7` | Chỉ gắn nhãn cảm xúc khi máy tin chắc hơn mức này (mặc định 0.6). |
| `--khong-cam-xuc` | Bỏ bước dự đoán cảm xúc. |
| `--dung-claude` | **Gửi văn bản** (không gửi audio) lên Claude để viết biên bản tốt hơn. **Không dùng cho nội dung mật.** |
| `--lam-lai` | Xử lý lại từ đầu. |

## Chọn model

Số liệu dưới đây **đo thật trên CPU 4 nhân** (không có GPU) với 2 file mẫu công khai: VIVOS (tiếng Việt, 3 người, 3 phút, giọng đọc) và AMI (tiếng Anh, họp thật 4 người, 4 phút, micro xa).

**Chép lời (`--whisper`)**

| | `large-v3` (mặc định) | `large-v3-turbo` |
|---|---|---|
| Thời gian chép lời, file tiếng Việt 3 phút | 2 phút 28 giây | 1 phút 53 giây |
| Thời gian chép lời, file tiếng Anh 4 phút | 2 phút 45 giây | 59 giây |
| Tỉ lệ sai từ tiếng Việt (WER) | 11,2% | 8,2% |
| Dung lượng | 2,9 GB | 1,6 GB |

Turbo nhanh hơn 1,3–2,8 lần và với mẫu trên còn chép đúng hơn. Nhưng mẫu tiếng Việt là giọng đọc rõ ràng; với họp thật (nói nhanh, chen lời, ồn) turbo có thể kém hơn. Vì vậy **mặc định vẫn là large-v3**. Nên thử turbo trên một file họp của chính bạn, so bản chép lời, rồi mới dùng thường xuyên:

```bat
.venv\Scripts\python tai_model.py --turbo
.venv\Scripts\python phan_tich_cuoc_hop.py hop.m4a --whisper large-v3-turbo --out-dir ket_qua_turbo
```

Đổi `--whisper` chỉ chép lời lại; kết quả tách người nói đã lưu vẫn được dùng lại.

**AI viết biên bản (`--llm`)**

| Model | Máy phù hợp | Nhận xét (bản chép lời mẫu, chạy trên CPU) |
|---|---|---|
| `qwen3.8:27b` (mặc định) | Card 24 GB | Chất lượng cần cho biên bản thật |
| `qwen3.6:35b-a3b` | Card 24 GB | Nhanh hơn, kém hơn một chút |
| `qwen3:4b-instruct` | Máy yếu / không có GPU | 3 phút. Nắm đúng quyết định, người phụ trách, thời hạn, trích dẫn đúng mốc; vẫn sót việc nhỏ và bỏ qua căng thẳng. Cần đọc lại kỹ |
| `qwen3:1.7b` | Chỉ để thử quy trình | Sai quyết định, bỏ sót việc chính, dẫn sai mốc — **không dùng** |

Tránh các model luôn "suy nghĩ" như `qwen3:4b` bản thường: rất chậm trên máy yếu.

## Bảo mật

- **Mạng bị chặn khi chạy.** Mọi kết nối ra ngoài máy đều bị chương trình từ chối, kể cả kết nối qua proxy hay VPN đang chạy trên máy. Kết nối tới Ollama trên chính máy đó vẫn được phép. Cuối mỗi lần chạy, chương trình báo nếu có thư viện nào thử kết nối ra ngoài.
- **Đã tắt các tính năng tự gửi dữ liệu của thư viện:**
  - pyannote 4 **mặc định gửi thống kê** (tên model, thời lượng audio) về `otel.pyannote.ai`;
  - funasr mặc định hỏi pypi.org xem có phiên bản mới;
  - HuggingFace có telemetry riêng.
- **Giới hạn:** lớp chặn nằm trong Python, nên không chặn được phần mềm khác trên máy, kể cả chính Ollama (ứng dụng Ollama tự kiểm tra bản cập nhật). **Bảo mật tuyệt đối = rút cáp mạng / tắt Wi-Fi khi xử lý**, hoặc dùng máy không bao giờ nối mạng.

### Máy không bao giờ nối mạng

1. Làm phần Cài đặt trên một máy có mạng, **cùng phiên bản Windows và Python** với máy offline.
2. Chép sang máy offline bằng USB: cả thư mục công cụ (gồm `.venv` và `models/`), bộ cài Ollama, và thư mục `%USERPROFILE%\.ollama\models`.
3. Trên máy offline, chạy `.venv\Scripts\python tai_model.py --kiem-tra` để xác nhận mọi thứ chạy được (thêm `--turbo` nếu đã tải Whisper turbo).

`.venv` gắn với đường dẫn tuyệt đối, nên hãy chép vào **đúng đường dẫn** như trên máy cài đặt. Nếu không được thì cài lại bằng `pip download` / `pip install --no-index`.

## Độ tin cậy — đọc trước khi dùng kết quả

- **Cảm xúc là dự đoán, không phải sự thật.** emotion2vec học chủ yếu từ giọng tiếng Anh/Trung do diễn viên đọc, nên độ chính xác với tiếng Việt trong họp thật thấp hơn nhiều. Dùng nhãn cảm xúc để **biết đoạn nào nên nghe lại**. Không dùng làm kết luận về một người.
- **Tiếng Việt có thanh điệu**, nên cao độ thay đổi theo từng từ. Công cụ chỉ gắn nhãn "giọng cao" khi lệch rõ (≥ 3 nửa cung) so với mức thường của người đó.
- **Tách người nói** dễ nhầm khi giọng giống nhau, nhiều người nói chồng lên nhau, hoặc micro xa. Lời chen ngắn ở chỗ chuyển lượt có thể bị gán nhầm người.
- **Nhận định thái độ** của AI dựa vào lời lẽ cùng các nhãn trên. Biên bản luôn kèm mốc thời gian để bạn kiểm chứng.

---

# Tóm tắt nhanh (`tom_tat_ghi_am.py`)

Công cụ chuyển file ghi âm thành văn bản rồi tóm tắt nội dung cuộc họp.

1. **Nhận dạng giọng nói** bằng [faster-whisper](https://github.com/SYSTRAN/faster-whisper), chạy **offline trên máy**, không gửi audio đi đâu cả.
   Tự nhận diện tiếng Việt, tiếng Anh hoặc tiếng Nga, và hỗ trợ cả cuộc họp nói lẫn nhiều thứ tiếng (`--ngon-ngu tron`).
2. **Tóm tắt** bằng Claude (`claude-opus-5-5`), gồm: tổng quan, nội dung chính, quyết định, bảng việc cần làm
   (việc / người phụ trách / thời hạn / mốc thời gian), vấn đề còn bỏ ngỏ, số liệu quan trọng.
   Nếu **không có API key**, công cụ tự chuyển sang tóm tắt đơn giản offline (trích các câu quan trọng
   và các câu có nhắc tới "cần / phải / thống nhất / deadline / нужно / срок ...").

## Kết quả

Kết quả nằm trong thư mục `ket_qua_tom_tat/`:

| File | Nội dung |
|---|---|
| `<tên>_tom_tat.md` | Bản tóm tắt (mở bằng Notepad, VS Code, Typora...) |
| `<tên>_van_ban.txt` | Văn bản đầy đủ, mỗi dòng có mốc `[mm:ss]` |
| `<tên>_phu_de.srt` | Phụ đề, mở kèm file audio/video trong VLC |

Khi chạy lại cùng một file với cùng `--model` và `--ngon-ngu`, công cụ dùng lại văn bản đã nhận dạng lần trước
(chỉ tóm tắt lại, nên rất nhanh). Đổi một trong hai tùy chọn đó, hoặc file ghi âm thay đổi, thì công cụ tự nhận dạng lại.
Muốn bắt buộc nhận dạng lại thì thêm `--lam-lai`. Nếu có nhiều file trùng tên (ví dụ `Recording 1.m4a` ở hai thư mục),
kết quả của file sau được đặt tên thêm `_2`, `_3`...

## Cách dùng trên Windows (dễ nhất)

1. Cài Python 3.10 trở lên từ https://www.python.org/downloads/ và **tick "Add python.exe to PATH"** khi cài.
2. **Kéo thả** file ghi âm (hoặc cả thư mục) vào `chay_tom_tat.bat`.
   - Lần đầu, công cụ tự cài thư viện (khoảng 200 MB) và tải model nhận dạng (khoảng 1.6 GB), nên cần có mạng.
   - Công cụ sẽ hỏi API key Claude một lần rồi lưu vào `anthropic_api_key.txt`.
     Nếu không có key, bỏ trống rồi Enter để dùng chế độ tóm tắt offline.

Hỗ trợ các định dạng: mp3, wav, m4a, aac, ogg, opus, flac, wma, amr, 3gp, mp4, mkv, mov, avi, webm...
Ngoài ra, công cụ cũng tóm tắt được file `.txt` có sẵn (ví dụ biên bản gõ tay).

## Dòng lệnh

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...        # Windows: set ANTHROPIC_API_KEY=sk-ant-...

python tom_tat_ghi_am.py hop_giao_ban.m4a
python tom_tat_ghi_am.py thu_muc_ghi_am/                      # cả thư mục
python tom_tat_ghi_am.py meeting.mp3 --ngon-ngu tron          # họp nói lẫn Việt/Anh/Nga
python tom_tat_ghi_am.py meeting.mp3 --tom-tat-bang en        # bản tóm tắt bằng tiếng Anh
python tom_tat_ghi_am.py bien_ban.txt                         # tóm tắt văn bản có sẵn
```

| Tùy chọn | Ý nghĩa |
|---|---|
| `--ngon-ngu auto\|tron\|vi\|en\|ru` | Ngôn ngữ nói. `auto` (mặc định) tự nhận diện 1 ngôn ngữ cho cả file; `tron` nhận diện theo từng đoạn. Nếu công cụ nhận nhầm ngôn ngữ thì chỉ định rõ `vi`/`en`/`ru`. |
| `--tom-tat-bang vi\|en\|ru` | Ngôn ngữ của bản tóm tắt (mặc định `vi`). |
| `--model` | Model nhận dạng: `small` (nhanh), `medium`, `large-v3-turbo` (mặc định, cân bằng), `large-v3` (chính xác nhất, chậm). |
| `--thiet-bi cuda` | Dùng GPU NVIDIA, nhanh hơn CPU 5–10 lần (cần cài CUDA 12 + cuDNN 9). |
| `--do-ky low\|medium\|high` | Mức độ suy luận của Claude khi tóm tắt (mặc định `medium`). |
| `--offline` | Không gọi Claude, chỉ tóm tắt đơn giản offline. |
| `--chi-chep-loi` | Chỉ chép lời, không tóm tắt. |
| `--lam-lai` | Nhận dạng lại, không dùng văn bản cũ. |
| `--out-dir` | Thư mục kết quả. |

## Lưu ý

- **Tốc độ trên CPU**: với model mặc định, 1 giờ ghi âm mất khoảng 15–40 phút tùy máy.
  Nếu cần nhanh hơn, dùng `--model small` (kém chính xác hơn với tiếng Việt) hoặc GPU.
- **Không phân biệt người nói**: bản chép lời không ghi ai nói câu nào. Claude sẽ suy ra người phụ trách
  từ nội dung (ví dụ "anh Nam làm báo cáo"); chỗ nào không rõ thì ghi "(không rõ)".
- **Bảo mật**: bước nhận dạng giọng nói chạy hoàn toàn trên máy. Chỉ có **văn bản** được gửi tới Anthropic
  để tóm tắt. Với nội dung mật, dùng `--offline` hoặc `--chi-chep-loi`.
- **Chi phí Claude**: tính theo lượng văn bản. Một cuộc họp 1 giờ khoảng 15–30 nghìn token, tức khoảng
  0,1–0,3 USD mỗi lần tóm tắt.
- Chế độ `tron` gán nhãn ngôn ngữ cho từng dòng dựa vào chữ viết (Kirin → Nga, có dấu tiếng Việt → Việt,
  còn lại → Anh).

## Kiểm thử

```bash
python -m unittest test_tom_tat_ghi_am test_phan_tich_cuoc_hop -v
```

Bộ kiểm thử không cần mạng và không cần model thật, vì đã dùng model nhận dạng giả và máy chủ API giả.
