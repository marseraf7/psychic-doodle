#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lọc cấu hình VPN CÒN CHẠY từ các link đăng ký (subscription) của
github.com/igareck/vpn-configs-for-russia (hoặc link/file bất kỳ).

Hai mức kiểm tra:
  - THẬT (khuyên dùng): có xray(.exe) cạnh file này hoặc trong PATH -> mở kết nối
    VPN thật qua từng cấu hình và tải http://www.gstatic.com/generate_204.
    Chạy với --tai-xray để tự tải Xray-core lần đầu.
  - NHANH (khi không có xray): chỉ đo kết nối TCP (+ bắt tay TLS nếu cấu hình
    dùng TLS/Reality). Máy chủ "mở cổng" chưa chắc đã cho đi web -> kém chính xác.
Hysteria2/TUIC chạy trên UDP nên không kiểm tra được -> bỏ, trừ khi --giu-udp.

Kết quả (thư mục ket_qua_vpn):
  vpn_con_chay.txt         mỗi dòng 1 cấu hình, nhanh nhất ở trên -> dán vào app
  vpn_con_chay_base64.txt  cùng nội dung dạng base64 (một số app cần dạng này)
  bao_cao.txt              độ trễ / lý do lỗi của từng cấu hình

Cách chạy:
    python loc_vpn.py                      # nguồn mặc định (BLACK VLESS + SS/Trojan/VMess)
    python loc_vpn.py --tai-xray           # tải Xray-core lần đầu rồi kiểm tra thật
    python loc_vpn.py --nguon URL_HOAC_FILE [--nguon ...] [--top 20] [--giu-udp]
"""
import argparse, base64, concurrent.futures as cf, io, json, os, platform, re, shutil
import socket, ssl, statistics, subprocess, sys, tempfile, time, urllib.parse
import urllib.request, zipfile

THU_MUC = os.path.dirname(os.path.abspath(__file__))
REPO = "igareck/vpn-configs-for-russia"
# Danh sách ĐEN = máy chủ nước ngoài, dùng được ở mọi nơi.
# (Danh sách TRẮNG - WHITE-* - là máy chủ đặt ở Nga, chỉ có ích khi ở Nga.)
NGUON_MAC_DINH = ["BLACK_VLESS_RUS.txt", "BLACK_SS+All_RUS.txt"]
GUONG = [  # thử lần lượt nếu một nguồn bị chặn
    "https://raw.githubusercontent.com/{repo}/main/{f}",
    "https://cdn.jsdelivr.net/gh/{repo}@main/{f}",
    "https://raw.githack.com/{repo}/main/{f}",
]
URL_KIEM_TRA = ("www.gstatic.com", 80, "/generate_204")
UA = "Mozilla/5.0 loc_vpn"
GIAO_THUC = ("vless", "vmess", "trojan", "ss", "hysteria2", "hy2", "tuic")


# ---------- Tải và tách link đăng ký ----------
def tai(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")

def doc_nguon(nguon):
    """nguon: đường dẫn file, URL, hoặc tên file trong repo igareck."""
    if os.path.isfile(nguon):
        with open(nguon, encoding="utf-8", errors="replace") as f:
            return f.read()
    if re.match(r"https?://", nguon):
        return tai(nguon)
    loi = None
    for mau in GUONG:
        url = mau.format(repo=REPO, f=urllib.parse.quote(nguon))
        try:
            return tai(url)
        except Exception as e:
            loi = e
    raise RuntimeError(f"không tải được {nguon}: {loi}")

def b64(s):
    s = s.strip().replace("-", "+").replace("_", "/")
    return base64.b64decode(s + "=" * (-len(s) % 4))

def tach_dong(text):
    if "://" not in text:  # cả link đăng ký là base64
        try:
            text = b64("".join(text.split())).decode("utf-8", "replace")
        except Exception:
            return []
    return [d.strip() for d in text.splitlines()
            if d.strip().split("://")[0].lower() in GIAO_THUC]


# ---------- Phân tích từng cấu hình ----------
def _q(qs, k, mac_dinh=""):
    return qs.get(k, [mac_dinh])[0]

def phan_tich(uri):
    """Trả dict: proto, host, port, udp, tls, sni, ten, + tham số cho xray."""
    proto = uri.split("://")[0].lower()
    if proto == "vmess":
        j = json.loads(b64(uri[8:].split("#")[0]))
        tls = str(j.get("tls", "")).lower()
        return dict(proto="vmess", host=j["add"], port=int(j["port"]), udp=False,
                    tls=tls in ("tls", "reality"), sni=j.get("sni") or j.get("host") or "",
                    ten=j.get("ps", ""), id=j["id"], aid=int(j.get("aid") or 0),
                    scy=j.get("scy") or "auto", net=j.get("net") or "tcp",
                    security=tls if tls in ("tls", "reality") else "none",
                    path=j.get("path", ""), hosthdr=j.get("host", ""),
                    type=j.get("type", ""), fp=j.get("fp", ""), alpn=j.get("alpn", ""),
                    pbk="", sid="", flow="", mode="", spx="")
    u = urllib.parse.urlsplit(uri)
    ten = urllib.parse.unquote(u.fragment)
    qs = urllib.parse.parse_qs(u.query)
    if proto == "ss":
        if "@" in u.netloc:  # SIP002: ss://base64(method:pass)@host:port
            cred, hp = u.netloc.rsplit("@", 1)
            cred = urllib.parse.unquote(cred)
            if ":" not in cred:
                cred = b64(cred).decode()
        else:  # dạng cũ: ss://base64(method:pass@host:port)
            cred, hp = b64(u.netloc).decode().rsplit("@", 1)
        method, pw = cred.split(":", 1)
        host, port = hp.rsplit(":", 1)
        return dict(proto="ss", host=host.strip("[]"), port=int(port.split("/")[0]),
                    udp=False, tls=False, sni="", ten=ten, method=method, pw=pw)
    host, port = u.hostname, u.port or 443
    if proto in ("hysteria2", "hy2", "tuic"):
        return dict(proto=proto, host=host, port=port, udp=True, tls=True,
                    sni=_q(qs, "sni"), ten=ten)
    sec = _q(qs, "security", "tls" if proto == "trojan" else "none").lower()
    if sec not in ("tls", "reality"):  # "", "none", "false"...
        sec = "none"
    return dict(proto=proto, host=host, port=port, udp=False,
                tls=sec in ("tls", "reality"), sni=_q(qs, "sni") or _q(qs, "host"),
                ten=ten, id=urllib.parse.unquote(u.username or ""),
                net=_q(qs, "type", "tcp"), security=sec, flow=_q(qs, "flow"),
                path=_q(qs, "path") or _q(qs, "serviceName"), hosthdr=_q(qs, "host"),
                type=_q(qs, "headerType"), fp=_q(qs, "fp"), alpn=_q(qs, "alpn"),
                pbk=_q(qs, "pbk"), sid=_q(qs, "sid"), spx=_q(qs, "spx"),
                mode=_q(qs, "mode"), enc=_q(qs, "encryption", "none"))


# ---------- Kiểm tra NHANH: TCP (+ TLS) ----------
def thu_tcp(c, timeout):
    t0 = time.perf_counter()
    s = socket.create_connection((c["host"], c["port"]), timeout)
    try:
        if c["tls"]:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            s = ctx.wrap_socket(s, server_hostname=c["sni"] or c["host"])
    finally:
        s.close()
    return (time.perf_counter() - t0) * 1000

def kiem_tra_nhanh(c, timeout, lan=3):
    tre = []
    loi = ""
    for _ in range(lan):
        try:
            tre.append(thu_tcp(c, timeout))
        except Exception as e:
            loi = type(e).__name__
    if not tre:
        return None, loi or "lỗi"
    return statistics.median(tre), ""


# ---------- Kiểm tra THẬT qua xray ----------
def tim_xray():
    ten = "xray.exe" if os.name == "nt" else "xray"
    for p in (os.path.join(THU_MUC, "xray", ten), os.path.join(THU_MUC, ten)):
        if os.path.isfile(p):
            return p
    return shutil.which("xray")

def tai_xray():
    he, may = platform.system(), platform.machine().lower()
    arm = may in ("arm64", "aarch64")
    goi = {"Windows": "windows-arm64-v8a" if arm else "windows-64",
           "Linux": "linux-arm64-v8a" if arm else "linux-64",
           "Darwin": "macos-arm64-v8a" if arm else "macos-64"}.get(he)
    if not goi:
        raise RuntimeError(f"không có bản xray cho {he}")
    url = f"https://github.com/XTLS/Xray-core/releases/latest/download/Xray-{goi}.zip"
    print(f"Đang tải Xray-core: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        du_lieu = r.read()
    dich = os.path.join(THU_MUC, "xray")
    zipfile.ZipFile(io.BytesIO(du_lieu)).extractall(dich)
    p = os.path.join(dich, "xray.exe" if os.name == "nt" else "xray")
    os.chmod(p, 0o755)
    return p

def _stream(c):
    net = {"splithttp": "xhttp", "h2": "http"}.get(c["net"], c["net"]) or "tcp"
    st = {"network": net, "security": c["security"]}
    sni = c["sni"] or c["hosthdr"] or c["host"]
    if c["security"] == "tls":
        st["tlsSettings"] = {"serverName": sni}
        if c["fp"]:
            st["tlsSettings"]["fingerprint"] = c["fp"]
        if c["alpn"]:
            st["tlsSettings"]["alpn"] = c["alpn"].split(",")
    elif c["security"] == "reality":
        st["realitySettings"] = {"serverName": sni, "fingerprint": c["fp"] or "chrome",
                                 "publicKey": c["pbk"], "shortId": c["sid"],
                                 "spiderX": c["spx"]}
    if net == "ws":
        st["wsSettings"] = {"path": c["path"] or "/", "headers": {"Host": c["hosthdr"]}}
    elif net == "grpc":
        st["grpcSettings"] = {"serviceName": c["path"], "multiMode": c["mode"] == "multi"}
    elif net == "httpupgrade":
        st["httpupgradeSettings"] = {"path": c["path"] or "/", "host": c["hosthdr"]}
    elif net == "xhttp":
        st["xhttpSettings"] = {"path": c["path"] or "/", "host": c["hosthdr"],
                               "mode": c["mode"] or "auto"}
    elif net == "tcp" and c["type"] == "http":
        st["tcpSettings"] = {"header": {"type": "http", "request": {
            "path": [c["path"] or "/"], "headers": {"Host": [c["hosthdr"] or sni]}}}}
    return st

def outbound(c, tag):
    p = c["proto"]
    if p == "ss":
        return {"tag": tag, "protocol": "shadowsocks", "settings": {"servers": [
            {"address": c["host"], "port": c["port"], "method": c["method"],
             "password": c["pw"]}]}}
    if p == "trojan":
        o = {"protocol": "trojan", "settings": {"servers": [
            {"address": c["host"], "port": c["port"], "password": c["id"]}]}}
    elif p == "vless":
        user = {"id": c["id"], "encryption": c["enc"] or "none"}
        if c["flow"]:
            user["flow"] = c["flow"]
        o = {"protocol": "vless", "settings": {"vnext": [
            {"address": c["host"], "port": c["port"], "users": [user]}]}}
    elif p == "vmess":
        o = {"protocol": "vmess", "settings": {"vnext": [
            {"address": c["host"], "port": c["port"],
             "users": [{"id": c["id"], "alterId": c["aid"], "security": c["scy"]}]}]}}
    else:
        raise ValueError(p)
    o["tag"] = tag
    o["streamSettings"] = _stream(c)
    return o

def cong_trong():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def qua_socks(cong, timeout):
    """Mở kết nối qua SOCKS5 127.0.0.1:cong, tải URL_KIEM_TRA, trả ms hoặc raise."""
    host, port, path = URL_KIEM_TRA
    t0 = time.perf_counter()
    with socket.create_connection(("127.0.0.1", cong), timeout) as s:
        s.settimeout(timeout)
        s.sendall(b"\x05\x01\x00")
        if s.recv(2) != b"\x05\x00":
            raise OSError("socks")
        h = host.encode()
        s.sendall(b"\x05\x01\x00\x03" + bytes([len(h)]) + h + port.to_bytes(2, "big"))
        tl = s.recv(10)
        if len(tl) < 2 or tl[1] != 0:
            raise OSError("socks connect")
        s.sendall(f"GET {path} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: {UA}\r\n"
                  "Connection: close\r\n\r\n".encode())
        dau = s.recv(64)
    if not dau.startswith(b"HTTP/1.") or b" 204" not in dau[:16]:
        raise OSError("phản hồi lạ")
    return (time.perf_counter() - t0) * 1000

def kiem_tra_that(ds, xray, timeout, luong):
    """Chạy MỘT tiến trình xray: mỗi cấu hình 1 cổng SOCKS riêng -> kiểm tra song song."""
    ket_qua = {}
    cau_hinh = {"log": {"loglevel": "none"}, "inbounds": [], "outbounds": [],
                "routing": {"rules": []}}
    cong = {}
    for i, c in ds:
        try:
            ob = outbound(c, f"o{i}")
        except Exception as e:
            ket_qua[i] = (None, f"không đọc được ({type(e).__name__})")
            continue
        cong[i] = cong_trong()
        cau_hinh["inbounds"].append({"tag": f"i{i}", "listen": "127.0.0.1",
                                     "port": cong[i], "protocol": "socks",
                                     "settings": {"udp": False}})
        cau_hinh["outbounds"].append(ob)
        cau_hinh["routing"]["rules"].append({"type": "field", "inboundTag": [f"i{i}"],
                                             "outboundTag": f"o{i}"})
    if not cong:
        return ket_qua
    fd, duong_dan = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(cau_hinh, f)
    loi = subprocess.run([xray, "run", "-test", "-c", duong_dan],
                         capture_output=True, text=True, errors="replace")
    if loi.returncode != 0:  # 1 cấu hình hỏng làm hỏng cả file -> kiểm tra từng cái
        os.remove(duong_dan)
        if len(cong) == 1:
            i = next(iter(cong))
            return {**ket_qua, i: (None, "xray không nhận cấu hình")}
        for i, c in ds:
            if i in cong:
                ket_qua.update(kiem_tra_that([(i, c)], xray, timeout, luong))
        return ket_qua
    tien_trinh = subprocess.Popen([xray, "run", "-c", duong_dan],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.5)
        def mot(i):
            tre, ly_do = [], ""
            for _ in range(2):
                try:
                    tre.append(qua_socks(cong[i], timeout))
                except Exception as e:
                    ly_do = str(e) or type(e).__name__
            return i, (min(tre), "") if tre else (None, ly_do or "lỗi")
        with cf.ThreadPoolExecutor(luong) as ex:
            for i, kq in ex.map(mot, cong):
                ket_qua[i] = kq
    finally:
        tien_trinh.terminate()
        try:
            tien_trinh.wait(5)
        except subprocess.TimeoutExpired:
            tien_trinh.kill()
        os.remove(duong_dan)
    return ket_qua


# ---------- Chương trình chính ----------
def main():
    ap = argparse.ArgumentParser(description="Lọc cấu hình VPN còn chạy")
    ap.add_argument("--nguon", action="append",
                    help="URL / file / tên file trong repo igareck (lặp lại được)")
    ap.add_argument("--top", type=int, default=0, help="chỉ giữ N cấu hình nhanh nhất")
    ap.add_argument("--timeout", type=float, default=6.0)
    ap.add_argument("--luong", type=int, default=32, help="số kiểm tra song song")
    ap.add_argument("--giu-udp", action="store_true",
                    help="giữ Hysteria2/TUIC (không kiểm tra được) ở cuối danh sách")
    ap.add_argument("--nhanh", action="store_true", help="bỏ qua xray, chỉ đo TCP/TLS")
    ap.add_argument("--tai-xray", action="store_true", help="tải Xray-core nếu chưa có")
    ap.add_argument("--out-dir", default=os.path.join(THU_MUC, "ket_qua_vpn"))
    a = ap.parse_args()

    uris = []
    for n in a.nguon or NGUON_MAC_DINH:
        try:
            dong = tach_dong(doc_nguon(n))
            print(f"  {n}: {len(dong)} cấu hình")
            uris += dong
        except Exception as e:
            print(f"  [LỖI] {e}")
    uris = list(dict.fromkeys(uris))
    ds, bo = [], []
    for u in uris:
        try:
            ds.append((u, phan_tich(u)))
        except Exception as e:
            bo.append((u, f"không đọc được ({type(e).__name__})"))
    if not ds:
        print("Không có cấu hình nào để kiểm tra.")
        return 1

    tcp = [(i, c) for i, (u, c) in enumerate(ds) if not c["udp"]]
    udp = [(i, c) for i, (u, c) in enumerate(ds) if c["udp"]]

    xray = None if a.nhanh else tim_xray()
    if not xray and a.tai_xray and not a.nhanh:
        try:
            xray = tai_xray()
        except Exception as e:
            print(f"  [LỖI] tải xray: {e}")
    if xray:
        print(f"\nKiểm tra THẬT {len(tcp)} cấu hình qua {xray} ...")
        ket_qua = kiem_tra_that(tcp, xray, a.timeout, a.luong)
    else:
        print(f"\nKiểm tra NHANH (TCP/TLS) {len(tcp)} cấu hình "
              "(chạy với --tai-xray để kiểm tra thật) ...")
        with cf.ThreadPoolExecutor(a.luong) as ex:
            ket_qua = dict(zip([i for i, _ in tcp],
                               ex.map(lambda ic: kiem_tra_nhanh(ic[1], a.timeout), tcp)))

    chay = sorted(((ket_qua[i][0], i) for i, _ in tcp if ket_qua.get(i, (None,))[0]),
                  key=lambda x: x[0])
    if a.top:
        chay = chay[:a.top]
    giu = [ds[i][0] for _, i in chay]
    if a.giu_udp:
        giu += [ds[i][0] for i, _ in udp]

    os.makedirs(a.out_dir, exist_ok=True)
    with open(os.path.join(a.out_dir, "vpn_con_chay.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(giu) + "\n")
    with open(os.path.join(a.out_dir, "vpn_con_chay_base64.txt"), "w",
              encoding="utf-8") as f:
        f.write(base64.b64encode("\n".join(giu).encode()).decode())
    with open(os.path.join(a.out_dir, "bao_cao.txt"), "w", encoding="utf-8") as f:
        f.write(f"Kiểm tra lúc {time.strftime('%Y-%m-%d %H:%M')} - "
                f"{'THẬT qua xray' if xray else 'NHANH TCP/TLS'}\n\n")
        for i, (u, c) in enumerate(ds):
            if c["udp"]:
                tt = "UDP - không kiểm tra" + (" (giữ)" if a.giu_udp else " (bỏ)")
            else:
                tre, ly_do = ket_qua.get(i, (None, "?"))
                tt = f"CHẠY {tre:6.0f} ms" if tre else f"hỏng: {ly_do}"
            f.write(f"{tt:<32} {c['proto']:<9} {c['host']}:{c['port']}  {c['ten']}\n")
        for u, ly_do in bo:
            f.write(f"{ly_do:<32} {u[:80]}\n")

    print(f"\nCòn chạy: {len(chay)}/{len(tcp)}"
          + (f"  (+{len(udp)} UDP giữ nguyên)" if a.giu_udp and udp else "")
          + (f"  (bỏ {len(udp)} UDP không kiểm tra được)" if udp and not a.giu_udp else ""))
    for tre, i in chay[:10]:
        print(f"  {tre:6.0f} ms  {ds[i][1]['proto']:<7} {ds[i][1]['ten']}")
    print(f"\nKết quả: {a.out_dir}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
