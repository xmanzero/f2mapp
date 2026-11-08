using System;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace F2mScan
{
    /// <summary>
    /// Đọc cấu hình máy. Chỗ nào không đọc được thì bỏ trống (null), không bao giờ làm phần mềm dừng.
    /// </summary>
    public static class Scanner
    {
        public static ScanReport Scan(string tool)
        {
            var r = new ScanReport { Tool = tool };
            Try(() => r.Os = Query("SELECT Caption, Version FROM Win32_OperatingSystem").Select(o => $"{Str(o, "Caption")} {Str(o, "Version")}".Trim()).FirstOrDefault());
            r.Cpu = Try(ReadCpu) ?? new CpuInfo { Name = "" };
            r.Gpus = Try(ReadGpus) ?? new List<GpuInfo>();
            r.Board = Try(ReadBoard) ?? new BoardInfo { Manufacturer = "", Product = "" };
            r.Ram = Try(ReadRam) ?? new List<RamInfo>();
            r.Disks = Try(ReadDisks) ?? new List<DiskInfo>();
            r.Display = Try(ReadDisplay);
            return r;
        }

        // ---------- CPU ----------
        static CpuInfo ReadCpu()
        {
            var p = Query("SELECT Name, NumberOfCores, NumberOfLogicalProcessors FROM Win32_Processor").FirstOrDefault();
            if (p == null) return null;
            return new CpuInfo { Name = Clean(Str(p, "Name")) ?? "", Cores = Int(p, "NumberOfCores"), Threads = Int(p, "NumberOfLogicalProcessors") };
        }

        // ---------- card đồ họa ----------
        const string DisplayClass = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

        static List<GpuInfo> ReadGpus()
        {
            var vram = ReadVramFromRegistry();
            var list = new List<GpuInfo>();
            foreach (var v in Query("SELECT Name, PNPDeviceID, AdapterRAM FROM Win32_VideoController"))
            {
                string name = Clean(Str(v, "Name")), pnp = Str(v, "PNPDeviceID") ?? "";
                if (string.IsNullOrEmpty(name)) continue;
                // AdapterRAM của WMI là số 32 bit (tối đa 4 GB) → lấy VRAM thật trong registry của driver
                double? bytes = null;
                foreach (var kv in vram)
                    if (pnp.StartsWith(kv.Key, StringComparison.OrdinalIgnoreCase) || string.Equals(kv.Value.Item1, name, StringComparison.OrdinalIgnoreCase))
                    { bytes = kv.Value.Item2; break; }
                if (bytes == null) { var a = Double(v, "AdapterRAM"); if (a > 0) bytes = a; }
                list.Add(new GpuInfo { Name = name, VramBytes = bytes, PcieGen = Pci.MaxLinkGen(pnp) });
            }
            return list;
        }

        /// <summary>MatchingDeviceId của driver → (tên driver, số byte VRAM)</summary>
        static Dictionary<string, Tuple<string, double>> ReadVramFromRegistry()
        {
            var map = new Dictionary<string, Tuple<string, double>>(StringComparer.OrdinalIgnoreCase);
            using (var root = Registry.LocalMachine.OpenSubKey(DisplayClass))
            {
                if (root == null) return map;
                foreach (var sub in root.GetSubKeyNames().Where(n => n.All(char.IsDigit)))
                    using (var k = root.OpenSubKey(sub))
                    {
                        if (k == null) continue;
                        var id = k.GetValue("MatchingDeviceId") as string;
                        var desc = k.GetValue("DriverDesc") as string;
                        double bytes = 0;
                        var q = k.GetValue("HardwareInformation.qwMemorySize");
                        if (q is long l) bytes = l;
                        else if (q is byte[] qb && qb.Length >= 8) bytes = BitConverter.ToInt64(qb, 0);
                        if (bytes <= 0)
                        {
                            var m = k.GetValue("HardwareInformation.MemorySize");
                            if (m is int i) bytes = unchecked((uint)i);
                            else if (m is long ml) bytes = ml;
                            else if (m is byte[] mb && mb.Length >= 4) bytes = BitConverter.ToUInt32(mb, 0);
                        }
                        if (!string.IsNullOrEmpty(id) && bytes > 0 && !map.ContainsKey(id)) map[id] = Tuple.Create(desc, bytes);
                    }
            }
            return map;
        }

        // ---------- mainboard ----------
        static BoardInfo ReadBoard()
        {
            var b = Query("SELECT Manufacturer, Product FROM Win32_BaseBoard").FirstOrDefault();
            return b == null ? null : new BoardInfo { Manufacturer = Clean(Str(b, "Manufacturer")) ?? "", Product = Clean(Str(b, "Product")) ?? "" };
        }

        // ---------- RAM ----------
        static List<RamInfo> ReadRam()
        {
            var list = new List<RamInfo>();
            foreach (var m in Query("SELECT Capacity, Speed, ConfiguredClockSpeed, SMBIOSMemoryType, FormFactor, Manufacturer, PartNumber, DataWidth, TotalWidth FROM Win32_PhysicalMemory"))
            {
                var cap = Double(m, "Capacity");
                if (cap <= 0) continue;
                // ConfiguredClockSpeed = tốc độ đang chạy (đã bật XMP / EXPO); Speed = tốc độ chuẩn của thanh
                var configured = Int(m, "ConfiguredClockSpeed");
                list.Add(new RamInfo
                {
                    CapacityBytes = cap, SpeedMhz = configured > 0 ? configured : Int(m, "Speed"), SmbiosType = Int(m, "SMBIOSMemoryType"),
                    FormFactor = Int(m, "FormFactor"), Manufacturer = Clean(Str(m, "Manufacturer")), PartNumber = Clean(Str(m, "PartNumber")),
                    DataWidth = Int(m, "DataWidth"), TotalWidth = Int(m, "TotalWidth"),
                });
            }
            return list;
        }

        // ---------- ổ cứng ----------
        const string StorageNs = @"root\Microsoft\Windows\Storage";

        static List<DiskInfo> ReadDisks()
        {
            // số thứ tự ổ → có chứa Windows không
            var boot = new HashSet<string>();
            foreach (var d in Query("SELECT Number, IsBoot, IsSystem FROM MSFT_Disk", StorageNs))
                if (Bool(d, "IsBoot") || Bool(d, "IsSystem")) boot.Add(Str(d, "Number"));
            // số thứ tự ổ → PNPDeviceID (để đọc thế hệ PCIe của ổ NVMe)
            var pnp = new Dictionary<string, string>();
            foreach (var d in Query("SELECT Index, PNPDeviceID FROM Win32_DiskDrive")) pnp[Str(d, "Index") ?? ""] = Str(d, "PNPDeviceID");

            var list = new List<DiskInfo>();
            foreach (var d in Query("SELECT DeviceId, FriendlyName, Model, Size, BusType, MediaType, ObjectId FROM MSFT_PhysicalDisk", StorageNs))
            {
                var id = Str(d, "DeviceId") ?? "";
                var bus = Int(d, "BusType");
                var info = new DiskInfo
                {
                    Model = Clean(Str(d, "FriendlyName") ?? Str(d, "Model")) ?? "", SizeBytes = Double(d, "Size"), BusType = bus,
                    MediaType = Int(d, "MediaType"), IsBoot = boot.Contains(id),
                };
                if (bus == 17 && pnp.TryGetValue(id, out var pid)) info.PcieGen = Pci.MaxLinkGen(Pci.Parent(pid));
                info.HealthPct = Try(() => Health(d));
                list.Add(info);
            }
            return list;
        }

        /// <summary>100 − Wear (% đã hao mòn). Thường cần quyền quản trị; không đọc được thì null.</summary>
        static int? Health(ManagementObject disk)
        {
            using (var s = new ManagementObjectSearcher(new ManagementScope(StorageNs),
                new ObjectQuery($"ASSOCIATORS OF {{MSFT_PhysicalDisk.ObjectId=\"{Str(disk, "ObjectId")?.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"}} WHERE AssocClass = MSFT_PhysicalDiskToStorageReliabilityCounter")))
                foreach (ManagementObject c in s.Get())
                {
                    var wear = Int(c, "Wear");
                    if (wear != null && wear >= 0 && wear <= 100) return 100 - wear.Value;
                }
            return null;
        }

        // ---------- màn hình ----------
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DEVMODE
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
            public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
            public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
            public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
            public short dmLogPixels;
            public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
            public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
        }
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE dm);

        /// <summary>Độ phân giải thật của màn hình chính (không bị Windows co giãn theo DPI)</summary>
        static DisplayInfo ReadDisplay()
        {
            var dm = new DEVMODE { dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)) };
            if (!EnumDisplaySettings(null, -1, ref dm) || dm.dmPelsWidth <= 0) return null;
            return new DisplayInfo { Width = dm.dmPelsWidth, Height = dm.dmPelsHeight };
        }

        // ---------- tiện ích ----------
        static IEnumerable<ManagementObject> Query(string wql, string ns = @"root\cimv2")
        {
            using (var s = new ManagementObjectSearcher(new ManagementScope(ns), new ObjectQuery(wql)))
                foreach (ManagementObject o in s.Get()) yield return o;
        }
        static string Str(ManagementBaseObject o, string p) { try { return o[p]?.ToString(); } catch { return null; } }
        static int? Int(ManagementBaseObject o, string p) { try { var v = o[p]; return v == null ? (int?)null : Convert.ToInt32(v); } catch { return null; } }
        static double Double(ManagementBaseObject o, string p) { try { var v = o[p]; return v == null ? 0 : Convert.ToDouble(v); } catch { return 0; } }
        static bool Bool(ManagementBaseObject o, string p) { try { return o[p] is bool b && b; } catch { return false; } }
        static string Clean(string s) => s == null ? null : string.Join(" ", s.Split(new[] { ' ', '\t', '\0' }, StringSplitOptions.RemoveEmptyEntries));
        static T Try<T>(Func<T> f) { try { return f(); } catch { return default; } }
        static void Try(Action f) { try { f(); } catch { } }
    }

    /// <summary>Thế hệ PCIe đọc từ thuộc tính thiết bị của Windows (CfgMgr32)</summary>
    static class Pci
    {
        [StructLayout(LayoutKind.Sequential)]
        struct DEVPROPKEY { public Guid fmtid; public uint pid; }
        [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)] static extern int CM_Locate_DevNodeW(out uint devInst, string id, int flags);
        [DllImport("CfgMgr32.dll")] static extern int CM_Get_Parent(out uint parent, uint devInst, int flags);
        [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)] static extern int CM_Get_Device_IDW(uint devInst, char[] buf, int len, int flags);
        [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
        static extern int CM_Get_DevNode_PropertyW(uint devInst, ref DEVPROPKEY key, out uint type, byte[] buf, ref uint size, int flags);

        // DEVPKEY_PciDevice_MaxLinkSpeed: 1 = 2.5 GT/s (Gen1) … 4 = 16 GT/s (Gen4), 5 = 32 GT/s (Gen5)
        static readonly Guid PciFmt = new Guid("3AB22E31-8264-4b4e-9AF5-A8D2D8E33E62");
        const uint MaxLinkSpeed = 11;

        public static int? MaxLinkGen(string deviceId)
        {
            try
            {
                if (string.IsNullOrEmpty(deviceId) || !deviceId.StartsWith("PCI\\", StringComparison.OrdinalIgnoreCase)) return null;
                if (CM_Locate_DevNodeW(out var dev, deviceId, 0) != 0) return null;
                var key = new DEVPROPKEY { fmtid = PciFmt, pid = MaxLinkSpeed };
                var buf = new byte[4]; uint size = 4;
                if (CM_Get_DevNode_PropertyW(dev, ref key, out _, buf, ref size, 0) != 0 || size < 4) return null;
                var gen = BitConverter.ToInt32(buf, 0);
                return gen >= 1 && gen <= 6 ? gen : (int?)null;
            }
            catch { return null; }
        }

        /// <summary>Thiết bị cha (ổ NVMe → bộ điều khiển PCI của nó)</summary>
        public static string Parent(string deviceId)
        {
            try
            {
                if (CM_Locate_DevNodeW(out var dev, deviceId, 0) != 0 || CM_Get_Parent(out var parent, dev, 0) != 0) return null;
                var buf = new char[512];
                return CM_Get_Device_IDW(parent, buf, buf.Length, 0) == 0 ? new string(buf).TrimEnd('\0') : null;
            }
            catch { return null; }
        }
    }
}
