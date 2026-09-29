# -*- coding: utf-8 -*-
"""Kiểm thử phân tích cuộc họp: python -m unittest test_phan_tich_cuoc_hop -v
Không cần mạng/GPU/model thật: model được giả lập; phần đo ngữ điệu chạy THẬT trên audio tổng hợp."""
import io
import contextlib
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import unittest
import wave
from collections import Counter
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chan_mang
import nguoi_noi as NN
import ngu_dieu as ND
import llm_cuc_bo as LLM
import phan_tich_cuoc_hop as P

SR = 16000


def giong(tan_so, giay, bien_do=0.1):
    """Âm 'giọng' tổng hợp có hài âm (yin nhận ra cao độ ổn định)."""
    t = np.arange(int(giay * SR)) / SR
    y = sum(bien_do / k * np.sin(2 * np.pi * tan_so * k * t) for k in (1, 2, 3))
    return y.astype(np.float32)


# =====================================================================
class TestChanMang(unittest.TestCase):
    def tearDown(self):
        chan_mang.tat()

    def test_chan_ben_ngoai_cho_phep_noi_bo(self):
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        cong = srv.getsockname()[1]
        chan_mang.bat()
        try:
            with self.assertRaises(chan_mang.LoiChanMang):
                socket.create_connection(("example.com", 443), timeout=3)
            with socket.socket() as s, self.assertRaises(chan_mang.LoiChanMang):
                s.connect(("8.8.8.8", 53))
            s = socket.create_connection(("127.0.0.1", cong), timeout=3)   # nội bộ: được phép
            s.close()
            s = socket.create_connection(("localhost", cong), timeout=3)
            s.close()
            self.assertEqual(os.environ.get("NO_PROXY"), "*")
        finally:
            srv.close()

    def test_tam_mo_tra_proxy(self):
        with mock.patch.dict(os.environ, {"HTTPS_PROXY": "http://proxy.cong-ty:8080"}):
            chan_mang.bat()
            self.assertNotIn("HTTPS_PROXY", os.environ)
            with chan_mang.tam_mo():
                self.assertFalse(chan_mang.dang_bat())
                self.assertEqual(os.environ["HTTPS_PROXY"], "http://proxy.cong-ty:8080")
            self.assertTrue(chan_mang.dang_bat())
            self.assertNotIn("HTTPS_PROXY", os.environ)

    def test_bien_moi_truong(self):
        with mock.patch.dict(os.environ, {"PYANNOTE_METRICS_ENABLED": "true"}):
            chan_mang.truoc_khi_import()
            self.assertEqual(os.environ["PYANNOTE_METRICS_ENABLED"], "false")
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")


# =====================================================================
def tu(s, e, chu):
    return NN.Tu(s, e, chu)


class TestNguoiNoi(unittest.TestCase):
    def test_gan_nguoi_noi(self):
        ds = [tu(0.0, 0.5, " Chào"), tu(0.5, 1.0, " anh."),     # A
              tu(1.9, 2.4, " Vâng"),                             # chủ yếu B
              tu(5.2, 5.6, " ừ"),                                # khoảng trống, gần B (<1s)
              tu(9.0, 9.4, " ok")]                               # xa mọi đoạn -> theo từ trước
        doan = [(0.0, 1.95, "A"), (1.95, 4.5, "B"), (20.0, 25.0, "A")]
        NN.gan_nguoi_noi(ds, doan)
        self.assertEqual([t.nguoi for t in ds], ["A", "A", "B", "B", "B"])

    def test_tu_dau_luot_bi_keo_dai(self):
        # Số liệu thật (VIVOS): Whisper đặt "Khắp" 61.73–62.69 phủ lên khoảng lặng, chỉ 0.2s nằm trong đoạn A
        ds = [tu(61.2, 61.73, " này"), tu(61.73, 62.69, " Khắp"), tu(64.35, 64.53, " nơi")]
        doan = [(59.8, 61.945, "A"), (64.19, 67.73, "B")]
        NN.gan_nguoi_noi(ds, doan)
        self.assertEqual([t.nguoi for t in ds], ["A", "B", "B"])
        self.assertEqual((round(ds[1].bat_dau, 2), round(ds[1].ket_thuc, 2)), (63.95, 64.35))   # dời sát "nơi"
        self.assertEqual(len(NN.chia_don_vi(ds)), 2)   # "Khắp nơi" chung 1 đơn vị
        # Từ cuối nằm gọn trong đoạn của mình thì giữ nguyên
        ds = [tu(61.2, 61.7, " này"), tu(61.7, 61.9, " thôi"), tu(64.35, 64.53, " nơi")]
        NN.gan_nguoi_noi(ds, doan)
        self.assertEqual([t.nguoi for t in ds], ["A", "A", "B"])

    def test_gan_nguoi_noi_khong_co_doan(self):
        ds = NN.gan_nguoi_noi([tu(0, 1, " a")], [])
        self.assertEqual(ds[0].nguoi, NN.KHONG_RO)

    def test_chia_don_vi(self):
        ds = [tu(0, 0.4, " Một"), tu(0.4, 0.8, " hai."),
              tu(3.0, 3.4, " Ba"),                       # nghỉ > 1.5s -> đơn vị mới
              tu(3.4, 3.8, " bốn")]
        for t in ds:
            t.nguoi = "A"
        ds.append(tu(3.8, 4.2, " năm"))
        ds[-1].nguoi = "B"                               # đổi người
        dv = NN.chia_don_vi(ds)
        self.assertEqual([(d.nguoi, d.noi_dung) for d in dv],
                         [("A", "Một hai."), ("A", "Ba bốn"), ("B", "năm")])

    def test_chia_don_vi_dai_qua(self):
        ds = [tu(i * 0.5, i * 0.5 + 0.5, " từ") for i in range(200)]   # 100 giây liền
        for t in ds:
            t.nguoi = "A"
        dv = NN.chia_don_vi(ds, dai_toi_da=30)
        self.assertTrue(all(d.thoi_luong <= 30.5 for d in dv))
        self.assertEqual(sum(d.so_tu for d in dv), 200)

    def test_ten_hien_thi(self):
        dv = [NN.DonVi("SPEAKER_03", [tu(0, 1, " a")]), NN.DonVi("SPEAKER_00", [tu(1, 2, " b")]),
              NN.DonVi(NN.KHONG_RO, [tu(2, 3, " c")])]
        ten = NN.dat_ten_hien_thi(dv, {"Người nói 2": "Chị Lan"})
        self.assertEqual(ten, {"SPEAKER_03": "Người nói 1", "SPEAKER_00": "Chị Lan", "?": "Không rõ"})
        self.assertEqual(NN.dat_ten_hien_thi(dv, {"SPEAKER_03": "Anh Nam"})["SPEAKER_03"], "Anh Nam")

    def test_ngat_loi(self):
        doan = [(0, 10, "A"), (4, 6, "B"),     # B chen vào giữa A -> B ngắt A
                (9.5, 12, "C"),                # A chỉ còn 0.5s -> chuyển lượt bình thường
                (20, 30, "B"), (20.5, 22, "A")]  # A chen vào B mới nói 0.5s -> không tính
        self.assertEqual(NN.dem_ngat_loi(doan), Counter({("B", "A"): 1}))

    def test_thong_ke(self):
        dv = [NN.DonVi("A", [tu(0, 30, " x")]), NN.DonVi("B", [tu(30, 40, " y z")]),
              NN.DonVi("A", [tu(40, 70, " w")])]
        dv[2].cam_xuc = {"nhan": "angry", "diem": 0.8, "noi_bat": True}
        dv[2].nhan = ["nói to"]
        tk = NN.thong_ke(dv, Counter({("B", "A"): 2}))
        self.assertAlmostEqual(tk["A"]["ti_le"], 60 / 70)
        self.assertEqual((tk["A"]["so_luot"], tk["B"]["so_luot"]), (2, 1))
        self.assertEqual(tk["A"]["cam_xuc"], Counter({"angry": 1}))
        self.assertEqual((tk["A"]["noi_to"], tk["A"]["bi_ngat"], tk["B"]["ngat_loi"]), (1, 2, 2))

    def test_luu_va_doc_lai(self):
        d = NN.DonVi("A", [tu(1, 2, " xin"), tu(2, 3, " chào")])
        d.ngu_dieu = {"am_luong_db": -20.0}
        d.cam_xuc = {"nhan": "happy", "diem": 0.7, "noi_bat": True}
        lai = NN.DonVi.from_dict(json.loads(json.dumps(d.to_dict())))
        self.assertEqual((lai.nguoi, lai.noi_dung, lai.bat_dau, lai.ket_thuc), ("A", "xin chào", 1, 3))
        self.assertEqual((lai.ngu_dieu, lai.cam_xuc), (d.ngu_dieu, d.cam_xuc))


# =====================================================================
class TestNguDieu(unittest.TestCase):
    def test_do_mot_doan_cao_do_am_luong(self):
        tram = ND.do_mot_doan(giong(120, 2, 0.05), so_tu=8)
        cao = ND.do_mot_doan(giong(240, 2, 0.2), so_tu=8)
        self.assertAlmostEqual(cao["cao_do_st"] - tram["cao_do_st"], 12, delta=0.5)   # gấp đôi = 12 nửa cung
        self.assertAlmostEqual(cao["am_luong_db"] - tram["am_luong_db"], 12, delta=0.5)  # x4 biên độ ~ +12 dB
        self.assertAlmostEqual(tram["toc_do"], 4.0)
        self.assertEqual(ND.do_mot_doan(giong(120, 0.1), 1), {})   # quá ngắn

    def _nguoi(self, ten, n, bat_dau=0):
        ds = []
        for i in range(n):
            s = bat_dau + i * 3
            ds.append(NN.DonVi(ten, [tu(s + k * 0.25, s + k * 0.25 + 0.25, " từ") for k in range(10)]))
        return ds

    def test_nhan_so_voi_muc_thuong(self):
        ds = self._nguoi("A", 6)
        audio = np.zeros(SR * 20, dtype=np.float32)
        for dv in ds[:-1]:
            audio[int(dv.bat_dau * SR):int(dv.ket_thuc * SR)] = giong(130, dv.ket_thuc - dv.bat_dau, 0.05)
        cuoi = ds[-1]   # đoạn cuối: to hơn ~12 dB, cao hơn 5 nửa cung
        audio[int(cuoi.bat_dau * SR):int(cuoi.ket_thuc * SR)] = giong(130 * 2 ** (5 / 12), 2.5, 0.2)
        ND.do_ngu_dieu(ds, audio, in_tien_do=False)
        self.assertEqual(ds[0].nhan, [])
        self.assertIn("nói to", cuoi.nhan)
        self.assertIn("giọng cao", cuoi.nhan)

    def test_it_mau_khong_gan_nhan(self):
        ds = self._nguoi("A", 3)
        audio = np.concatenate([giong(130, 9, 0.02), giong(260, 3, 0.3)])
        ND.do_ngu_dieu(ds, audio, in_tien_do=False)
        self.assertTrue(all(d.nhan == [] for d in ds))   # < 5 đoạn: chưa đủ để biết "mức thường"

    def test_nhanh_cham(self):
        ds = self._nguoi("A", 6)
        ds[-1] = NN.DonVi("A", [tu(15 + k * 0.1, 15 + k * 0.1 + 0.1, " từ") for k in range(25)])  # 10 từ/giây
        audio = giong(130, 20, 0.05)
        ND.do_ngu_dieu(ds, audio, in_tien_do=False)
        self.assertIn("nói nhanh", ds[-1].nhan)

    def test_cam_xuc(self):
        class ModelGia:
            def __init__(self):
                self.goi = 0

            def generate(self, clip, **kw):
                self.goi += 1
                assert kw == {"granularity": "utterance", "extract_embedding": False}
                diem = [0.1, 0.75, 0.05, 0.1] if self.goi == 1 else [0.8, 0.1, 0.05, 0.05]
                return [{"labels": ["中立/neutral", "生气/angry", "开心/happy", "<unk>"], "scores": diem}]

        ds = [NN.DonVi("A", [tu(0, 2, " a")]), NN.DonVi("A", [tu(2, 4, " b")]),
              NN.DonVi("A", [tu(4, 4.5, " c")])]   # < 1 giây -> bỏ qua
        m = ModelGia()
        ND.phan_tich_cam_xuc(ds, np.zeros(SR * 5, dtype=np.float32), m, nguong=0.6, in_tien_do=False)
        self.assertEqual(m.goi, 2)
        self.assertEqual((ds[0].cam_xuc["nhan"], ds[0].cam_xuc["noi_bat"]), ("angry", True))
        self.assertEqual((ds[1].cam_xuc["nhan"], ds[1].cam_xuc["noi_bat"]), ("neutral", False))
        self.assertIsNone(ds[2].cam_xuc)
        ND.so_sanh_muc_thuong(ds)
        self.assertEqual(ds[0].nhan, ["giận dữ 0.75"])

    def test_thoi_diem_dang_chu_y(self):
        ds = []
        for i in range(10):
            d = NN.DonVi("A", [tu(i * 10, i * 10 + 5, " x")])
            d.ngu_dieu = {"lech_db": 9 if i in (2, 3, 8) else 0}
            ds.append(d)
        chon = ND.thoi_diem_dang_chu_y(ds, cach_nhau=15)
        self.assertEqual([dv.bat_dau for _, dv in chon], [20, 80])   # 30 quá gần 20 -> bỏ


# =====================================================================
class _OllamaGia(BaseHTTPRequestHandler):
    nhan = []
    tu_choi_think = False
    models = ["qwen3.8:27b"]

    def log_message(self, *a):
        pass

    def do_GET(self):
        body = json.dumps({"models": [{"name": m, "model": m} for m in self.models]}).encode()
        self.send_response(200)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        du_lieu = json.loads(self.rfile.read(n))
        _OllamaGia.nhan.append((self.path, du_lieu))
        if self.path == "/api/generate":
            self.send_response(200)
            self.end_headers()
            return
        if _OllamaGia.tu_choi_think and "think" in du_lieu:
            body = b'{"error":"\\"qwen2\\" does not support thinking"}'
            self.send_response(400)
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        noi_dung = du_lieu["messages"][-1]["content"]
        tra_loi = f"GHI CHÚ({len(noi_dung)})" if "Phần" in noi_dung else "## Tổng quan\nBIÊN BẢN CUỐI"
        dong = [{"message": {"content": tra_loi[:5]}, "done": False},
                {"message": {"content": tra_loi[5:]}, "done": False},
                {"message": {"content": ""}, "done": True, "done_reason": "stop"}]
        body = "".join(json.dumps(x, ensure_ascii=False) + "\n" for x in dong).encode()
        self.send_response(200)
        self.send_header("content-type", "application/x-ndjson")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class CoOllamaGia(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), _OllamaGia)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls._env = mock.patch.dict(os.environ, {"OLLAMA_HOST": f"127.0.0.1:{cls.srv.server_port}"})
        cls._env.start()

    @classmethod
    def tearDownClass(cls):
        cls._env.stop()
        cls.srv.shutdown()

    def setUp(self):
        _OllamaGia.nhan.clear()
        _OllamaGia.tu_choi_think = False
        _OllamaGia.models = ["qwen3.8:27b"]


class TestLLM(CoOllamaGia):
    def test_chia_phan(self):
        phan = LLM.chia_phan(["a" * 40, "b" * 40, "c" * 40], toi_da_ky_tu=90)
        self.assertEqual([len(p) for p in phan], [2, 1])

    def test_chat_stream(self):
        kq = LLM.chat("qwen3.8:27b", "HT", "Phần 1/1: abc", in_tien_do=False)
        self.assertTrue(kq.startswith("GHI CHÚ("))
        _, du_lieu = _OllamaGia.nhan[0]
        self.assertEqual((du_lieu["think"], du_lieu["options"]["num_ctx"]), (False, 16384))
        self.assertEqual(du_lieu["messages"][0], {"role": "system", "content": "HT"})

    def test_model_khong_ho_tro_think(self):
        _OllamaGia.tu_choi_think = True
        self.assertIn("BIÊN BẢN", LLM.chat("m", "HT", "x", in_tien_do=False))
        self.assertNotIn("think", _OllamaGia.nhan[-1][1])

    def test_bo_suy_nghi(self):
        self.assertEqual(LLM.bo_suy_nghi("Okay, let's think...\n</think>\n\n### Nội dung"), "### Nội dung")
        self.assertEqual(LLM.bo_suy_nghi("<think>abc</think>\nKQ"), "KQ")
        self.assertEqual(LLM.bo_suy_nghi("KQ\n<think>bị cắt"), "KQ")
        self.assertEqual(LLM.bo_suy_nghi("## Tổng quan"), "## Tổng quan")

    def test_kiem_tra(self):
        LLM.kiem_tra("qwen3.8:27b")
        with self.assertRaisesRegex(LLM.LoiOllama, "ollama pull khac:7b"):
            LLM.kiem_tra("khac:7b")

    def test_khong_co_ollama(self):
        with mock.patch.dict(os.environ, {"OLLAMA_HOST": "127.0.0.1:1"}):
            with self.assertRaisesRegex(LLM.LoiOllama, "Không kết nối được Ollama"):
                LLM.kiem_tra("x")

    def test_ollama_tu_xa_bi_chan(self):
        chan_mang.bat()
        try:
            with mock.patch.dict(os.environ, {"OLLAMA_HOST": "ollama.may-khac.vn:11434"}):
                with self.assertRaises(LLM.LoiOllama):
                    LLM.kiem_tra("x")
            self.assertIn("ollama.may-khac.vn", chan_mang.nhat_ky)
        finally:
            chan_mang.tat()

    def test_map_reduce_nhieu_tang(self):
        goi = []

        def goi_gia(model, he_thong, noi_dung, **kw):
            goi.append((he_thong, noi_dung, kw["num_ctx"]))
            return "g" * 300   # mỗi ghi chú dài -> buộc gộp tầng
        dong = [f"[0:00:{i:02d}] A: " + "x" * 90 for i in range(40)]
        kq = LLM.tom_tat_map_reduce(dong, "m", "MAP", "REDUCE", P.yeu_cau_map, P.yeu_cau_reduce,
                                    toi_da_ky_tu=300, in_tien_do=False, goi=goi_gia)
        self.assertEqual(kq, "g" * 300)
        so_map = sum(1 for h, n, _ in goi if n.startswith("Phần"))
        self.assertEqual(so_map, 20)
        self.assertTrue(any(n.startswith("Gộp các ghi chú") for _, n, _ in goi))
        self.assertEqual(goi[-1][0], "REDUCE")
        self.assertLessEqual(len(goi[-1][1]), 300 * 3 + 500)   # lần cuối vừa ngữ cảnh


# =====================================================================
class TestBuocModel(unittest.TestCase):
    """Bước gọi Whisper / pyannote với model giả nhưng đúng kiểu dữ liệu thật."""

    def args(self, **kw):
        a = P.tao_parser().parse_args(["x.wav", "--models", self.models, *kw.pop("them", [])])
        return a

    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.models = self.td
        for ten in P.TEN_MODEL.values():
            os.makedirs(os.path.join(self.td, ten))

    def tearDown(self):
        shutil.rmtree(self.td)

    def test_chep_loi(self):
        from collections import namedtuple
        W = namedtuple("W", "start end word")
        S = namedtuple("S", "start end text words")
        I = namedtuple("I", "language language_probability duration all_language_probs")

        class WM:
            def __init__(self, path, **kw):
                WM.kw = (path, kw)

            def transcribe(self, audio, **kw):
                WM.tk = kw
                segs = [S(0, 1, " Xin chào.", [W(0, 0.4, " Xin"), W(0.4, 1, " chào.")]),
                        S(1, 2, " Hãy subscribe cho kênh Ghiền Mì Gõ", [W(1, 2, " x")]),
                        S(2, 3, " Привет", [])]
                return iter(segs), I("vi", 0.9, 3.0, None)
        with mock.patch("faster_whisper.WhisperModel", WM), contextlib.redirect_stdout(io.StringIO()):
            kq = P.buoc_chep_loi(np.zeros(SR * 3, dtype=np.float32), self.args(), "cuda")
        self.assertTrue(WM.kw[0].endswith("whisper-large-v3"))
        self.assertEqual(WM.kw[1]["compute_type"], "float16")
        self.assertTrue(WM.tk["word_timestamps"])
        self.assertEqual(kq["tu"], [[0, 0.4, " Xin"], [0.4, 1, " chào."], [2, 3, " Привет"]])
        self.assertEqual(kq["ngon_ngu_dem"], {"vi": 1, "ru": 1})

    def _ann(self, ds):
        from pyannote.core import Annotation, Segment
        a = Annotation()
        for s, e, n in ds:
            a[Segment(s, e)] = n
        return a

    def _chay_tach(self, tra_ve, them=()):
        class PipeGia:
            def to(self, dev):
                PipeGia.dev = dev
                return self

            def __call__(self, vao, hook=None, **kw):
                PipeGia.vao, PipeGia.kw = vao, kw
                return tra_ve
        with mock.patch("pyannote.audio.Pipeline.from_pretrained", return_value=PipeGia()) as fp, \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            kq = P.buoc_tach_nguoi_noi(np.zeros(SR * 2, dtype=np.float32), self.args(them=list(them)), "cpu")
        self.assertTrue(fp.call_args.args[0].endswith("pyannote-community-1"))
        self.assertEqual(tuple(PipeGia.vao["waveform"].shape), (1, SR * 2))
        return kq, PipeGia.kw

    def test_tach_nguoi_noi_pyannote4(self):
        from pyannote.audio.pipelines.speaker_diarization import DiarizeOutput
        out = DiarizeOutput(speaker_diarization=self._ann([(0, 5, "A"), (4, 8, "B")]),
                            exclusive_speaker_diarization=self._ann([(0, 4, "A"), (4, 8, "B")]))
        kq, kw = self._chay_tach(out, ["--it-nhat", "2", "--nhieu-nhat", "6"])
        self.assertEqual(kw, {"min_speakers": 2, "max_speakers": 6})
        self.assertEqual(kq["rieng"], [[0, 4, "A"], [4, 8, "B"]])
        self.assertEqual(kq["chong"], [[0, 5, "A"], [4, 8, "B"]])

    def test_tach_nguoi_noi_legacy(self):
        kq, kw = self._chay_tach(self._ann([(0, 5, "A"), (4, 8, "B")]), ["--so-nguoi", "2"])
        self.assertEqual(kw, {"num_speakers": 2})
        self.assertEqual(kq["rieng"], [[0, 5, "A"], [5, 8, "B"]])


# =====================================================================
def ghi_wav(duong_dan, audio):
    with wave.open(duong_dan, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())


class TestToanBo(CoOllamaGia):
    """Chạy main() đầu-cuối: Whisper/pyannote/emotion2vec giả lập, ngữ điệu + Ollama giả chạy thật."""

    def setUp(self):
        super().setUp()
        self.td = tempfile.mkdtemp()
        self.out = os.path.join(self.td, "kq")
        self.f = os.path.join(self.td, "Họp giao ban.wav")
        # 3 người, mỗi người 6 lượt 3 giây, B ở giữa có 1 lượt quát to
        audio, self.tu, self.doan = [], [], []
        t = 0.0
        for luot in range(18):
            nguoi, f0 = [("A", 120), ("B", 200), ("C", 160)][luot % 3]
            to = nguoi == "B" and luot == 10
            audio.append(giong(f0 * (1.5 if to else 1), 3, 0.3 if to else 0.05))
            self.doan.append([t, t + 3, f"SPEAKER_{nguoi}"])
            for k in range(6):
                chu = " quyết định." if k == 5 else " nội dung"
                self.tu.append([t + k * 0.5, t + k * 0.5 + 0.45, chu])
            t += 3
        ghi_wav(self.f, np.concatenate(audio))
        self.models = os.path.join(self.td, "models")
        for ten in P.TEN_MODEL.values():
            os.makedirs(os.path.join(self.models, ten))

    def tearDown(self):
        shutil.rmtree(self.td)
        chan_mang.tat()
        super().tearDown()

    def chay(self, *them):
        asr = {"ngon_ngu": "vi", "thoi_luong": 54.0, "tu": self.tu, "ngon_ngu_dem": {"vi": 18}}
        nn = {"rieng": self.doan, "chong": self.doan + [[31.0, 33.0, "SPEAKER_C"]]}

        class CamXucGia:
            def generate(self, clip, **kw):
                to = float(np.sqrt(np.mean(clip ** 2))) > 0.1
                return [{"labels": ["生气/angry", "中立/neutral"], "scores": [0.9, 0.1] if to else [0.1, 0.9]}]
        out = io.StringIO()
        with mock.patch.object(P, "buoc_chep_loi", return_value=asr) as a, \
             mock.patch.object(P, "buoc_tach_nguoi_noi", return_value=nn) as b, \
             mock.patch.object(ND, "nap_model_cam_xuc", return_value=CamXucGia()) as c, \
             mock.patch.object(P, "chon_thiet_bi", return_value="cpu"), \
             contextlib.redirect_stdout(out):
            ma = P.main([self.f, "--out-dir", self.out, "--models", self.models, *them])
        chan_mang.tat()
        return ma, (a.call_count, b.call_count, c.call_count), out.getvalue()

    def doc(self, ten):
        with open(os.path.join(self.out, ten), encoding="utf-8") as f:
            return f.read()

    def test_day_du_va_dung_lai(self):
        ma, goi, log = self.chay("--so-nguoi", "3")
        self.assertEqual(ma, 0, log)
        self.assertEqual(goi, (1, 1, 1))
        self.assertIn("CHẾ ĐỘ CẤM MẠNG: BẬT", log)

        van_ban = self.doc("Họp giao ban_van_ban.txt").splitlines()
        self.assertEqual(len(van_ban), 18)
        self.assertTrue(van_ban[0].startswith("[0:00:00] Người nói 1: nội dung"))
        luot_to = van_ban[10]
        self.assertTrue(luot_to.startswith("[0:00:30] Người nói 2 [["), luot_to)
        self.assertIn("giận dữ 0.90", luot_to)
        self.assertIn("nói to", luot_to)
        self.assertIn("giọng cao", luot_to)

        md = self.doc("Họp giao ban_bien_ban.md")
        self.assertIn("Số người nói: 3", md)
        self.assertIn("| Người nói 2 | 0:00:18 | 33% | 6 |", md)
        self.assertIn("Người nói 3 ngắt lời Người nói 2: 1 lần", md)
        self.assertIn("**[0:00:30] Người nói 2**", md)          # thời điểm đáng chú ý
        self.assertIn("BIÊN BẢN CUỐI", md)
        self.assertIn("100% offline", md)
        self.assertIn("Người nói 2: nội dung", self.doc("Họp giao ban_phu_de.srt"))
        # Ollama: có gọi map + reduce, và được yêu cầu nhả VRAM
        duong = [p for p, _ in _OllamaGia.nhan]
        self.assertGreaterEqual(duong.count("/api/chat"), 2)
        self.assertEqual(duong[-1], "/api/generate")
        self.assertIn("[[giận dữ 0.90", _OllamaGia.nhan[0][1]["messages"][1]["content"])

        # Lần 2: đặt tên thật -> không chạy lại bước nặng nào
        ma, goi, log = self.chay("--so-nguoi", "3", "--ten", "Người nói 2=Chị Lan")
        self.assertEqual((ma, goi), (0, (0, 0, 0)))
        self.assertIn("Chị Lan ngắt", self.doc("Họp giao ban_bien_ban.md").replace(
            "Người nói 3 ngắt lời Chị Lan", "Chị Lan ngắt"))
        self.assertIn("] Chị Lan [[", self.doc("Họp giao ban_van_ban.txt"))

        # Đổi số người nói -> chỉ chạy lại tách người nói và các bước sau nó
        ma, goi, _ = self.chay("--so-nguoi", "4")
        self.assertEqual(goi, (0, 1, 1))

    def test_khong_co_ollama_van_ra_bao_cao(self):
        with mock.patch.dict(os.environ, {"OLLAMA_HOST": "127.0.0.1:1"}):
            ma, _, log = self.chay("--khong-cam-xuc")
        self.assertEqual(ma, 0, log)
        md = self.doc("Họp giao ban_bien_ban.md")
        self.assertIn("trích câu đơn giản", md)
        self.assertIn("Thống kê người nói", md)

    def test_dung_claude_mo_mang_tam_thoi(self):
        trang_thai = []

        def claude_gia(van_ban, *a, **kw):
            trang_thai.append(chan_mang.dang_bat())
            self.assertIn("[[", van_ban)
            self.assertIn("Quan điểm và thái độ", kw["huong_dan"])
            return "## Tổng quan\nCLAUDE"
        with mock.patch.object(P.T, "tom_tat_claude", side_effect=claude_gia):
            ma, _, log = self.chay("--dung-claude")
        self.assertEqual(ma, 0, log)
        self.assertEqual(trang_thai, [False])   # chỉ mở mạng lúc gửi Claude
        md = self.doc("Họp giao ban_bien_ban.md")
        self.assertIn("CLAUDE", md)
        self.assertIn("đã được gửi lên Anthropic", md)

    def test_thieu_model(self):
        shutil.rmtree(os.path.join(self.models, "whisper-large-v3"))
        with mock.patch.object(P, "chon_thiet_bi", return_value="cpu"), \
             contextlib.redirect_stdout(io.StringIO()) as out:
            ma = P.main([self.f, "--out-dir", self.out, "--models", self.models])
        self.assertEqual(ma, 1)
        self.assertIn("tai_model.py", out.getvalue())


# =====================================================================
class TestTaiModel(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_mat_mang_bao_loi_ro_rang(self):
        import tai_model
        with mock.patch("huggingface_hub.snapshot_download", side_effect=OSError("403 Forbidden")), \
             contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertFalse(tai_model.tai(self.tmp, None))
        self.assertIn("huggingface.co", out.getvalue())

    def test_kiem_tra_thieu_thu_muc_khong_goi_thu_vien(self):
        import tai_model
        with mock.patch.object(chan_mang, "bat"), \
             mock.patch("llm_cuc_bo.kiem_tra"), \
             mock.patch.object(ND, "nap_model_cam_xuc") as nap, \
             contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertFalse(tai_model.kiem_tra(self.tmp, "qwen"))
        nap.assert_not_called()
        self.assertEqual(out.getvalue().count("chưa có thư mục model"), 3)

    def test_cam_xuc_thieu_thu_muc(self):
        with self.assertRaises(RuntimeError) as e:
            ND.nap_model_cam_xuc(os.path.join(self.tmp, "khong_co"), "cpu")
        self.assertIn("tai_model.py", str(e.exception))


if __name__ == "__main__":
    unittest.main()
