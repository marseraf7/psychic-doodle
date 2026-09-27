# -*- coding: utf-8 -*-
"""Chẩn đoán VGA/GPU: VRAM, driver, DirectX Feature Level, PCIe link, tải GPU, đời GPU,
TDR / WHEA PCIe / LiveKernelEvent."""
import datetime as _dt
import re
from collections import Counter

from ..model import (OK, INFO, WARN, CRIT, new_section, kv, finding, table, note, as_list, to_int, human_bytes,
                     parse_date, fmt_date)
from ..analysis import events as ev
from ..analysis import bugcheck as bc

GPU_LKE_CODES = {0x141, 0x117, 0x193}  # VIDEO_ENGINE_TIMEOUT, VIDEO_TDR_TIMEOUT, VIDEO_DXGKRNL_LIVEDUMP
PCIE_GEN = {1: "Gen1", 2: "Gen2", 3: "Gen3", 4: "Gen4", 5: "Gen5"}

# (regex tên, hãng, kiến trúc/đời, năm, ghi chú hỗ trợ driver)
GPU_GENERATIONS = [
    (r"RTX\s*50\d\d", "NVIDIA", "Blackwell (RTX 50)", 2025, ""),
    (r"RTX\s*40\d\d", "NVIDIA", "Ada Lovelace (RTX 40)", 2022, ""),
    (r"RTX\s*30\d\d|RTX\s*A\d{4}", "NVIDIA", "Ampere (RTX 30)", 2020, ""),
    (r"RTX\s*20\d\d|GTX\s*16\d\d|TITAN RTX|MX\s*[45]\d0", "NVIDIA", "Turing (RTX 20 / GTX 16)", 2018, ""),
    (r"GTX\s*10\d\d|GT\s*1030|TITAN X[p ]|MX\s*[123]\d0", "NVIDIA", "Pascal (GTX 10)", 2016,
     "Đời cũ: NVIDIA đã dừng phát triển driver mới cho Maxwell/Pascal (chỉ còn bản vá bảo mật)."),
    (r"GTX\s*9\d\d|GTX\s*750|GTX\s*745|9[234]0M|8[34]0M", "NVIDIA", "Maxwell (GTX 900/750)", 2014,
     "Đời cũ: NVIDIA đã dừng phát triển driver mới cho Maxwell/Pascal (chỉ còn bản vá bảo mật)."),
    (r"GT\s*7[123]0|GTX\s*7[6-9]0|GTX\s*6\d\d|GT\s*6\d\d", "NVIDIA", "Kepler (GTX 600/700, GT 710/730)", 2012,
     "Rất cũ: không còn driver cho Windows 11 mới, dễ lỗi với game/ứng dụng hiện đại."),
    (r"RX\s*90\d\d", "AMD", "RDNA 4 (RX 9000)", 2025, ""),
    (r"RX\s*7\d{3}", "AMD", "RDNA 3 (RX 7000)", 2022, ""),
    (r"RX\s*6\d{3}", "AMD", "RDNA 2 (RX 6000)", 2020, ""),
    (r"RX\s*5[5-7]00", "AMD", "RDNA 1 (RX 5000)", 2019, ""),
    (r"RX\s*(4[6-9]0|5[4-9]0)\b|RX\s*590", "AMD", "Polaris (RX 400/500)", 2016,
     "Đời cũ: AMD đã chuyển Polaris/Vega sang chế độ bảo trì (ít cập nhật)."),
    (r"Vega|Radeon VII", "AMD", "Vega (GCN 5)", 2017, "Đời cũ: AMD đã chuyển Polaris/Vega sang chế độ bảo trì (ít cập nhật)."),
    (r"R[579]\s*\d{3}|HD\s*[5-8]\d{3}", "AMD", "GCN / TeraScale (rất cũ)", 2012, "Rất cũ: không còn driver chính thức mới."),
    (r"Radeon(\(TM\))?\s*(\d{3}M|Graphics)", "AMD", "Card tích hợp AMD (APU)", None, ""),
    (r"Arc\s*B\d{3}", "Intel", "Battlemage (Arc B)", 2024, ""),
    (r"Arc\s*A\d{3}|Arc\(TM\)\s*A", "Intel", "Alchemist (Arc A)", 2022, ""),
    (r"Arc\(TM\)\s*(Graphics|140|130)|Intel\(R\) Arc", "Intel", "Xe-LPG / Arc tích hợp", 2023, ""),
    (r"Iris\(R\)\s*Xe|UHD Graphics\s*(7[0-9]{2})?$|UHD Graphics(?!\s*\d)", "Intel", "Xe-LP (Gen12, tích hợp)", 2020, ""),
    (r"UHD Graphics\s*6\d\d|HD Graphics\s*[56]\d\d|Iris\(R\)\s*Plus", "Intel", "Gen9 / Gen11 (tích hợp)", 2015, ""),
    (r"HD Graphics\s*(4\d{3}|[23]000)?$|HD Graphics$", "Intel", "Gen7/8 (tích hợp, rất cũ)", 2012,
     "Rất cũ: driver hạn chế trên Windows 10/11."),
]


def gpu_generation(name):
    s = str(name or "")
    for rx, vendor, arch, year, remark in GPU_GENERATIONS:
        if re.search(rx, s, re.I):
            return vendor, arch, year, remark
    return None, None, None, ""


def _vendor(name, compat):
    s = f"{name} {compat}".lower()
    if "nvidia" in s or "geforce" in s or "quadro" in s:
        return "NVIDIA"
    if "amd" in s or "radeon" in s or "advanced micro" in s:
        return "AMD"
    if "intel" in s:
        return "Intel"
    if "microsoft" in s or "basic display" in s:
        return "Microsoft"
    return ""


def _is_discrete(name, vendor):
    s = str(name).lower()
    if vendor == "NVIDIA":
        return True
    if vendor == "AMD":
        # "Radeon RX Vega 8 Graphics"/"Radeon Graphics" là APU tích hợp
        return bool(re.search(r"\brx\s*\d{3,4}|vega\s*(56|64)|radeon vii|\br[579]\s*\d{3}", s))
    if vendor == "Intel":
        return bool(re.search(r"arc\s*[ab]\d", s))
    return False


def _vram_map(src):
    """VRAM thật lấy từ registry (Win32_VideoController.AdapterRAM bị giới hạn 4 GB)."""
    res = {}
    for r in as_list(src.ps("gpu_registry")):
        if not isinstance(r, dict):
            continue
        v = to_int(r.get("QwMemorySize")) or to_int(r.get("MemorySize"))
        if v and r.get("DriverDesc"):
            res[str(r["DriverDesc"]).strip().lower()] = v
    return res


def run(src):
    sec = new_section("gpu", "VGA / GPU")
    gpus = [g for g in as_list(src.ps("video")) if isinstance(g, dict)]
    vram = _vram_map(src)
    links = [l for l in as_list(src.ps("gpu_link")) if isinstance(l, dict)]
    smi = [x for x in as_list(src.probe("nvidia_smi")) if isinstance(x, dict)]
    dx = src.probe("dxdiag") if getattr(src, "use_dxdiag", True) else None
    dx_adapters = (dx or {}).get("adapters") or []

    if not gpus:
        finding(sec, WARN, "Không đọc được danh sách VGA (Win32_VideoController).", "")
    if dx and dx.get("directx"):
        kv(sec, "DirectX", dx["directx"])

    rows = []
    has_discrete = False
    for g in gpus:
        name = (g.get("Name") or "").strip()
        vendor = _vendor(name, g.get("AdapterCompatibility"))
        disc = _is_discrete(name, vendor)
        has_discrete |= disc
        v = vram.get(name.lower()) or to_int(g.get("AdapterRAM"))
        _, arch, year, remark = gpu_generation(name)
        ddate = parse_date(g.get("DriverDate"))
        dxa = next((a for a in dx_adapters if a.get("name", "").strip().lower() == name.lower()), None) \
            or (dx_adapters[gpus.index(g)] if len(dx_adapters) == len(gpus) else None)
        feat = (dxa or {}).get("feature", "")
        top_feat = feat.split(",")[0].strip() if feat else ""
        link = next((l for l in links if l.get("Name") == name), None) or {}
        cs, cw = to_int(link.get("DEVPKEY_PciDevice_CurrentLinkSpeed")), to_int(link.get("DEVPKEY_PciDevice_CurrentLinkWidth"))
        ms, mw = to_int(link.get("DEVPKEY_PciDevice_MaxLinkSpeed")), to_int(link.get("DEVPKEY_PciDevice_MaxLinkWidth"))
        link_s = f"{PCIE_GEN.get(cs, cs)} x{cw} / tối đa {PCIE_GEN.get(ms, ms)} x{mw}" if (cs or cw) else ""
        rows.append([name, "Rời" if disc else "Tích hợp", human_bytes(v) if v else "", g.get("DriverVersion"),
                     fmt_date(ddate, False), top_feat, (dxa or {}).get("wddm", ""), link_s,
                     f"{arch}{f' ({year})' if year else ''}" if arch else ""])

        err = to_int(g.get("ConfigManagerErrorCode"), 0)
        if vendor == "Microsoft" or "basic display" in name.lower():
            finding(sec, CRIT, f"'{name}': VGA đang chạy driver chuẩn của Microsoft (CHƯA CÀI DRIVER).",
                    "Tải driver từ trang hãng (NVIDIA/AMD/Intel hoặc hãng laptop). Tool không tự cài driver.")
        elif err:
            finding(sec, CRIT, f"'{name}': Device Manager báo lỗi Code {err}"
                               f"{' (Code 43: Windows dừng thiết bị do báo lỗi - driver hoặc VGA hỏng)' if err == 43 else ''}.",
                    "Gỡ driver bằng DDU ở Safe Mode rồi cài lại; nếu vẫn Code 43 thì nghi phần cứng VGA.")
        if ddate and (_dt.datetime.now() - ddate).days > 2 * 365 and vendor in ("NVIDIA", "AMD", "Intel"):
            finding(sec, INFO, f"'{name}': driver đã {(_dt.datetime.now() - ddate).days // 365} năm tuổi ({fmt_date(ddate, False)}).",
                    "Cân nhắc cập nhật driver từ trang hãng, nhất là khi lỗi game/ứng dụng.")
        if remark:
            finding(sec, INFO, f"'{name}' thuộc đời {arch}. {remark}", "")
        if disc and cw and mw and cw < mw and cw <= 8 and mw >= 8:
            finding(sec, WARN, f"'{name}': PCIe đang chạy x{cw} (card hỗ trợ x{mw}).",
                    "Kiểm tra VGA cắm khe PCIe x16 chính, vệ sinh chân tiếp xúc, cài BIOS mới. "
                    "Lưu ý: Gen thấp lúc không tải là bình thường (tiết kiệm điện), nhưng SỐ LÀN (x) thì không đổi.")
        if top_feat and re.match(r"^(9_|10_|11_0)", top_feat):
            finding(sec, INFO, f"'{name}': Feature Level cao nhất {top_feat} - không chạy được game yêu cầu DX12 FL 12_x.", "")

    table(sec, "Danh sách VGA", ["Tên", "Loại", "VRAM", "Driver", "Ngày driver", "Feature Level", "Driver Model",
                                 "PCIe link", "Đời GPU"], rows)
    if dx is None and getattr(src, "use_dxdiag", True):
        note(sec, "Không lấy được DirectX Feature Level (dxdiag không chạy được hoặc quá thời gian).")

    # nvidia-smi
    if smi:
        table(sec, "NVIDIA (nvidia-smi)", ["GPU", "Nhiệt", "Tải", "VRAM dùng", "Công suất", "Xung", "Quạt", "PCIe", "P-state"],
              [[x.get("name"), f"{x.get('temperature.gpu')}°C", f"{x.get('utilization.gpu')}%",
                f"{x.get('memory.used')}/{x.get('memory.total')} MiB", f"{x.get('power.draw')} W", f"{x.get('clocks.gr')} MHz",
                f"{x.get('fan.speed')}%", f"Gen{x.get('pcie.link.gen.current')}/{x.get('pcie.link.gen.max')} "
                f"x{x.get('pcie.link.width.current')}/{x.get('pcie.link.width.max')}", x.get("pstate")] for x in smi])
        for x in smi:
            t = to_int(x.get("temperature.gpu"))
            if t and t >= 85:
                finding(sec, WARN, f"GPU {x.get('name')} đang {t}°C.", "Vệ sinh VGA, thay keo/pad, kiểm tra quạt.")

    # Tải GPU (snapshot 2 giây)
    util = Counter()
    for c in as_list(src.ps("gpu_counters")):
        if isinstance(c, dict):
            m = re.search(r"engtype_(\w+)", str(c.get("Instance", "")))
            if m:
                util[m.group(1)] += float(c.get("Value") or 0)
    if util:
        kv(sec, "Tải GPU (snapshot)", ", ".join(f"{k} {min(v, 100):.0f}%" for k, v in util.most_common(4)))
        if util.get("3D", 0) >= 90:
            note(sec, "GPU 3D đang tải cao lúc kiểm tra - nếu không mở game/ứng dụng đồ họa, kiểm tra tiến trình lạ (đào coin).")

    # TDR / sự kiện VGA
    gev = ev.normalize(src.events("gpu"))
    tdr = [e for e in gev if (e["id"] == 4101 and e["provider"].lower() == "display")
           or (e["provider"].lower() == "nvlddmkm" and e["id"] in (13, 14, 153))
           or (e["provider"].lower().startswith("amdkm") and e["level"] in (1, 2))]
    if tdr:
        n = len(tdr)
        finding(sec, CRIT if n >= 10 else WARN,
                f"Có {n} lần driver VGA bị treo/reset (TDR) trong {src.days} ngày (lần gần nhất {fmt_date(tdr[0]['time'])}).",
                "Cài lại driver sạch (DDU), bỏ ép xung/undervolt VGA, kiểm tra nhiệt độ và nguồn (dây PCIe 8-pin). "
                "Nếu lặp lại với nhiều bản driver -> nghi VGA/VRAM.")
        table(sec, "Sự kiện TDR / driver VGA", ["Thời điểm", "Nguồn", "ID", "Nội dung"],
              [[fmt_date(e["time"]), e["provider"], e["id"], e["msg"][:160]] for e in tdr[:20]])

    # WHEA PCIe (VGA/khe PCIe)
    whea_pcie = [e for e in ev.normalize(src.events("whea")) if ev.whea_classify(e) == "PCIe"]
    if whea_pcie:
        finding(sec, WARN if len(whea_pcie) < 50 else CRIT, f"WHEA ghi nhận {len(whea_pcie)} lỗi PCIe.",
                "Lỗi PCIe thường do tiếp xúc khe/riser cáp, ASPM, BIOS; có thể liên quan VGA hoặc SSD NVMe.")

    # LiveKernelEvent: ưu tiên Event Log (WER 1001), không có thì đọc thư mục WER
    lke = ev.live_kernel_codes(ev.normalize(src.events("app")))
    if not lke:
        for w in as_list(src.probe("wer_reports")):
            d = (w or {}).get("data") or {}
            if str(d.get("EventType", "")).lower() == "livekernelevent":
                code = next((v for k, v in d.items() if k.startswith("Sig[") and k.endswith(".Value")
                             and d.get(k[:-len("Value")] + "Name", "").lower() == "code"), None)
                if code:
                    lke[str(code).lower()] += 1
    gpu_lke = {c: n for c, n in lke.items() if bc.parse_code(c) in GPU_LKE_CODES}
    reports = [r for r in as_list(src.probe("live_kernel_reports")) if isinstance(r, dict)]
    watchdog = [r for r in reports if "watchdog" in str(r.get("name", "")).lower() or "117" in str(r.get("name"))
                or "141" in str(r.get("name"))]
    if gpu_lke or watchdog:
        parts = [f"{bc.describe(bc.parse_code(c))[0]} x{n}" for c, n in gpu_lke.items()]
        if watchdog:
            parts.append(f"{len(watchdog)} file LiveKernelReports\\WATCHDOG")
        finding(sec, WARN, "LiveKernelEvent liên quan GPU: " + ", ".join(parts) + ".",
                "GPU bị treo và Windows tự phục hồi (màn hình đen vài giây/nháy). Xử lý như lỗi TDR.")

    # BSOD liên quan GPU
    dumps = (src.probe("minidumps") or {}).get("dumps") or []
    g_bsod = Counter()
    for d in dumps:
        code = d.get("bugcheck")
        if code is not None and bc.describe(code)[1][:1] == [bc.GPU]:
            g_bsod[bc.describe(code)[0]] += 1
    if g_bsod:
        finding(sec, CRIT, "BSOD do đồ họa: " + ", ".join(f"{k} x{v}" for k, v in g_bsod.items()) + ".",
                "Cài lại driver sạch, bỏ ép xung, kiểm tra nhiệt/nguồn; lặp nhiều thì nghi VGA hỏng.")

    if not has_discrete and gpus:
        note(sec, "Máy chỉ có card tích hợp: hiệu năng đồ họa phụ thuộc nhiều vào RAM dual channel.")
    if not sec["findings"]:
        finding(sec, OK, "Không thấy dấu hiệu lỗi VGA/driver trong dữ liệu đọc được.")
    return sec
