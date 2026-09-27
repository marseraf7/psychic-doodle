# -*- coding: utf-8 -*-
"""Bảng tra mã BugCheck (BSOD) / LiveKernelEvent -> nhóm nghi vấn + gợi ý tiếng Việt."""

RAM, GPU, DISK, DRIVER, CPU, POWER, SOFTWARE, BOOT = "RAM", "GPU", "DISK", "DRIVER", "CPU", "POWER", "SOFTWARE", "BOOT"
CATEGORY_LABEL = {
    RAM: "RAM / bộ nhớ", GPU: "VGA / driver đồ họa", DISK: "Ổ cứng / SSD / controller",
    DRIVER: "Driver (bên thứ ba)", CPU: "CPU / ép xung / BIOS", POWER: "Nguồn / tiết kiệm điện",
    SOFTWARE: "Phần mềm / Windows", BOOT: "Khởi động / ổ hệ thống",
}

# mã -> (tên, [nhóm nghi vấn theo thứ tự ưu tiên], gợi ý)
BUGCHECKS = {
    0x0000000A: ("IRQL_NOT_LESS_OR_EQUAL", [DRIVER, RAM], "Thường do driver truy cập sai bộ nhớ; nếu lặp nhiều driver khác nhau thì nghi RAM."),
    0x0000001A: ("MEMORY_MANAGEMENT", [RAM, DRIVER], "Lỗi quản lý bộ nhớ: ưu tiên test RAM (MemTest86), tắt XMP/EXPO để thử."),
    0x0000001E: ("KMODE_EXCEPTION_NOT_HANDLED", [DRIVER, RAM], "Driver gây ngoại lệ ở kernel; cập nhật/gỡ driver mới cài gần đây."),
    0x00000019: ("BAD_POOL_HEADER", [DRIVER, RAM], "Hỏng vùng nhớ pool: driver lỗi (antivirus, VPN...) hoặc RAM."),
    0x00000024: ("NTFS_FILE_SYSTEM", [DISK], "Lỗi hệ thống file NTFS: kiểm tra SMART ổ, chạy chkdsk (chế độ chỉ đọc /scan)."),
    0x0000003B: ("SYSTEM_SERVICE_EXCEPTION", [DRIVER, GPU, RAM], "Hay gặp với driver VGA/antivirus; nếu tham số 1 = 0xC0000005 là truy cập bộ nhớ sai."),
    0x00000050: ("PAGE_FAULT_IN_NONPAGED_AREA", [RAM, DRIVER, DISK], "Tham chiếu vùng nhớ không hợp lệ: RAM lỗi, driver lỗi hoặc ổ lỗi (pagefile)."),
    0x0000007A: ("KERNEL_DATA_INPAGE_ERROR", [DISK, RAM], "Không đọc được dữ liệu từ pagefile/ổ: kiểm tra SMART, cáp SATA, nguồn cấp ổ."),
    0x0000007B: ("INACCESSIBLE_BOOT_DEVICE", [BOOT, DISK], "Không truy cập được ổ khởi động: chế độ SATA (AHCI/RAID) đổi, ổ lỗi hoặc driver storage."),
    0x0000007E: ("SYSTEM_THREAD_EXCEPTION_NOT_HANDLED", [DRIVER, GPU], "Driver gây lỗi trong luồng hệ thống; xem driver xuất hiện trong dump."),
    0x0000007F: ("UNEXPECTED_KERNEL_MODE_TRAP", [CPU, RAM], "Thường do phần cứng (RAM/CPU) hoặc ép xung không ổn định."),
    0x0000009F: ("DRIVER_POWER_STATE_FAILURE", [POWER, DRIVER], "Driver không xử lý đúng khi sleep/wake: cập nhật driver chipset/Wi-Fi/VGA, tắt Fast Startup."),
    0x000000A0: ("INTERNAL_POWER_ERROR", [POWER], "Lỗi quản lý nguồn: cập nhật BIOS/chipset, kiểm tra hibernate."),
    0x000000BE: ("ATTEMPTED_WRITE_TO_READONLY_MEMORY", [DRIVER, RAM], "Driver ghi vào vùng nhớ chỉ đọc."),
    0x000000C2: ("BAD_POOL_CALLER", [DRIVER], "Driver cấp phát bộ nhớ sai."),
    0x000000C5: ("DRIVER_CORRUPTED_EXPOOL", [DRIVER, RAM], "Driver làm hỏng pool bộ nhớ."),
    0x000000D1: ("DRIVER_IRQL_NOT_LESS_OR_EQUAL", [DRIVER], "Driver (mạng, Wi-Fi, USB, VGA...) truy cập sai bộ nhớ - xem driver trong dump."),
    0x000000EF: ("CRITICAL_PROCESS_DIED", [SOFTWARE, DISK], "Tiến trình hệ thống chết: file hệ thống hỏng, ổ lỗi hoặc phần mềm can thiệp."),
    0x000000F4: ("CRITICAL_OBJECT_TERMINATION", [DISK, SOFTWARE], "Hay gặp khi ổ/SSD lỗi hoặc cáp SATA lỏng."),
    0x000000FC: ("ATTEMPTED_EXECUTE_OF_NOEXECUTE_MEMORY", [DRIVER, RAM], "Driver chạy mã trong vùng nhớ không được thực thi."),
    0x00000101: ("CLOCK_WATCHDOG_TIMEOUT", [CPU, POWER], "Một nhân CPU không phản hồi: ép xung/undervolt, BIOS cũ, nguồn yếu hoặc CPU lỗi."),
    0x00000109: ("CRITICAL_STRUCTURE_CORRUPTION", [DRIVER, RAM], "Cấu trúc kernel bị sửa: driver can thiệp (anti-cheat, công cụ hack) hoặc RAM lỗi."),
    0x00000116: ("VIDEO_TDR_FAILURE", [GPU], "Driver VGA không phục hồi được: cài lại driver sạch (DDU), kiểm tra nhiệt, nguồn, ép xung VGA."),
    0x00000117: ("VIDEO_TDR_TIMEOUT_DETECTED", [GPU], "VGA treo và được reset: driver, nhiệt độ, nguồn hoặc VGA lỗi."),
    0x00000119: ("VIDEO_SCHEDULER_INTERNAL_ERROR", [GPU], "Lỗi bộ lập lịch đồ họa: driver VGA hoặc VGA lỗi."),
    0x00000124: ("WHEA_UNCORRECTABLE_ERROR", [CPU, RAM, POWER], "Lỗi phần cứng không sửa được (CPU/RAM/PCIe): tắt ép xung/XMP, kiểm tra nhiệt, nguồn, BIOS."),
    0x00000133: ("DPC_WATCHDOG_VIOLATION", [DRIVER, DISK], "Driver xử lý quá lâu: hay do firmware SSD cũ, driver storage (iaStor), driver âm thanh/mạng."),
    0x00000139: ("KERNEL_SECURITY_CHECK_FAILURE", [DRIVER, RAM], "Cấu trúc dữ liệu kernel hỏng: driver lỗi hoặc RAM."),
    0x0000013A: ("KERNEL_MODE_HEAP_CORRUPTION", [DRIVER, GPU], "Hỏng heap kernel: thường do driver (hay gặp driver VGA)."),
    0x00000141: ("VIDEO_ENGINE_TIMEOUT_DETECTED", [GPU], "Engine đồ họa không phản hồi (LiveKernelEvent): driver/VGA."),
    0x00000144: ("BUGCODE_USB3_DRIVER", [DRIVER], "Lỗi driver/thiết bị USB 3."),
    0x00000154: ("UNEXPECTED_STORE_EXCEPTION", [DISK, RAM], "Lỗi kho bộ nhớ nén: ổ/SSD lỗi, firmware SSD hoặc RAM."),
    0x0000015F: ("CONNECTED_STANDBY_WATCHDOG_TIMEOUT_LIVEDUMP", [POWER, DRIVER], "Lỗi Modern Standby (laptop): cập nhật driver/BIOS."),
    0x0000019C: ("WIN32K_POWER_WATCHDOG_TIMEOUT", [POWER, GPU], "Treo khi bật/tắt màn hình: driver VGA/màn hình."),
    0x000001A8: ("BUGCODE_NDIS_DRIVER_LIVE_DUMP", [DRIVER], "Driver mạng gặp lỗi (live dump)."),
    0x00000193: ("VIDEO_DXGKRNL_LIVEDUMP", [GPU], "Live dump của nhân đồ họa DirectX."),
    0x000001CA: ("SYNTHETIC_WATCHDOG_TIMEOUT", [CPU, DRIVER], "Hệ thống bị treo lâu: driver hoặc phần cứng."),
    0x000001D4: ("UCMUCSI_LIVEDUMP", [DRIVER], "Lỗi USB-C (live dump)."),
    0xC000021A: ("STATUS_SYSTEM_PROCESS_TERMINATED", [SOFTWARE], "Tiến trình winlogon/csrss chết: file hệ thống hỏng, cập nhật lỗi."),
}


def describe(code):
    """code (int) -> (tên, nhóm, gợi ý)."""
    if code in BUGCHECKS:
        return BUGCHECKS[code]
    return (f"0x{code:08X}", [SOFTWARE], "Mã ít gặp: tra cứu tên mã trên Microsoft Learn (Bug Check Code Reference).")


def parse_code(v, base=16):
    """'0x0000001a' / '1a' / '124' -> int. Kernel-Power 41 ghi THẬP PHÂN (base=10),
    còn WER 'BCCode'/'Code' ghi hex không có tiền tố 0x (base=16)."""
    if v is None:
        return None
    if isinstance(v, int):
        return v
    s = str(v).strip().lower()
    if not s:
        return None
    try:
        return int(s, 16) if s.startswith("0x") else int(s, base)
    except ValueError:
        return None


# Driver bên thứ ba hay gặp trong dump - dùng để gợi ý khoanh vùng
KNOWN_DRIVERS = {
    "nvlddmkm.sys": (GPU, "Driver NVIDIA"), "atikmdag.sys": (GPU, "Driver AMD Radeon"),
    "amdkmdag.sys": (GPU, "Driver AMD Radeon"), "atikmpag.sys": (GPU, "Driver AMD Radeon"),
    "igdkmd64.sys": (GPU, "Driver Intel Graphics"), "igdkmdn64.sys": (GPU, "Driver Intel Graphics"),
    "igdkmdnd64.sys": (GPU, "Driver Intel Graphics"), "dxgkrnl.sys": (GPU, "Nhân DirectX (Microsoft)"),
    "dxgmms2.sys": (GPU, "Bộ lập lịch GPU (Microsoft)"), "watchdog.sys": (GPU, "Watchdog đồ họa"),
    "iastora.sys": (DISK, "Intel RST"), "iastorac.sys": (DISK, "Intel RST"), "iastoravc.sys": (DISK, "Intel RST"),
    "iastorvd.sys": (DISK, "Intel RST VMD"), "stornvme.sys": (DISK, "NVMe (Microsoft)"),
    "storahci.sys": (DISK, "SATA AHCI (Microsoft)"), "ntfs.sys": (DISK, "Hệ thống file NTFS"),
    "secnvme.sys": (DISK, "Samsung NVMe"), "amdsata.sys": (DISK, "AMD SATA"), "amdraid.sys": (DISK, "AMD RAID"),
    "rtwlane.sys": (DRIVER, "Wi-Fi Realtek"), "rtwlanu.sys": (DRIVER, "Wi-Fi Realtek USB"),
    "netwtw04.sys": (DRIVER, "Wi-Fi Intel"), "netwtw06.sys": (DRIVER, "Wi-Fi Intel"),
    "netwtw08.sys": (DRIVER, "Wi-Fi Intel"), "netwtw10.sys": (DRIVER, "Wi-Fi Intel"),
    "rt640x64.sys": (DRIVER, "LAN Realtek"), "rtux64w10.sys": (DRIVER, "LAN Realtek USB"),
    "e1d68x64.sys": (DRIVER, "LAN Intel"), "e2f68.sys": (DRIVER, "LAN Intel I225/I226"),
    "bwcw10x64.sys": (DRIVER, "Killer Network"), "athw8x.sys": (DRIVER, "Wi-Fi Qualcomm Atheros"),
    "aswsp.sys": (DRIVER, "Avast/AVG"), "aswarpot.sys": (DRIVER, "Avast/AVG"),
    "klif.sys": (DRIVER, "Kaspersky"), "ehdrv.sys": (DRIVER, "ESET"), "bdselfpr.sys": (DRIVER, "Bitdefender"),
    "vgk.sys": (DRIVER, "Riot Vanguard"), "easyanticheat.sys": (DRIVER, "EasyAntiCheat"),
    "easyanticheat_eos.sys": (DRIVER, "EasyAntiCheat"), "bedaisy.sys": (DRIVER, "BattlEye"),
    "ene.sys": (DRIVER, "Điều khiển RGB (ENE)"), "rtcore64.sys": (DRIVER, "MSI Afterburner/RTCore"),
    "winring0x64.sys": (DRIVER, "WinRing0 (tool giám sát/RGB)"), "iqvw64e.sys": (DRIVER, "Intel NIC diag"),
    "gdrv.sys": (DRIVER, "Gigabyte tool"), "asio.sys": (DRIVER, "ASUS AI Suite"), "asio2.sys": (DRIVER, "ASUS"),
    "atkwmiacpi64.sys": (DRIVER, "ASUS ACPI"), "tap0901.sys": (DRIVER, "VPN TAP"),
    "wintun.sys": (DRIVER, "VPN WireGuard"), "vboxdrv.sys": (DRIVER, "VirtualBox"),
    "cmudaxp.sys": (DRIVER, "Âm thanh C-Media"), "rtkvhd64.sys": (DRIVER, "Âm thanh Realtek"),
    "intelppm.sys": (CPU, "Quản lý nguồn CPU Intel"), "amdppm.sys": (CPU, "Quản lý nguồn CPU AMD"),
    "amdpsp.sys": (CPU, "AMD PSP"), "hal.dll": (CPU, "HAL"),
    "usbxhci.sys": (DRIVER, "USB 3 (Microsoft)"), "ucx01000.sys": (DRIVER, "USB (Microsoft)"),
}
