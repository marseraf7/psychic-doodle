# -*- coding: utf-8 -*-
import os, sys
import pytest

GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, GOC)
import kiem_tra_luan_van as k

VI_DU = os.path.join(GOC, "vi_du")


def test_tach_cau_khong_cat_sau_viet_tat_va_chu_cai_dau_ten():
    doan = "Л. С. Выготский подчёркивал роль среды, т. е. отношений [3, с. 12]. Второе предложение."
    assert k.tach_cau(doan) == ["Л. С. Выготский подчёркивал роль среды, т. е. отношений [3, с. 12].",
                                "Второе предложение."]


def test_goc_tu_gop_cac_cach():
    assert k.goc_tu("психологии") == k.goc_tu("психология") == k.goc_tu("психологию")


def test_trung_lap_phan_loai_dung():
    kq = k.kiem_tra_trung_lap(os.path.join(VI_DU, "ban_thao.txt"), os.path.join(VI_DU, "nguon"))
    loai = {c["cau"][:25]: c["loai"] for ds in kq["doan"] for c in ds}
    assert loai["Тревожность понимается ка"] == k.THIEU_NGUON
    assert loai["Высокий уровень личностно"] == k.CAN_DIEN_DAT
    assert loai["Как отмечает автор, «учеб"] == k.TRICH_DUNG
    assert loai["Актуальность исследования"] == k.OK
    assert loai["Мы предполагаем, что студ"] == k.OK
    # danh mục tài liệu không bị đem đi so trùng
    assert not any("Список" in c["cau"] for ds in kq["doan"] for c in ds)
    assert any("рaссмотрены" in s for _, s in kq["ky_tu_la"])


def test_trung_lap_nhan_ra_cau_chi_doi_bien_cach(tmp_path):
    (tmp_path / "nguon").mkdir()
    (tmp_path / "nguon" / "a.txt").write_text(
        "Личностная тревожность снижает продуктивность учебной деятельности студентов первого курса.",
        encoding="utf-8")
    (tmp_path / "b.txt").write_text(
        "Личностной тревожностью снижается продуктивность учебных деятельностей студента первых курсов.",
        encoding="utf-8")
    kq = k.kiem_tra_trung_lap(str(tmp_path / "b.txt"), str(tmp_path / "nguon"))
    assert kq["doan"][0][0]["loai"] == k.THIEU_NGUON


def test_bao_cao_html(tmp_path):
    kq = k.kiem_tra_trung_lap(os.path.join(VI_DU, "ban_thao.txt"), os.path.join(VI_DU, "nguon"))
    out = tmp_path / "bc.html"
    k.ghi_bao_cao_html(kq, str(out))
    s = out.read_text(encoding="utf-8")
    assert '<mark class="thieu_nguon"' in s and "istochnik_trevozhnost.txt" in s


def test_kiem_tra_trich_dan():
    kq = k.kiem_tra_trich_dan(os.path.join(VI_DU, "ban_thao.txt"))
    nd = "\n".join(x for _, x in kq["van_de"])
    assert kq["so_muc"] == 4
    assert "[5]" in nd                      # dẫn số không có trong danh mục
    assert "Mục 4 trong danh mục chưa được dẫn" in nd
    assert "gạch nối" in nd                 # mục 1 dùng '-'
    assert "Mục 2 trong danh mục chưa" not in nd


def test_trich_nguyen_van_thieu_nguon_va_so_trang(tmp_path):
    f = tmp_path / "b.txt"
    f.write_text("Автор пишет: «мотивация является ведущим фактором успешности обучения в вузе».\n"
                 "Он добавляет: «внутренняя мотивация важнее внешней для долгосрочных результатов» [1].\n"
                 "Список литературы\nИванов, И. И. Книга. – Москва, 2020. – 100 с.\n", encoding="utf-8")
    nd = [(m, x) for m, x in k.kiem_tra_trich_dan(str(f))["van_de"]]
    assert any(m == "LỖI" and "không có tham chiếu" in x for m, x in nd)
    assert any(m == "NHẮC" and "số trang" in x for m, x in nd)


def test_so_trong_ngoac():
    assert k._so_trong_ngoac("5, с. 12; 7–9") == ({5, 7, 8, 9}, True)
    assert k._so_trong_ngoac("1, 3") == ({1, 3}, False)


@pytest.mark.parametrize("dong, mong_doi", [
    ({"loai": "sach", "tac_gia": "Выготский Лев Семенович", "ten": "Мышление и речь",
      "thanh_pho": "Москва", "nha_xb": "Лабиринт", "nam": "1999", "so_trang": "352"},
     "Выготский, Л. С. Мышление и речь / Л. С. Выготский. – Москва : Лабиринт, 1999. – 352 с."),
    ({"loai": "bai_bao", "tac_gia": "Петрова А.А.", "ten": "Мотивация", "tap_chi": "Вопросы психологии",
      "nam": "2020", "so": "3", "trang": "10-20"},
     "Петрова, А. А. Мотивация / А. А. Петрова // Вопросы психологии. – 2020. – № 3. – С. 10–20."),
    ({"loai": "luan_an", "tac_gia": "Кузнецова Елена Николаевна", "ten": "Тревожность",
      "chuyen_nganh": "5.3.1", "noi_bao_ve": "МГУ", "thanh_pho": "Москва", "nam": "2016", "so_trang": "210"},
     "Кузнецова, Е. Н. Тревожность : специальность 5.3.1 : диссертация на соискание ученой степени "
     "кандидата психологических наук / Кузнецова Елена Николаевна ; МГУ. – Москва, 2016. – 210 с."),
])
def test_dinh_dang_gost(dong, mong_doi):
    assert k.dinh_dang_muc(dong) == mong_doi


def test_dinh_dang_csv_dau_cham_phay(tmp_path):
    f = tmp_path / "t.csv"
    f.write_text("loai;tac_gia;ten;thanh_pho;nam;so_trang\n"
                 "sach;Smith J.;Anxiety;London;2001;90\n"
                 "sach;Орлов О. О.;Стресс;Москва;2010;120\n", encoding="utf-8")
    out = tmp_path / "dm.txt"
    k.main(["dinh-dang", "--csv", str(f), "--out", str(out)])
    dong = out.read_text(encoding="utf-8").splitlines()
    assert dong[2].startswith("1. Орлов")          # tiếng Nga xếp trước
    assert dong[3].endswith("– 90 p.")


def test_docx_chu_trang_va_ky_tu_an(tmp_path):
    docx = pytest.importorskip("docx")
    from docx.shared import RGBColor
    d = docx.Document()
    p = d.add_paragraph("Обычный текст​ исследования. ")
    p.add_run("скрытый текст").font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    path = str(tmp_path / "b.docx")
    d.save(path)
    loi = k.do_chu_an_docx(path) + k.do_ky_tu_la(k.doc_doan_van(path))
    ly_do = " ".join(l for l, _ in loi)
    assert "chữ màu trắng" in ly_do and "zero-width space" in ly_do
