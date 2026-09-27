# -*- coding: utf-8 -*-
"""Kiểm thử PC QuickCheck (chạy được trên mọi HĐH): python -m unittest discover -s tests"""
import copy
import json
import os
import re
import struct
import sys
import tempfile
import unittest
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from pc_quickcheck import safety, queries, qa_export, report, cli  # noqa: E402
from pc_quickcheck.analysis import dumpfile, smart, bugcheck  # noqa: E402
from pc_quickcheck.collectors import memory, gpu  # noqa: E402
from pc_quickcheck.source import ReplaySource  # noqa: E402

PKG = os.path.join(ROOT, "pc_quickcheck")


def demo():
    with open(cli.DEMO_SNAPSHOT, encoding="utf-8") as fh:
        return json.load(fh)


class TestReadOnlyGuard(unittest.TestCase):
    def test_all_builtin_queries_pass(self):
        for name, script in queries.PS.items():
            with self.subTest(name=name):
                self.assertTrue(safety.check_ps(script))
        for g in queries.EVENT_GROUPS:
            self.assertTrue(safety.check_ps(queries.event_script(g, 30)))

    def test_writes_are_rejected(self):
        bad = [
            "Set-ItemProperty HKLM:\\X -Name a -Value 1", "Remove-Item C:\\x", "Format-Volume -DriveLetter D",
            "Clear-Disk -Number 1", "Get-Process | Stop-Process", "Restart-Computer", "Repair-Volume C",
            "Optimize-Volume C", "Get-Date | Out-File C:\\a.txt", "Get-Date > C:\\a.txt", "iex 'x'",
            "Invoke-Expression 'x'", "(Get-CimInstance Win32_Process).Terminate()",
            "[IO.File]::WriteAllText('a','b')", "Start-Process cmd", "Disable-PnpDevice -InstanceId x",
            "Uninstall-Package x", "Initialize-Disk 1", "New-Item x", "Invoke-CimMethod -ClassName X",
            "Get-WmiObject Win32_Volume | ForEach-Object { $_.Format('NTFS') }",
        ]
        for s in bad:
            with self.subTest(s=s):
                with self.assertRaises(safety.UnsafeCommand):
                    safety.check_ps(s)

    def test_exec_allowlist(self):
        ok = [["smartctl.exe", "--scan-open", "-j"], ["smartctl", "-x", "-j", "-d", "nvme", "/dev/nvme0"],
              ["smartctl", "-x", "-j", "-d", "sat", "/dev/sdb"],
              ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits"]]
        for a in ok:
            self.assertTrue(safety.check_exec(a))
        tmp = tempfile.mkdtemp()
        self.assertTrue(safety.check_exec(["dxdiag.exe", "/whql:off", "/t", os.path.join(tmp, "d.txt")], dxdiag_tmp_dir=tmp))
        bad = [["smartctl", "-t", "long", "/dev/sda"], ["smartctl", "-s", "on", "/dev/sda"],
               ["smartctl", "--set=wcache,off", "/dev/sda"], ["smartctl", "-o", "on", "/dev/sda"],
               ["nvidia-smi", "-pm", "1"], ["nvidia-smi", "-r"], ["cmd.exe", "/c", "del x"],
               ["diskpart"], ["chkdsk", "C:", "/f"], ["dxdiag", "/t", "C:\\Windows\\x.txt"],
               ["powershell.exe", "-Command", "Remove-Item x"]]
        for a in bad:
            with self.subTest(a=a):
                with self.assertRaises(safety.UnsafeCommand):
                    safety.check_exec(a, dxdiag_tmp_dir=tmp)

    def test_no_network_code(self):
        rx = re.compile(r"^\s*(import|from)\s+(socket|urllib|http|requests|ftplib|smtplib|ssl|asyncio|xmlrpc)\b", re.M)
        for dp, _, files in os.walk(PKG):
            for f in files:
                if f.endswith(".py"):
                    with open(os.path.join(dp, f), encoding="utf-8") as fh:
                        self.assertIsNone(rx.search(fh.read()), f"{f} có import thư viện mạng")


def _dump64(code, params, drivers=None, stack=(), stride=0xA0):
    """Tạo minidump 64-bit giả lập: header + triage + driver list + string pool + stack."""
    buf = bytearray(0x8000)
    buf[0:8] = b"PAGEDU64"
    struct.pack_into("<I", buf, 0x0C, 26100)
    struct.pack_into("<I", buf, 0x38, code)
    struct.pack_into("<4Q", buf, 0x40, *params)
    struct.pack_into("<I", buf, 0xF98, 4)
    struct.pack_into("<Q", buf, 0xFA8, 134035860000000000)  # 2025-09-27
    if drivers:
        dl, sp, st = 0x3000, 0x6000, 0x2800
        fields = [0] * 18
        fields[10], fields[11] = st, len(stack) * 8          # CallStackOffset, SizeOfCallStack
        fields[12], fields[13] = dl, len(drivers)            # DriverListOffset, DriverCount
        fields[14] = sp
        struct.pack_into("<18I", buf, 0x2000, *fields)
        off = sp
        for i, (name, base, size) in enumerate(drivers):
            e = dl + i * stride
            struct.pack_into("<I", buf, e, off)
            struct.pack_into("<Q", buf, e + 0x38, base)
            struct.pack_into("<I", buf, e + 0x48, size)
            enc = name.encode("utf-16-le")
            struct.pack_into("<I", buf, off, len(name))
            buf[off + 4:off + 4 + len(enc)] = enc
            off += 4 + len(enc) + 2
        for i, a in enumerate(stack):
            struct.pack_into("<Q", buf, st + i * 8, a)
    return bytes(buf)


class TestDump(unittest.TestCase):
    def test_header(self):
        info = dumpfile.parse_header(_dump64(0x116, [1, 2, 3, 4]))
        self.assertEqual(info["bugcheck"], 0x116)
        self.assertEqual(info["bugcheck_hex"], "0x00000116")
        self.assertEqual(info["dump_type"], "Small (minidump)")
        self.assertTrue(info["crash_time"].startswith("2025-"))
        self.assertEqual(dumpfile.parse_header(b"MDMP" + b"\0" * 200)["error"], "user_mode_dump")

    def test_triage_finds_suspect_driver(self):
        K = 0xFFFFF80000000000
        drivers = [("ntoskrnl.exe", K, 0x1000000)] + [(f"drv{i}.sys", K + 0x2000000 + i * 0x100000, 0x80000) for i in range(6)] \
            + [("\\SystemRoot\\System32\\drivers\\nvlddmkm.sys", K + 0x5000000, 0x3000000)]
        stack = [0x1234, K + 0x100, K + 0x5000100, K + 0x2000010]
        buf = _dump64(0x3B, [0xC0000005, K + 0x5000500, 0, 0], drivers, stack)
        tri = dumpfile.parse_triage(buf)
        self.assertEqual(tri["modules"], 8)
        self.assertEqual(tri["suspects"][0], "nvlddmkm.sys")
        self.assertEqual(tri["param_hits"], [{"param": 2, "module": "nvlddmkm.sys"}])
        self.assertIn("ntoskrnl.exe", tri["stack_modules"])
        self.assertNotIn("ntoskrnl.exe", tri["suspects"])
        path = os.path.join(tempfile.mkdtemp(), "t.dmp")
        with open(path, "wb") as fh:
            fh.write(buf)
        self.assertEqual(dumpfile.parse_dump_file(path)["triage"]["suspects"][0], "nvlddmkm.sys")

    def test_garbage_triage_is_ignored(self):
        self.assertEqual(dumpfile.parse_triage(_dump64(0x1A, [0, 0, 0, 0])), {})

    def test_bugcheck_bases(self):
        self.assertEqual(bugcheck.parse_code("278", base=10), 0x116)  # Kernel-Power 41 thập phân
        self.assertEqual(bugcheck.parse_code("124"), 0x124)            # WER hex
        self.assertEqual(bugcheck.parse_code("0x0000001a"), 0x1A)
        self.assertEqual(bugcheck.describe(0x124)[1][0], bugcheck.CPU)


class TestSmart(unittest.TestCase):
    def attr(self, i, raw, value=100, thresh=0):
        return {"id": i, "name": str(i), "value": value, "worst": value, "thresh": thresh, "raw": {"value": raw}}

    def test_ata(self):
        f, info = smart.evaluate_ata([self.attr(5, 0), self.attr(197, 4), self.attr(199, 12), self.attr(9, 5000),
                                      self.attr(194, 0x0014_0000_0026)], is_ssd=False)
        self.assertTrue(any(lv == smart.CRIT and "197" in t for lv, t, _ in f))
        self.assertTrue(any(lv == smart.WARN and "199" in t for lv, t, _ in f))
        self.assertEqual(info["power_on_hours"], 5000)
        self.assertEqual(info["temperature"], 0x26)

    def test_threshold_failure(self):
        f, _ = smart.evaluate_ata([self.attr(5, 900, value=30, thresh=36)], is_ssd=False)
        self.assertTrue(any("ngưỡng hỏng" in t for _, t, _ in f))

    def test_ssd_life(self):
        f, info = smart.evaluate_ata([self.attr(177, 0, value=8)], is_ssd=True)
        self.assertEqual(info["life_left"], 8)
        self.assertTrue(any(lv == smart.CRIT for lv, _, _ in f))

    def test_nvme(self):
        f, info = smart.evaluate_nvme({"critical_warning": 0b1001, "media_errors": 3, "percentage_used": 95,
                                       "available_spare": 5, "available_spare_threshold": 10, "temperature": 50,
                                       "data_units_written": 2000000})
        text = " ".join(t for _, t, _ in f)
        self.assertIn("CHỈ ĐỌC", text)
        self.assertIn("Media Errors = 3", text)
        self.assertEqual(info["life_left"], 5)
        self.assertEqual(info["written_bytes"], 2000000 * 512000)
        f2, _ = smart.evaluate_nvme({"critical_warning": 0, "media_errors": 0, "percentage_used": 2,
                                     "num_err_log_entries": 500})
        self.assertTrue(all(lv == smart.INFO for lv, _, _ in f2))

    def test_classify(self):
        self.assertEqual(smart.classify({"device": {"protocol": "NVMe"}}), smart.NVME)
        self.assertEqual(smart.classify({"rotation_rate": 0}), smart.SATA_SSD)
        self.assertEqual(smart.classify({"rotation_rate": 7200}), smart.HDD)
        self.assertEqual(smart.classify(None, "NVMe", "SSD"), smart.NVME)
        self.assertEqual(smart.classify(None, "11", "3"), smart.HDD)
        self.assertEqual(smart.classify(None, "SATA", "4"), smart.SATA_SSD)

    def test_wmi_parse(self):
        vs = [0] * 512
        o = 2
        vs[o], vs[o + 3], vs[o + 4] = 197, 100, 100
        vs[o + 5:o + 11] = list((300).to_bytes(6, "little"))
        th = [0] * 512
        th[2], th[3] = 197, 0
        attrs = smart.parse_wmi_smart(vs, th)
        self.assertEqual(attrs[0]["id"], 197)
        self.assertEqual(attrs[0]["raw"]["value"], 300)


class TestMemoryGpu(unittest.TestCase):
    def test_part_numbers(self):
        self.assertEqual(memory.rated_speed_from_part("F4-3600C16-16GVKC"), 3600)
        self.assertEqual(memory.rated_speed_from_part("KF436C18BBK2/32"), 3600)
        self.assertEqual(memory.rated_speed_from_part("CMK16GX4M2B3200C16"), 3200)
        self.assertIsNone(memory.rated_speed_from_part("M378A1K43CB2-CTD"))

    def test_channels(self):
        self.assertEqual(memory._channel({"BankLabel": "P0 CHANNEL B", "DeviceLocator": "DIMM 1"}), "B")
        self.assertEqual(memory._channel({"DeviceLocator": "ChannelA-DIMM0"}), "A")
        self.assertEqual(memory._channel({"DeviceLocator": "DIMM_B2"}), "B")
        self.assertIsNone(memory._channel({"DeviceLocator": "DIMM 1", "BankLabel": "BANK 0"}))

    def test_gpu_generation(self):
        self.assertIn("Ada", gpu.gpu_generation("NVIDIA GeForce RTX 4070 Ti")[1])
        self.assertIn("Pascal", gpu.gpu_generation("NVIDIA GeForce GTX 1060 6GB")[1])
        self.assertIn("RDNA 2", gpu.gpu_generation("AMD Radeon RX 6600")[1])
        self.assertIn("Polaris", gpu.gpu_generation("Radeon RX 580 Series")[1])
        self.assertIn("Xe-LP", gpu.gpu_generation("Intel(R) Iris(R) Xe Graphics")[1])
        self.assertIn("Gen9", gpu.gpu_generation("Intel(R) UHD Graphics 630")[1])
        self.assertFalse(gpu._is_discrete("AMD Radeon(TM) RX Vega 8 Graphics", "AMD"))
        self.assertTrue(gpu._is_discrete("AMD Radeon RX 7800 XT", "AMD"))


class TestDxdiag(unittest.TestCase):
    def test_parse(self):
        from pc_quickcheck import probes
        txt = """System Information
   DirectX Version: DirectX 12
Display Devices
          Card name: NVIDIA GeForce RTX 3060
     Driver Model: WDDM 3.2
      DDI Version: 12
   Feature Levels: 12_2,12_1,12_0,11_1
          Card name: Intel(R) UHD Graphics 770
     Driver Model: WDDM 3.1
   Feature Levels: 12_1,12_0
"""
        r = probes.parse_dxdiag(txt)
        self.assertEqual(r["directx"], "DirectX 12")
        self.assertEqual([a["name"] for a in r["adapters"]], ["NVIDIA GeForce RTX 3060", "Intel(R) UHD Graphics 770"])
        self.assertEqual(r["adapters"][0]["feature"].split(",")[0], "12_2")
        self.assertEqual(r["adapters"][1]["wddm"], "WDDM 3.1")


class TestReplayAndReports(unittest.TestCase):
    def test_demo_all_sections(self):
        secs = cli.analyze(ReplaySource(demo()))
        self.assertEqual([s["key"] for s in secs], cli.ORDER)
        by = {s["key"]: s for s in secs}
        self.assertEqual(by["disk"]["status"], "crit")
        self.assertEqual(by["gpu"]["status"], "crit")
        self.assertTrue(any("VGA" in f["text"] for f in by["crash"]["findings"]))
        for s in secs:
            self.assertFalse(any(f["level"] == "unknown" for f in s["findings"]), s["key"])

    def test_empty_snapshot_does_not_crash(self):
        secs = cli.analyze(ReplaySource({"meta": {}, "record": {}}))
        self.assertEqual(len(secs), 5)
        for s in secs:
            self.assertFalse(any("Lỗi khi phân tích" in f["text"] for f in s["findings"]), s["key"])

    def test_html_escaping(self):
        snap = demo()
        snap["record"]["ps:video"][0]["Name"] = "<script>alert(1)</script>"
        html = report.render(cli.analyze(ReplaySource(snap), ["gpu"]), snap["meta"], "t")
        self.assertNotIn("<script>alert", html)
        self.assertIn("&lt;script&gt;", html)


class TestRedaction(unittest.TestCase):
    SECRETS = ["DESKTOP-DEMO01", "demo_user", "S4EVNX0N123456A", "Z9A1BCDE", "210686519300123",
               "178BFBFF00A20F10", "4&2d7d0e6&0&010000", "1C3D25BB"]

    def test_secrets_removed_and_consistent(self):
        red, r = qa_export.redact_snapshot(demo(), extra_names=[])
        text = json.dumps(red, ensure_ascii=False)
        for s in self.SECRETS:
            self.assertNotIn(s.lower(), text.lower(), s)
        rec = red["record"]
        # cùng một serial ở 2 nguồn -> cùng mã giả để vẫn ghép được ổ
        self.assertEqual(rec["ps:physdisk"][0]["SerialNumber"],
                         rec["probe:smartctl_info:/dev/nvme0|nvme"]["serial_number"])
        self.assertIn("Samsung", text)
        self.assertIn("32.0.15.6094", text)  # phiên bản driver không bị coi là IP
        self.assertIn("C:\\\\Users\\\\<NGUOI_DUNG>", text)

    def test_replay_after_redaction_same_result(self):
        before = {s["key"]: s["status"] for s in cli.analyze(ReplaySource(demo()))}
        red, _ = qa_export.redact_snapshot(demo(), extra_names=[])
        after_secs = cli.analyze(ReplaySource(red))
        self.assertEqual(before, {s["key"]: s["status"] for s in after_secs})
        disk = next(s for s in after_secs if s["key"] == "disk")
        self.assertTrue(any(t["title"].startswith("Chi tiết SMART") for t in disk["tables"]))

    def test_text_rules(self):
        r = qa_export.Redactor()
        r.add_name("sam", "<NGUOI_DUNG>")
        out = r.text("sam dùng Samsung, ip 192.168.1.20, mac 00:1A:2B:3C:4D:5E, a@b.com, S-1-5-21-1-2-3-1001")
        self.assertIn("Samsung", out)
        self.assertTrue(out.startswith("<NGUOI_DUNG>"))
        for bad in ("192.168.1.20", "00:1A:2B", "a@b.com", "S-1-5-21"):
            self.assertNotIn(bad, out)

    def test_zip(self):
        out = tempfile.mkdtemp()
        p = qa_export.build_zip(demo(), out, symptom="Máy hay xanh màn khi chơi game",
                                analyze=cli.analyze_snapshot, render_reports=report.write_reports)
        with zipfile.ZipFile(p) as z:
            names = set(z.namelist())
            self.assertTrue({"README.txt", "snapshot.json", "ket_qua.json", "mo_ta_loi.txt",
                             "bao_cao_tong_hop.html"} <= names)
            blob = b"".join(z.read(n) for n in names).decode("utf-8", errors="replace").lower()
        for s in self.SECRETS:
            self.assertNotIn(s.lower(), blob, s)


if __name__ == "__main__":
    unittest.main()
