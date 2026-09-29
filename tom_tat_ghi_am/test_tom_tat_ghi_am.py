# -*- coding: utf-8 -*-
"""Kiểm thử: python -m unittest test_tom_tat_ghi_am -v
Không cần mạng, không cần model Whisper thật: dùng model giả và máy chủ API giả."""
import json, os, shutil, sys, tempfile, threading, unittest
from collections import namedtuple
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tom_tat_ghi_am as T

Seg = namedtuple("Seg", "start end text")
Info = namedtuple("Info", "language language_probability duration all_language_probs", defaults=(None,))

DOAN_HOP = [
    Seg(0.0, 4.2, " Chào mọi người, hôm nay chúng ta họp về kế hoạch ra mắt sản phẩm mới."),
    Seg(4.2, 9.0, " Anh Nam phải hoàn thành báo cáo thị trường trước ngày 15 tháng 10."),
    Seg(9.0, 13.5, " Let's agree on the budget of fifty thousand dollars for marketing."),
    Seg(13.5, 18.0, " Нужно подготовить договор с поставщиком до конца месяца."),
    Seg(18.0, 18.5, " Vâng."),
    Seg(18.5, 25.0, " Chúng ta thống nhất ngày ra mắt sản phẩm mới là mùng một tháng mười một."),
]


class ModelGia:
    def __init__(self, segs=DOAN_HOP, ngon_ngu="vi", duration=25.0, xac_suat=None):
        self.segs, self.ngon_ngu, self.duration, self.goi = segs, ngon_ngu, duration, []
        self.xac_suat = xac_suat

    def transcribe(self, path, **kw):
        self.goi.append((path, kw))
        if "language" in kw:
            return iter(self.segs), Info(kw["language"], 1.0, self.duration)
        return iter(self.segs), Info(self.ngon_ngu, 0.93, self.duration, self.xac_suat)


class TestTienIch(unittest.TestCase):
    def test_thoi_gian(self):
        self.assertEqual(T.mm_ss(0), "00:00")
        self.assertEqual(T.mm_ss(65.4), "01:05")
        self.assertEqual(T.mm_ss(3725), "1:02:05")
        self.assertEqual(T.mm_ss(-3), "00:00")
        self.assertEqual(T.srt_time(3725.5), "01:02:05,500")
        self.assertEqual(T.srt_time(59.9996), "00:01:00,000")

    def test_doan_ngon_ngu(self):
        self.assertEqual(T.doan_ngon_ngu("Chúng ta thống nhất kế hoạch"), "vi")
        self.assertEqual(T.doan_ngon_ngu("We agreed on the budget"), "en")
        self.assertEqual(T.doan_ngon_ngu("Нужно подготовить договор"), "ru")
        self.assertEqual(T.doan_ngon_ngu("Нужно send the contract"), "ru")
        self.assertEqual(T.doan_ngon_ngu("123 !!!", "vi"), "vi")
        self.assertEqual(T.doan_ngon_ngu("日本語のテキスト", "vi"), "vi")

    def test_srt(self):
        srt = T.noi_dung_srt([T.Doan(0, 0, "a"), T.Doan(1.25, 3, "b")])
        self.assertIn("1\n00:00:00,000 --> 00:00:00,500\na\n", srt)
        self.assertIn("2\n00:00:01,250 --> 00:00:03,000\nb\n", srt)

    def test_doc_lai_van_ban(self):
        d = [T.Doan(5, 7, "xin chào", "vi"), T.Doan(3700, 3702, "hello", "en")]
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "a.txt")
            T.ghi_file(p, T.van_ban_co_moc(d, hien_ngon_ngu=True))
            lai = T.doc_van_ban(p)
        self.assertEqual([(x.bat_dau, x.ngon_ngu, x.noi_dung) for x in lai],
                         [(5, "vi", "xin chào"), (3700, "en", "hello")])

    def test_doc_van_ban_tu_do(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "b.txt")
            with open(p, "w", encoding="utf-8-sig") as f:
                f.write("Dòng một (có ngoặc)\n\n[không phải mốc] dòng hai\n[01:05] dòng ba\n")
            lai = T.doc_van_ban(p)
        self.assertEqual([x.noi_dung for x in lai],
                         ["Dòng một (có ngoặc)", "[không phải mốc] dòng hai", "dòng ba"])
        self.assertEqual([x.bat_dau for x in lai], [-1, -1, 65])
        # Dòng không có mốc thì không bị gắn [00:00] giả khi ghi lại
        self.assertEqual(T.van_ban_co_moc(lai),
                         "Dòng một (có ngoặc)\n[không phải mốc] dòng hai\n[01:05] dòng ba")


class TestNhanDang(unittest.TestCase):
    def test_tron_ngon_ngu(self):
        m = ModelGia()
        doan, nn, tong = T.nhan_dang(m, "x.mp3", "tron", in_tien_do=False)
        self.assertTrue(m.goi[0][1]["multilingual"])
        self.assertNotIn("language", m.goi[0][1])
        self.assertEqual([d.ngon_ngu for d in doan], ["vi", "vi", "en", "ru", "vi", "vi"])
        self.assertEqual(tong, 25.0)

    def test_auto_doan_nham_ngon_ngu_khac(self):
        m = ModelGia(ngon_ngu="km", xac_suat=[("km", 0.4), ("ru", 0.1), ("vi", 0.35), ("en", 0.05)])
        doan, nn, _ = T.nhan_dang(m, "x.mp3", "auto", in_tien_do=False)
        self.assertEqual(nn, "vi")
        self.assertEqual(len(m.goi), 2)
        self.assertEqual(m.goi[0][1]["language_detection_segments"], 4)
        self.assertEqual(m.goi[1][1]["language"], "vi")
        self.assertNotIn("language_detection_segments", m.goi[1][1])
        self.assertTrue(all(d.ngon_ngu == "vi" for d in doan))

    def test_auto_dung_ngon_ngu(self):
        m = ModelGia(ngon_ngu="en")
        _, nn, _ = T.nhan_dang(m, "x.mp3", "auto", in_tien_do=False)
        self.assertEqual((nn, len(m.goi)), ("en", 1))

    def test_loc_ao_giac(self):
        m = ModelGia(segs=[Seg(0, 2, "Hãy subscribe cho kênh Ghiền Mì Gõ để không bỏ lỡ những video hấp dẫn"),
                           Seg(2, 4, "Субтитры сделал DimaTorzok"),
                           Seg(4, 6, "Chúng ta chốt ngân sách quý bốn."),
                           Seg(6, 9, "Thanks for watching the demo, now " + "let us review the numbers " * 5)])
        doan, _, _ = T.nhan_dang(m, "x.mp3", "vi", in_tien_do=False)
        self.assertEqual([d.bat_dau for d in doan], [4, 6])  # câu dài có cụm khớp vẫn giữ

    def test_ep_ngon_ngu_va_bo_doan_rong(self):
        m = ModelGia(segs=[Seg(0, 1, "  "), Seg(1, 2, "Привет всем")])
        doan, nn, _ = T.nhan_dang(m, "x.mp3", "ru", in_tien_do=False)
        self.assertEqual(m.goi[0][1]["language"], "ru")
        self.assertEqual(len(doan), 1)
        self.assertEqual(doan[0].ngon_ngu, "ru")


class TestTomTatOffline(unittest.TestCase):
    def test_co_cau_quan_trong_va_viec_can_lam(self):
        doan = [T.Doan(s.start, s.end, s.text) for s in DOAN_HOP]
        kq = T.tom_tat_offline(doan)
        self.assertIn("## Các câu quan trọng", kq)
        self.assertNotIn("Vâng.", kq)                # câu cụt bị loại
        viec = kq.split("việc cần làm")[1]
        self.assertIn("[00:04] Anh Nam phải", viec)
        self.assertIn("Нужно подготовить", viec)
        self.assertIn("thống nhất", viec)
        self.assertIn("Let's agree", viec)
        tu_khoa = kq.split("## Từ khóa nổi bật")[1].split("##")[0]
        self.assertIn("sản phẩm", tu_khoa)
        self.assertIn("phẩm mới", tu_khoa)

    def test_rong(self):
        self.assertIn("Không nhận được", T.tom_tat_offline([T.Doan(0, 1, "Ừ.")]))

    def test_toan_tu_dung(self):
        # Chỉ toàn từ dừng -> không được chia cho 0 / lỗi max()
        kq = T.tom_tat_offline([T.Doan(0, 1, "và của là có cho được")])
        self.assertIn("## Các câu quan trọng", kq)


# ---------------- Máy chủ Anthropic API giả (SSE) ----------------
class _ApiGia(BaseHTTPRequestHandler):
    nhan = []           # (headers, body) các request đã nhận
    tra_loi = ("## Tổng quan\nCuộc họp về ra mắt sản phẩm.", "end_turn")
    ma_loi = None

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        _ApiGia.nhan.append((dict(self.headers), json.loads(self.rfile.read(n))))
        if _ApiGia.ma_loi:
            body = json.dumps({"type": "error", "error": {"type": "authentication_error",
                                                          "message": "invalid x-api-key"}}).encode()
            self.send_response(_ApiGia.ma_loi)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        text, stop = _ApiGia.tra_loi
        su_kien = [
            ("message_start", {"type": "message_start", "message": {
                "id": "msg_1", "type": "message", "role": "assistant", "model": T.MODEL_CLAUDE,
                "content": [], "stop_reason": None, "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 0}}}),
            ("content_block_start", {"type": "content_block_start", "index": 0,
                                     "content_block": {"type": "text", "text": ""}}),
            ("content_block_delta", {"type": "content_block_delta", "index": 0,
                                     "delta": {"type": "text_delta", "text": text}}),
            ("content_block_stop", {"type": "content_block_stop", "index": 0}),
            ("message_delta", {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None},
                               "usage": {"output_tokens": 5}}),
            ("message_stop", {"type": "message_stop"}),
        ]
        body = "".join(f"event: {e}\ndata: {json.dumps(d, ensure_ascii=False)}\n\n" for e, d in su_kien).encode()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class TestClaude(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), _ApiGia)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        _ApiGia.nhan.clear()
        _ApiGia.ma_loi = None
        _ApiGia.tra_loi = ("## Tổng quan\nCuộc họp về ra mắt sản phẩm.", "end_turn")
        import anthropic
        self.client = anthropic.Anthropic(api_key="sk-test", base_url=self.url, max_retries=0)

    def test_yeu_cau_dung(self):
        kq = T.tom_tat_claude("[00:00] xin chào", "ru", "hop.mp3", "low", client=self.client)
        self.assertEqual(kq, "## Tổng quan\nCuộc họp về ra mắt sản phẩm.")
        headers, body = _ApiGia.nhan[0]
        self.assertEqual(body["model"], "claude-opus-5-5")
        self.assertEqual(body["fallbacks"], "default")
        self.assertEqual(body["output_config"], {"effort": "low"})
        self.assertTrue(body["stream"])
        self.assertNotIn("thinking", body)
        self.assertIn("server-side-fallback-2026-07-01", headers.get("anthropic-beta", ""))
        self.assertIn("русский", body["system"])
        self.assertIn("hop.mp3", body["messages"][0]["content"])
        self.assertIn("[00:00] xin chào", body["messages"][0]["content"])

    def test_bi_cat(self):
        _ApiGia.tra_loi = ("## Tổng quan\nabc", "max_tokens")
        self.assertIn("bị cắt", T.tom_tat_claude("x", client=self.client))

    def test_tu_choi(self):
        _ApiGia.tra_loi = ("", "refusal")
        with self.assertRaises(RuntimeError):
            T.tom_tat_claude("x", client=self.client)

    def test_sai_key(self):
        _ApiGia.ma_loi = 401
        with self.assertRaises(T.LoiKhongCoKey):
            T.tom_tat_claude("x", client=self.client)

    def test_khong_co_key(self):
        with mock.patch.dict(os.environ, {}, clear=True), \
             mock.patch.object(T, "FILE_KEY", "/khong/ton/tai.txt"):
            with self.assertRaises(T.LoiKhongCoKey):
                T.tom_tat_claude("x")

    def test_key_tu_file(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "k.txt")
            with open(p, "w", encoding="utf-8") as f:
                f.write("﻿  sk-ant-abc \n")
            with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(T, "FILE_KEY", p):
                self.assertEqual(T.lay_api_key(), "sk-ant-abc")


# ---------------- Toàn bộ luồng qua main() ----------------
class TestMain(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.out = os.path.join(self.td, "kq")
        self.audio = os.path.join(self.td, "Họp giao ban.m4a")
        open(self.audio, "wb").close()

    def tearDown(self):
        shutil.rmtree(self.td)

    def chay(self, *them, model=None):
        model = model or ModelGia()
        with mock.patch.object(T, "nap_model_whisper", return_value=model) as nap:
            ma = T.main([self.audio, "--out-dir", self.out, *them])
        return ma, model, nap

    def doc(self, ten):
        with open(os.path.join(self.out, ten), encoding="utf-8") as f:
            return f.read()

    def test_offline_day_du_va_dung_lai_van_ban(self):
        ma, model, nap = self.chay("--offline", "--ngon-ngu", "tron")
        self.assertEqual(ma, 0)
        txt = self.doc("Họp giao ban_van_ban.txt")
        self.assertIn("[00:09] (en) Let's agree", txt)
        self.assertIn("1\n00:00:00,000 -->", self.doc("Họp giao ban_phu_de.srt"))
        md = self.doc("Họp giao ban_tom_tat.md")
        self.assertIn("offline", md)
        self.assertIn("tiếng Việt (4 đoạn)", md)

        # Lần 2 cùng cấu hình: dùng lại văn bản, không nạp model
        ma, model, nap = self.chay("--offline", "--ngon-ngu", "tron")
        self.assertEqual(ma, 0)
        nap.assert_not_called()
        # Đổi ngôn ngữ (vd sau cảnh báo nhận nhầm): PHẢI nhận dạng lại, không dùng văn bản cũ
        ma, model, nap = self.chay("--offline", "--ngon-ngu", "vi")
        nap.assert_called_once()
        self.assertEqual(model.goi[0][1]["language"], "vi")
        # --lam-lai: nhận dạng lại
        ma, model, nap = self.chay("--offline", "--ngon-ngu", "vi", "--lam-lai")
        nap.assert_called_once()
        # File nguồn bị thay bằng bản ghi khác: nhận dạng lại
        with open(self.audio, "wb") as f:
            f.write(b"moi")
        ma, model, nap = self.chay("--offline", "--ngon-ngu", "vi")
        nap.assert_called_once()

    def test_trung_ten_khac_thu_muc(self):
        # Điện thoại hay đặt tên giống nhau: 2 file 'Recording.m4a' ở 2 thư mục
        a, b = os.path.join(self.td, "a"), os.path.join(self.td, "b")
        os.makedirs(a); os.makedirs(b)
        fa, fb = os.path.join(a, "Recording.m4a"), os.path.join(b, "Recording.m4a")
        for f in (fa, fb):
            open(f, "wb").close()
        m = ModelGia()
        with mock.patch.object(T, "nap_model_whisper", return_value=m):
            self.assertEqual(T.main([fa, fb, "--offline", "--out-dir", self.out]), 0)
            self.assertEqual(len(m.goi), 2)  # file thứ 2 không dùng nhầm văn bản của file 1
            self.assertTrue(os.path.isfile(os.path.join(self.out, "Recording_tom_tat.md")))
            self.assertTrue(os.path.isfile(os.path.join(self.out, "Recording_2_tom_tat.md")))
            # Lần chạy sau chỉ file b: không được dùng lại văn bản của a
            self.assertEqual(T.main([fb, "--offline", "--out-dir", self.out]), 0)
            self.assertEqual(len(m.goi), 3)

    def test_khong_key_tu_chuyen_offline(self):
        import io, contextlib
        out = io.StringIO()
        with mock.patch.object(T, "tom_tat_claude", side_effect=T.LoiKhongCoKey("chưa có API key")), \
             contextlib.redirect_stdout(out):
            ma, _, _ = self.chay()
        self.assertEqual(ma, 0)
        self.assertIn("1 file chỉ có bản tóm tắt OFFLINE", out.getvalue())
        self.assertIn("offline", self.doc("Họp giao ban_tom_tat.md"))

    def test_dung_claude(self):
        with mock.patch.object(T, "tom_tat_claude", return_value="## Tổng quan\nOK") as tt:
            ma, _, _ = self.chay("--tom-tat-bang", "en", "--do-ky", "high")
        self.assertEqual(ma, 0)
        van_ban, nn, ten, do_ky = tt.call_args.args
        self.assertEqual((nn, ten, do_ky), ("en", "Họp giao ban.m4a", "high"))
        self.assertIn("[00:04] Anh Nam", van_ban)
        md = self.doc("Họp giao ban_tom_tat.md")
        self.assertIn("Claude (claude-opus-5-5)", md)
        self.assertTrue(md.rstrip().endswith("OK"))

    def test_im_lang(self):
        ma, _, _ = self.chay("--offline", model=ModelGia(segs=[]))
        self.assertEqual(ma, 0)
        self.assertIn("Không nhận dạng được", self.doc("Họp giao ban_tom_tat.md"))

    def test_file_txt_tu_do(self):
        p = os.path.join(self.td, "bien_ban.txt")
        with open(p, "w", encoding="utf-8") as f:
            f.write("Chúng ta thống nhất tăng ngân sách quảng cáo thêm hai mươi phần trăm.\n"
                    "Chị Lan cần gửi kế hoạch chi tiết trước thứ sáu tuần sau.\n")
        with mock.patch.object(T, "tom_tat_claude", return_value="TT") as tt, \
             mock.patch.object(T, "nap_model_whisper") as nap:
            ma = T.main([p, "--out-dir", self.out])
        self.assertEqual(ma, 0)
        nap.assert_not_called()
        self.assertFalse(tt.call_args.args[0].startswith("["))  # không gắn mốc giả
        self.assertTrue(os.path.isfile(os.path.join(self.out, "bien_ban_tom_tat.md")))

    def test_thu_muc_va_file_loi(self):
        open(os.path.join(self.td, "ghi_chu.docx"), "w").close()
        loi = ModelGia()
        loi.transcribe = mock.Mock(side_effect=ValueError("file hỏng"))
        with mock.patch.object(T, "nap_model_whisper", return_value=loi):
            ma = T.main([self.td, os.path.join(self.td, "khong_co.mp3"), "--offline", "--out-dir", self.out])
        self.assertEqual(ma, 1)  # có file lỗi -> mã 1, nhưng không dừng giữa chừng
        self.assertEqual(loi.transcribe.call_count, 1)  # .docx bị bỏ qua khi quét thư mục

    def test_khong_co_file(self):
        self.assertEqual(T.main([os.path.join(self.td, "x.mp3"), "--out-dir", self.out]), 1)


if __name__ == "__main__":
    unittest.main()
