using System.Collections.Generic;
using System.Runtime.Serialization;

namespace PcdexScan
{
    // Dữ liệu thô gửi lên máy chủ — khớp với scanReportSchema ở packages/shared/src/scan.ts.
    // Không có tên máy, tên người dùng, số serial hay tệp nào.

    [DataContract]
    public class ScanReport
    {
        [DataMember(Name = "tool", Order = 1)] public string Tool;
        [DataMember(Name = "os", Order = 2, EmitDefaultValue = false)] public string Os;
        [DataMember(Name = "cpu", Order = 3)] public CpuInfo Cpu;
        [DataMember(Name = "gpus", Order = 4)] public List<GpuInfo> Gpus = new List<GpuInfo>();
        [DataMember(Name = "board", Order = 5)] public BoardInfo Board;
        [DataMember(Name = "ram", Order = 6)] public List<RamInfo> Ram = new List<RamInfo>();
        [DataMember(Name = "disks", Order = 7)] public List<DiskInfo> Disks = new List<DiskInfo>();
        [DataMember(Name = "display", Order = 8, EmitDefaultValue = false)] public DisplayInfo Display;
        /// <summary>Đo hiệu năng Blender (nếu người dùng bấm "Đo hiệu năng")</summary>
        [DataMember(Name = "bench", Order = 9, EmitDefaultValue = false)] public BenchReport Bench;
    }

    [DataContract]
    public class CpuInfo
    {
        [DataMember(Name = "name")] public string Name;
        [DataMember(Name = "cores", EmitDefaultValue = false)] public int? Cores;
        [DataMember(Name = "threads", EmitDefaultValue = false)] public int? Threads;
    }

    [DataContract]
    public class GpuInfo
    {
        [DataMember(Name = "name")] public string Name;
        [DataMember(Name = "vramBytes", EmitDefaultValue = false)] public double? VramBytes;
        [DataMember(Name = "pcieGen", EmitDefaultValue = false)] public int? PcieGen;
    }

    [DataContract]
    public class BoardInfo
    {
        [DataMember(Name = "manufacturer")] public string Manufacturer;
        [DataMember(Name = "product")] public string Product;
    }

    [DataContract]
    public class RamInfo
    {
        [DataMember(Name = "capacityBytes")] public double CapacityBytes;
        [DataMember(Name = "speedMhz", EmitDefaultValue = false)] public int? SpeedMhz;
        [DataMember(Name = "smbiosType", EmitDefaultValue = false)] public int? SmbiosType;
        [DataMember(Name = "formFactor", EmitDefaultValue = false)] public int? FormFactor;
        [DataMember(Name = "manufacturer", EmitDefaultValue = false)] public string Manufacturer;
        [DataMember(Name = "partNumber", EmitDefaultValue = false)] public string PartNumber;
        [DataMember(Name = "dataWidth", EmitDefaultValue = false)] public int? DataWidth;
        [DataMember(Name = "totalWidth", EmitDefaultValue = false)] public int? TotalWidth;
    }

    [DataContract]
    public class DiskInfo
    {
        [DataMember(Name = "model")] public string Model;
        [DataMember(Name = "sizeBytes")] public double SizeBytes;
        [DataMember(Name = "busType", EmitDefaultValue = false)] public int? BusType;
        [DataMember(Name = "mediaType", EmitDefaultValue = false)] public int? MediaType;
        [DataMember(Name = "isBoot", EmitDefaultValue = false)] public bool IsBoot;
        [DataMember(Name = "healthPct", EmitDefaultValue = false)] public int? HealthPct;
        [DataMember(Name = "pcieGen", EmitDefaultValue = false)] public int? PcieGen;
    }

    [DataContract]
    public class DisplayInfo
    {
        [DataMember(Name = "width")] public int Width;
        [DataMember(Name = "height")] public int Height;
    }

    // ---------- phản hồi của máy chủ ----------

    [DataContract]
    public class BenchStart { [DataMember(Name = "nonce")] public string Nonce; }

    [DataContract]
    public class CreateScanReply
    {
        [DataMember(Name = "code")] public string Code;
        [DataMember(Name = "pretty")] public string Pretty;
        [DataMember(Name = "claimUrl")] public string ClaimUrl;
        [DataMember(Name = "expiresAt")] public string ExpiresAt;
        [DataMember(Name = "qr")] public QrMatrix Qr;
        [DataMember(Name = "message")] public string Message;
    }

    [DataContract]
    public class QrMatrix
    {
        [DataMember(Name = "size")] public int Size;
        [DataMember(Name = "bits")] public string Bits;
    }

    [DataContract]
    public class ScanStatus
    {
        [DataMember(Name = "expired", EmitDefaultValue = false)] public bool Expired;
        [DataMember(Name = "claimed")] public ClaimInfo Claimed;
    }

    [DataContract]
    public class ClaimInfo
    {
        [DataMember(Name = "handle")] public string Handle;
        [DataMember(Name = "machineName")] public string MachineName;
    }
}
