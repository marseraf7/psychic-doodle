# -*- coding: utf-8 -*-
"""Các truy vấn PowerShell CHỈ ĐỌC (Get-CimInstance / Get-WinEvent / Get-ItemProperty...).

Mỗi script trả về một hoặc nhiều object; `probes.run_ps_json` bọc lại thành mảng JSON.
Ngày giờ được đổi sang chuỗi ISO ngay trong PowerShell để tránh định dạng '/Date()/'.
"""

PS = {
    # ---------- Tổng quan ----------
    "os": r"""
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,
  @{n='LastBootUpTime';e={$_.LastBootUpTime.ToString('o')}},@{n='InstallDate';e={$_.InstallDate.ToString('o')}},
  TotalVisibleMemorySize,FreePhysicalMemory,CSName,SystemDrive,Locale
""",
    "cs": r"""
Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,SystemType,TotalPhysicalMemory,
  NumberOfProcessors,NumberOfLogicalProcessors,PCSystemType,Name,UserName,HypervisorPresent
""",
    "cpu": r"""
Get-CimInstance Win32_Processor | Select-Object Name,Manufacturer,NumberOfCores,NumberOfLogicalProcessors,
  MaxClockSpeed,CurrentClockSpeed,LoadPercentage,SocketDesignation,VirtualizationFirmwareEnabled,
  L2CacheSize,L3CacheSize,ProcessorId
""",
    "board": r"""
Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product,Version,SerialNumber
""",
    "bios": r"""
Get-CimInstance Win32_BIOS | Select-Object Manufacturer,SMBIOSBIOSVersion,
  @{n='ReleaseDate';e={$_.ReleaseDate.ToString('o')}},SerialNumber
""",
    "volumes": r"""
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace
""",
    "battery": r"""
Get-CimInstance Win32_Battery | Select-Object Name,EstimatedChargeRemaining,BatteryStatus
""",
    "battery_capacity": r"""
$full = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity)
$static = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData)
for ($i = 0; $i -lt $full.Count; $i++) {
  [pscustomobject]@{ FullChargedCapacity = $full[$i].FullChargedCapacity;
                     DesignedCapacity = $(if ($i -lt $static.Count) { $static[$i].DesignedCapacity } else { $null }) }
}
""",
    "thermal": r"""
Get-CimInstance -Namespace root\wmi -ClassName MSAcpi_ThermalZoneTemperature |
  Select-Object InstanceName,CurrentTemperature,CriticalTripPoint
""",
    "secureboot": r"""
[pscustomobject]@{ SecureBoot = $(try { Confirm-SecureBootUEFI } catch { $null }) }
""",
    "hotfix_last": r"""
Get-CimInstance Win32_QuickFixEngineering | Select-Object HotFixID,@{n='InstalledOn';e={[string]$_.InstalledOn}} |
  Sort-Object InstalledOn -Descending | Select-Object -First 5
""",

    # ---------- Ổ cứng ----------
    "physdisk": r"""
Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,SerialNumber,@{n='MediaType';e={[string]$_.MediaType}},
  @{n='BusType';e={[string]$_.BusType}},Size,@{n='HealthStatus';e={[string]$_.HealthStatus}},
  @{n='OperationalStatus';e={[string]$_.OperationalStatus}},FirmwareVersion,SpindleSpeed
""",
    "diskdrive": r"""
Get-CimInstance Win32_DiskDrive | Select-Object Index,Model,InterfaceType,PNPDeviceID,Status,SerialNumber,
  Size,FirmwareRevision,MediaType
""",
    "reliability": r"""
Get-PhysicalDisk | ForEach-Object {
  $d = $_
  $r = $d | Get-StorageReliabilityCounter
  if ($r) {
    [pscustomobject]@{ DeviceId = $d.DeviceId; Temperature = $r.Temperature; TemperatureMax = $r.TemperatureMax;
      Wear = $r.Wear; ReadErrorsTotal = $r.ReadErrorsTotal; ReadErrorsUncorrected = $r.ReadErrorsUncorrected;
      WriteErrorsTotal = $r.WriteErrorsTotal; WriteErrorsUncorrected = $r.WriteErrorsUncorrected;
      PowerOnHours = $r.PowerOnHours; StartStopCycleCount = $r.StartStopCycleCount }
  }
}
""",
    "failpredict_status": r"""
Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus |
  Select-Object InstanceName,PredictFailure,Reason
""",
    "failpredict_data": r"""
Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictData |
  Select-Object InstanceName,@{n='VendorSpecific';e={@($_.VendorSpecific)}}
""",
    "failpredict_thresholds": r"""
Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictThresholds |
  Select-Object InstanceName,@{n='VendorSpecific';e={@($_.VendorSpecific)}}
""",
    "nvme_link": r"""
Get-PnpDevice -Class SCSIAdapter -PresentOnly | Where-Object { $_.FriendlyName -match 'NVM|NVMe' } | ForEach-Object {
  $h = @{ Name = $_.FriendlyName; InstanceId = $_.InstanceId; Status = [string]$_.Status }
  Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_PciDevice_CurrentLinkSpeed',
    'DEVPKEY_PciDevice_CurrentLinkWidth','DEVPKEY_PciDevice_MaxLinkSpeed','DEVPKEY_PciDevice_MaxLinkWidth' |
    ForEach-Object { $h[$_.KeyName] = $_.Data }
  [pscustomobject]$h
}
""",

    # ---------- RAM ----------
    "dimm": r"""
Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,BankLabel,DeviceLocator,Speed,ConfiguredClockSpeed,
  ConfiguredVoltage,MinVoltage,MaxVoltage,SMBIOSMemoryType,MemoryType,TypeDetail,FormFactor,DataWidth,TotalWidth,
  Manufacturer,PartNumber,SerialNumber
""",
    "memarray": r"""
Get-CimInstance Win32_PhysicalMemoryArray | Select-Object MemoryDevices,MaxCapacity,MaxCapacityEx,
  MemoryErrorCorrection,Use
""",
    "memperf": r"""
Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object AvailableMBytes,CommittedBytes,CommitLimit,
  PagesPerSec,PercentCommittedBytesInUse
""",

    # ---------- VGA / GPU ----------
    "video": r"""
Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,DriverVersion,
  @{n='DriverDate';e={ if ($_.DriverDate) { $_.DriverDate.ToString('o') } }},VideoProcessor,AdapterRAM,PNPDeviceID,
  Status,ConfigManagerErrorCode,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate
""",
    "gpu_registry": r"""
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' |
  Select-Object DriverDesc,MatchingDeviceId,DriverVersion,
    @{n='QwMemorySize';e={$_.'HardwareInformation.qwMemorySize'}},
    @{n='MemorySize';e={ $v = $_.'HardwareInformation.MemorySize'; if ($v -is [byte[]]) { [BitConverter]::ToUInt32($v, 0) } else { $v } }}
""",
    "gpu_link": r"""
Get-PnpDevice -Class Display -PresentOnly | ForEach-Object {
  $h = @{ Name = $_.FriendlyName; InstanceId = $_.InstanceId; Status = [string]$_.Status; Problem = [string]$_.Problem }
  Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_PciDevice_CurrentLinkSpeed',
    'DEVPKEY_PciDevice_CurrentLinkWidth','DEVPKEY_PciDevice_MaxLinkSpeed','DEVPKEY_PciDevice_MaxLinkWidth' |
    ForEach-Object { $h[$_.KeyName] = $_.Data }
  [pscustomobject]$h
}
""",
    "gpu_counters": r"""
$s = (Get-Counter -Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples 2).CounterSamples
$s | Group-Object InstanceName | ForEach-Object {
  [pscustomobject]@{ Instance = $_.Name; Value = ($_.Group | Measure-Object CookedValue -Average).Average }
}
""",
    "gpu_memory_counters": r"""
(Get-Counter -Counter '\GPU Adapter Memory(*)\Dedicated Usage').CounterSamples |
  Select-Object @{n='Instance';e={$_.InstanceName}},@{n='Value';e={$_.CookedValue}}
""",
}

# ---------- Nhật ký sự kiện (Get-WinEvent, chỉ đọc) ----------
# nhóm -> (log, danh sách provider, danh sách Id hoặc None, số sự kiện tối đa)
EVENT_GROUPS = {
    "disk": ("System", ["disk", "stornvme", "storahci", "Ntfs", "Microsoft-Windows-Ntfs", "iaStorAC", "iaStorA",
                        "iaStorAVC", "iaStorVD", "volmgr", "Microsoft-Windows-StorPort", "nvme"], None, 400),
    "whea": ("System", ["Microsoft-Windows-WHEA-Logger"], None, 300),
    "memdiag": ("System", ["Microsoft-Windows-MemoryDiagnostics-Results"], None, 20),
    "gpu": ("System", ["Display", "nvlddmkm", "amdkmdag", "amdkmdap", "amdwddmg", "igfx", "igfxn", "igfxnd",
                       "Microsoft-Windows-DxgKrnl"], None, 300),
    "power": ("System", ["Microsoft-Windows-Kernel-Power", "EventLog", "Microsoft-Windows-WER-SystemErrorReporting",
                         "User32", "BugCheck"], [41, 6008, 1001, 1074], 400),
    "app": ("Application", ["Application Error", "Application Hang", "Windows Error Reporting"],
            [1000, 1001, 1002], 400),
}

_EVENT_TEMPLATE = r"""
$f = @{ LogName = '__LOG__'; ProviderName = @(__PROVIDERS__); StartTime = (Get-Date).AddDays(-__DAYS__) __IDS__ }
Get-WinEvent -FilterHashtable $f -MaxEvents __MAX__ | Select-Object @{n='Time';e={$_.TimeCreated.ToString('o')}},Id,
  ProviderName,Level,
  @{n='Msg';e={ $m = $_.Message; if ($m) { $m.Substring(0, [Math]::Min(600, $m.Length)) } }},
  @{n='Props';e={ @($_.Properties | Select-Object -First 12 | ForEach-Object { [string]$_.Value }) }}
"""


def event_script(group, days):
    log, providers, ids, mx = EVENT_GROUPS[group]
    s = _EVENT_TEMPLATE.replace("__LOG__", log)
    s = s.replace("__PROVIDERS__", ",".join(f"'{p}'" for p in providers))
    s = s.replace("__IDS__", f"; Id = @({','.join(str(i) for i in ids)})" if ids else "")
    s = s.replace("__DAYS__", str(int(days))).replace("__MAX__", str(int(mx)))
    return s
