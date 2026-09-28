# Tóm tắt file ghi âm / cuộc họp (tiếng Việt, tiếng Anh, tiếng Nga)

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
python -m unittest test_tom_tat_ghi_am -v
```

Bộ kiểm thử không cần mạng và không cần model thật, vì đã dùng model nhận dạng giả và máy chủ API giả.
