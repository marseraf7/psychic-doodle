# -*- coding: utf-8 -*-
"""Chế độ CẤM MẠNG cho công cụ phân tích cuộc họp.

Hai lớp bảo vệ:
  1. Biến môi trường tắt tải model / telemetry của các thư viện
     (HuggingFace, pyannote gửi thống kê về otel.pyannote.ai, funasr kiểm tra phiên bản trên pypi...).
     PHẢI gọi truoc_khi_import() TRƯỚC khi import torch / pyannote / funasr / faster_whisper.
  2. Chặn ở tầng socket của Python: mọi kết nối không phải tới máy này (127.0.0.1 / ::1)
     đều bị từ chối và báo lỗi -> Ollama chạy trên máy vẫn dùng được.
  3. Bỏ mọi cấu hình PROXY (biến môi trường và cả proxy trong registry Windows mà Python
     tự đọc): proxy chạy trên 127.0.0.1 (VPN, phần mềm công ty...) sẽ chuyển tiếp dữ liệu
     ra Internet dù kết nối "nội bộ" -> phải cấm.

Giới hạn (nói rõ để không tạo cảm giác an toàn giả): lớp 2 chỉ chặn được mã Python.
Thư viện C/C++ tự mở kết nối riêng thì không chặn được (các thư viện đang dùng không làm vậy
khi chạy offline). Bảo mật tuyệt đối = rút cáp mạng / tắt Wi-Fi hoặc dùng tường lửa.
"""
import ipaddress
import os
import socket

BIEN_MOI_TRUONG = {
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
    "HF_DATASETS_OFFLINE": "1",
    "HF_HUB_DISABLE_TELEMETRY": "1",
    "PYANNOTE_METRICS_ENABLED": "false",   # pyannote 4 mặc định BẬT gửi thống kê
    "DO_NOT_TRACK": "1",
    "MODELSCOPE_OFFLINE": "1",
}


class LoiChanMang(ConnectionRefusedError):
    pass


def truoc_khi_import():
    """Đặt biến môi trường cấm tải / telemetry. Ghi đè cả giá trị người dùng đặt sẵn."""
    os.environ.update(BIEN_MOI_TRUONG)


BIEN_PROXY = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "FTP_PROXY", "NO_PROXY",
              "http_proxy", "https_proxy", "all_proxy", "ftp_proxy", "no_proxy")
_proxy_cu = {}


def _bo_proxy():
    """Xóa proxy; NO_PROXY=* để urllib/requests/httpx bỏ qua cả proxy trong registry Windows
    (urllib chỉ đọc registry khi KHÔNG có biến proxy nào trong môi trường)."""
    for k in BIEN_PROXY:
        if k in os.environ:
            _proxy_cu[k] = os.environ.pop(k)
    os.environ["NO_PROXY"] = os.environ["no_proxy"] = "*"


def _tra_proxy():
    os.environ.pop("NO_PROXY", None)
    os.environ.pop("no_proxy", None)
    os.environ.update(_proxy_cu)
    _proxy_cu.clear()


def _la_noi_bo(host):
    if host is None:
        return True
    if isinstance(host, bytes):
        host = host.decode("ascii", "replace")
    host = str(host).strip("[]").split("%")[0]
    if host.lower() in ("localhost", "localhost.localdomain", ""):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False   # tên miền bất kỳ khác -> không phải nội bộ


_goc = {}
_dang_bat = False
nhat_ky = []   # các kết nối đã bị chặn (để kiểm thử / báo cáo)


def _dia_chi_host(address):
    if isinstance(address, (tuple, list)) and address:
        return address[0]
    return None   # AF_UNIX (đường dẫn file) -> nội bộ


def _kiem_tra(address):
    host = _dia_chi_host(address)
    if not _la_noi_bo(host):
        nhat_ky.append(str(host))
        raise LoiChanMang(f"CHẾ ĐỘ CẤM MẠNG: đã chặn kết nối tới '{host}'. "
                          f"Công cụ không gửi dữ liệu ra khỏi máy.")


def bat():
    """Bật chặn mạng (gọi nhiều lần không sao)."""
    global _dang_bat
    if _dang_bat:
        return
    _goc["connect"] = socket.socket.connect
    _goc["connect_ex"] = socket.socket.connect_ex
    _goc["getaddrinfo"] = socket.getaddrinfo

    def connect(self, address):
        if self.family != getattr(socket, "AF_UNIX", object()):
            _kiem_tra(address)
        return _goc["connect"](self, address)

    def connect_ex(self, address):
        if self.family != getattr(socket, "AF_UNIX", object()):
            _kiem_tra(address)
        return _goc["connect_ex"](self, address)

    def getaddrinfo(host, *a, **kw):
        # Chặn luôn việc tra DNS tên miền ngoài -> tên máy chủ cũng không lọt ra ngoài
        if not _la_noi_bo(host):
            nhat_ky.append(str(host))
            raise LoiChanMang(f"CHẾ ĐỘ CẤM MẠNG: đã chặn tra cứu tên miền '{host}'.")
        return _goc["getaddrinfo"](host, *a, **kw)

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    socket.getaddrinfo = getaddrinfo
    _bo_proxy()
    _dang_bat = True


def tat():
    global _dang_bat
    if not _dang_bat:
        return
    socket.socket.connect = _goc["connect"]
    socket.socket.connect_ex = _goc["connect_ex"]
    socket.getaddrinfo = _goc["getaddrinfo"]
    _tra_proxy()   # gửi Claude qua mạng công ty có thể cần proxy
    _dang_bat = False


def dang_bat():
    return _dang_bat


class tam_mo:
    """Tạm mở mạng trong khối with (chỉ dùng khi người dùng CHỦ ĐỘNG bật gửi lên Claude)."""

    def __enter__(self):
        self._truoc = _dang_bat
        tat()
        return self

    def __exit__(self, *exc):
        if self._truoc:
            bat()
        return False
