# -*- coding: utf-8 -*-
"""Chạy: python -m unittest test_tro_ly_ai -v   (trong thư mục tro_ly_ai)"""
import json, os, shutil, tempfile, threading, time, unicodedata, unittest, urllib.request, zipfile

import tro_ly_ai as t


def ma_cp1258(s):
    """Mã hóa như Windows-1258 thật: chữ có sẵn trong bảng mã giữ nguyên, dấu thanh tách rời."""
    out = b""
    for c in s:
        for thu in (c, unicodedata.normalize("NFC", unicodedata.normalize("NFD", c)[:2]) +
                    unicodedata.normalize("NFD", c)[2:], unicodedata.normalize("NFD", c)):
            try:
                out += thu.encode("cp1258")
                break
            except UnicodeEncodeError:
                pass
    return out


def tao_docx(path, doan):
    body = "".join(f"<w:p><w:r><w:t>{d}</w:t></w:r></w:p>" for d in doan)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("word/document.xml",
                   '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                   f"<w:body>{body}</w:body></w:document>")


def tao_pptx(path, trang):
    with zipfile.ZipFile(path, "w") as z:
        for i, chu in enumerate(trang, 1):
            z.writestr(f"ppt/slides/slide{i}.xml",
                       '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>' + chu + "</a:t></a:r></a:p></p:sld>")


def tao_xlsx(path, sheet_ten, hang):
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    shared = [v for h in hang for v in h]
    rows = "".join("<row>" + "".join(f'<c t="s"><v>{shared.index(v)}</v></c>' for v in h) + "</row>" for h in hang)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/workbook.xml",
                   f'<workbook {ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   f'<sheets><sheet name="{sheet_ten}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/sharedStrings.xml", f"<sst {ns}>" + "".join(f"<si><t>{v}</t></si>" for v in shared) + "</sst>")
        z.writestr("xl/worksheets/sheet1.xml", f"<worksheet {ns}><sheetData>{rows}</sheetData></worksheet>")


class OllamaGia:
    """Giả lập Ollama: vector = đếm chữ cái không dấu; chat trả lời bằng đoạn trích đầu tiên."""
    lan_chat = []

    def __init__(self, url, timeout=600):
        pass

    def co_mo_hinh(self, ten):
        return True

    def danh_sach_mo_hinh(self):
        return ["qwen2.5:7b", "bge-m3:latest"]

    def nhung(self, model, texts):
        out = []
        for s in texts:
            v = [0.0] * 26
            for ch in t.bo_dau(s):
                if "a" <= ch <= "z":
                    v[ord(ch) - 97] += 1
            out.append(v)
        return out

    def chat(self, model, messages, moi_token=None):
        OllamaGia.lan_chat.append(messages)
        tl = "Theo tài liệu [1], hợp đồng hết hạn ngày 31/12/2026."
        if moi_token:
            for tu in tl.split(" "):
                moi_token(tu + " ")
        return tl


class CoSo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.goc = os.path.join(self.tmp, "may")
        self.du_lieu = os.path.join(self.tmp, "du_lieu")
        os.makedirs(os.path.join(self.goc, "Hợp đồng"))
        os.makedirs(os.path.join(self.goc, "node_modules", "x"))
        os.makedirs(os.path.join(self.goc, ".git"))
        with open(os.path.join(self.goc, "Hợp đồng", "thue_nha.txt"), "w", encoding="utf-8") as f:
            f.write("Hợp đồng thuê nhà số 12. Thời hạn thuê kết thúc ngày 31/12/2026. Giá thuê 5 triệu đồng.")
        with open(os.path.join(self.goc, "ghi_chu_cp1258.txt"), "wb") as f:
            f.write(ma_cp1258("Ghi chú cũ: đi chợ mua cà phê"))
        tao_docx(os.path.join(self.goc, "bao_cao_quy3.docx"), ["Báo cáo doanh thu quý 3", "Doanh thu tăng 15%"])
        tao_xlsx(os.path.join(self.goc, "chi_tieu.xlsx"), "Tháng 9", [["Khoản", "Số tiền"], ["Tiền điện", "850000"]])
        tao_pptx(os.path.join(self.goc, "thuyet_trinh.pptx"), ["Kế hoạch du lịch Đà Lạt", "Lịch trình 3 ngày"])
        with open(os.path.join(self.goc, "mat_khau_ngan_hang.txt"), "w", encoding="utf-8") as f:
            f.write("tai khoan: abc  mat khau: SIEU_BI_MAT_123")
        with open(os.path.join(self.goc, "node_modules", "x", "rac.txt"), "w") as f:
            f.write("không được lập chỉ mục")
        with open(os.path.join(self.goc, "anh.jpg"), "wb") as f:
            f.write(b"\xff\xd8" + b"x" * 5000)
        with open(os.path.join(self.goc, "anh_ban_sao.jpg"), "wb") as f:
            f.write(b"\xff\xd8" + b"x" * 5000)
        self.kho = t.Kho(self.du_lieu)
        self.kho.cau_hinh["dung_ngu_nghia"] = False
        self.im = lambda *a: None

    def tearDown(self):
        self.kho.dong()
        t._CACHE_VECTOR.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def ten_tim_thay(self, cau, **kw):
        return [d["name"] for d in t.tim_file(self.kho, cau, **kw)]


class TestQuet(CoSo):
    def test_quet_doc_noi_dung_va_bo_qua(self):
        tk = t.quet(self.kho, [self.goc], in_ra=self.im)
        self.assertEqual(tk["moi"], 8)   # rac.txt trong node_modules bị bỏ qua
        paths = [r[0] for r in self.kho.conn.execute("SELECT path FROM files")]
        self.assertFalse(any("node_modules" in p for p in paths))
        noi_dung = " ".join(r[0] for r in self.kho.conn.execute("SELECT text FROM chunks"))
        for cum in ("thuê nhà", "cà phê", "Doanh thu tăng", "Tiền điện | 850000", "[Sheet Tháng 9]", "Đà Lạt"):
            self.assertIn(cum, noi_dung)
        self.assertNotIn("SIEU_BI_MAT", noi_dung)   # file nhạy cảm chỉ lưu tên

    def test_quet_lai_chi_doc_file_thay_doi(self):
        t.quet(self.kho, [self.goc], in_ra=self.im)
        tk = t.quet(self.kho, [self.goc], in_ra=self.im)
        self.assertEqual((tk["moi"], tk["cap_nhat"], tk["xoa"]), (0, 0, 0))
        p = os.path.join(self.goc, "Hợp đồng", "thue_nha.txt")
        with open(p, "a", encoding="utf-8") as f:
            f.write(" Đặt cọc 10 triệu.")
        os.utime(p, (time.time() + 5, time.time() + 5))
        os.remove(os.path.join(self.goc, "anh_ban_sao.jpg"))
        tk = t.quet(self.kho, [self.goc], in_ra=self.im)
        self.assertEqual((tk["moi"], tk["cap_nhat"], tk["xoa"]), (0, 1, 1))
        self.assertIn("thue_nha.txt", self.ten_tim_thay("dat coc"))
        n_fts = self.kho.conn.execute("SELECT count(*) FROM fts").fetchone()[0]
        n_chunks = self.kho.conn.execute("SELECT count(*) FROM chunks").fetchone()[0]
        self.assertEqual(n_fts, n_chunks)   # không để sót dòng mồ côi

    def test_chia_doan(self):
        text = ("Câu thứ nhất khá dài. " * 200).strip()
        doan = t.chia_doan(text)
        self.assertGreater(len(doan), 1)
        self.assertTrue(all(len(d) <= t.DAI_DOAN for d in doan))
        self.assertEqual(t.chia_doan("   \n\n "), [])


class TestTim(CoSo):
    def setUp(self):
        super().setUp()
        t.quet(self.kho, [self.goc], in_ra=self.im)

    def test_tim_khong_dau(self):
        self.assertEqual(self.ten_tim_thay("hop dong thue nha")[0], "thue_nha.txt")
        self.assertIn("bao_cao_quy3.docx", self.ten_tim_thay("doanh thu"))
        self.assertIn("chi_tieu.xlsx", self.ten_tim_thay("tiền điện"))

    def test_tim_theo_ten_va_thu_muc(self):
        self.assertIn("anh.jpg", self.ten_tim_thay("anh"))
        self.assertIn("thue_nha.txt", self.ten_tim_thay("hợp đồng", loai="Tài liệu"))

    def test_loc_theo_loai(self):
        self.assertEqual(self.ten_tim_thay("doanh thu", loai="Bảng tính"), [])
        self.assertEqual(self.ten_tim_thay("du lich", duoi="pptx"), ["thuyet_trinh.pptx"])

    def test_cau_hoi_tu_nhien_van_ra(self):
        # AND không khớp hết -> tự chuyển OR, bỏ từ dừng
        self.assertEqual(self.ten_tim_thay("hợp đồng thuê nhà của tôi hết hạn khi nào vậy")[0], "thue_nha.txt")

    def test_ky_tu_dac_biet_khong_lam_loi(self):
        for cau in ('"', "AND OR NOT", "a*b(c)", "", "   "):
            t.tim_file(self.kho, cau)

    def test_trich_ngan(self):
        s = t.trich_ngan("x " * 300 + "Hợp đồng thuê nhà hết hạn", "hop dong")
        self.assertIn("Hợp đồng", s)


class TestNguNghiaVaHoi(CoSo):
    def setUp(self):
        super().setUp()
        self._goc = t.Ollama
        t.Ollama = OllamaGia
        self.kho.cau_hinh["dung_ngu_nghia"] = True

    def tearDown(self):
        t.Ollama = self._goc
        super().tearDown()

    def test_tao_vector_va_tron_ket_qua(self):
        tk = t.quet(self.kho, [self.goc], in_ra=self.im)
        self.assertGreater(tk["nhung"], 0)
        con = self.kho.conn.execute("SELECT count(*) FROM chunks WHERE emb IS NULL AND text<>''").fetchone()[0]
        self.assertEqual(con, 0)
        self.assertTrue(t._tim_ngu_nghia(self.kho, "doanh thu quy", 5))
        self.assertIn("bao_cao_quy3.docx", self.ten_tim_thay("doanh thu"))
        # đổi mô hình nhúng -> vector cũ bị xóa để tạo lại
        self.kho.cau_hinh["mo_hinh_nhung"] = "mo-hinh-khac"
        self.assertEqual(t._tim_ngu_nghia(self.kho, "doanh thu", 5), [])

    def test_hoi_co_nguon(self):
        t.quet(self.kho, [self.goc], in_ra=self.im)
        tokens, nguon_cb = [], []
        tl, nguon = t.hoi(self.kho, "hợp đồng thuê nhà hết hạn khi nào?", moi_token=tokens.append,
                          moi_nguon=nguon_cb.extend)
        self.assertIn("[1]", tl)
        self.assertEqual(nguon[0]["name"], "thue_nha.txt")
        self.assertEqual(nguon, nguon_cb)
        self.assertTrue(tokens)
        noi_dung_gui = OllamaGia.lan_chat[-1][-1]["content"]
        self.assertIn("31/12/2026", noi_dung_gui)
        self.assertIn("TỔNG QUAN", noi_dung_gui)
        self.assertNotIn("SIEU_BI_MAT", json.dumps(OllamaGia.lan_chat, ensure_ascii=False))


class TestOllamaChiLocal(unittest.TestCase):
    def test_tu_choi_may_khac(self):
        with self.assertRaises(t.LoiOllama):
            t.Ollama("http://api.example.com:11434")
        t.Ollama("http://localhost:11434")

    def test_bao_loi_ro_khi_ollama_tat(self):
        with self.assertRaises(t.LoiOllama):
            t.Ollama("http://127.0.0.1:9", timeout=2).danh_sach_mo_hinh()


class TestQuanLy(CoSo):
    def test_trung_lap(self):
        t.quet(self.kho, [self.goc], in_ra=self.im)
        ds = t.tim_trung_lap(self.kho, in_ra=self.im)
        self.assertEqual(len(ds), 1)
        self.assertEqual(sorted(os.path.basename(f["path"]) for f in ds[0]["files"]), ["anh.jpg", "anh_ban_sao.jpg"])
        self.assertEqual(ds[0]["lang_phi"], 5002)

    def test_thong_ke(self):
        t.quet(self.kho, [self.goc], in_ra=self.im)
        tk = t.thong_ke(self.kho)
        self.assertEqual(tk["so_file"], 8)
        self.assertEqual({x["loai"] for x in tk["theo_loai"]} >= {"Tài liệu", "Ảnh", "Bảng tính"}, True)

    def test_sap_xep_chay_thu_thuc_hien_hoan_tac(self):
        truoc = sorted(os.listdir(self.goc))
        ke_hoach = t.sap_xep(self.kho, self.goc, thuc_hien=False, in_ra=self.im)
        self.assertEqual(sorted(os.listdir(self.goc)), truoc)   # chạy thử không đụng gì
        os.makedirs(os.path.join(self.goc, "Ảnh"))
        with open(os.path.join(self.goc, "Ảnh", "anh.jpg"), "w") as f:
            f.write("đã có sẵn")   # trùng tên -> không được ghi đè
        da = t.sap_xep(self.kho, self.goc, thuc_hien=True, in_ra=self.im)
        self.assertEqual(len(da), len(ke_hoach))
        self.assertTrue(os.path.exists(os.path.join(self.goc, "Tài liệu", "bao_cao_quy3.docx")))
        self.assertTrue(os.path.exists(os.path.join(self.goc, "Ảnh", "anh (1).jpg")))
        with open(os.path.join(self.goc, "Ảnh", "anh.jpg")) as f:
            self.assertEqual(f.read(), "đã có sẵn")
        self.assertEqual(t.hoan_tac(self.kho, in_ra=self.im), len(da))
        self.assertEqual(sorted(os.listdir(self.goc)), sorted(truoc + ["Ảnh"]))
        self.assertEqual(t.hoan_tac(self.kho, in_ra=self.im), 0)


class TestGiaoDien(CoSo):
    def test_may_chu_chi_nhan_dia_chi_cuc_bo(self):
        t.quet(self.kho, [self.goc], in_ra=self.im)
        self.kho.conn.commit()
        with open(os.path.join(self.du_lieu, "cau_hinh.json"), "w", encoding="utf-8") as f:
            json.dump({"dung_ngu_nghia": False}, f)
        srv = t.tao_may_chu(self.du_lieu, 0)
        cong = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        mo = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with mo.open(f"http://127.0.0.1:{cong}/api/tim?q=hop%20dong", timeout=10) as r:
                kq = json.load(r)["ket_qua"]
            self.assertEqual(kq[0]["name"], "thue_nha.txt")
            with mo.open(f"http://127.0.0.1:{cong}/api/thong_ke", timeout=10) as r:
                self.assertEqual(json.load(r)["so_file"], 8)
            req = urllib.request.Request(f"http://127.0.0.1:{cong}/api/tim?q=x", headers={"Host": "evil.com"})
            with self.assertRaises(urllib.error.HTTPError) as e:
                mo.open(req, timeout=10)
            self.assertEqual(e.exception.code, 403)
            req = urllib.request.Request(f"http://127.0.0.1:{cong}/api/hoi", data=b'{"cau":"x"}',
                                         headers={"Content-Type": "application/json",
                                                  "Origin": "http://evil.com"})
            with self.assertRaises(urllib.error.HTTPError) as e:
                mo.open(req, timeout=10)
            self.assertEqual(e.exception.code, 403)
        finally:
            srv.shutdown()
            srv.server_close()


if __name__ == "__main__":
    unittest.main()
