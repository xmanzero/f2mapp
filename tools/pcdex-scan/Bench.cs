using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.InteropServices;

namespace PcdexScan
{
    // ---------- dữ liệu gửi lên (khớp benchReportSchema ở packages/shared/src/scan.ts) ----------

    [DataContract]
    public class BenchReport
    {
        [DataMember(Name = "blender", Order = 1)] public string Blender;
        [DataMember(Name = "launcher", Order = 2, EmitDefaultValue = false)] public string Launcher;
        // checksum Blender tự ghi trong kết quả: máy chủ so với bản chính thức (chống số đo bịa / bản sửa)
        [DataMember(Name = "launcherChecksum", Order = 3, EmitDefaultValue = false)] public string LauncherChecksum;
        [DataMember(Name = "script", Order = 4, EmitDefaultValue = false)] public string Script;
        [DataMember(Name = "scriptChecksum", Order = 5, EmitDefaultValue = false)] public string ScriptChecksum;
        [DataMember(Name = "blenderChecksum", Order = 6, EmitDefaultValue = false)] public string BlenderChecksum;
        /// <summary>Mã dùng một lần máy chủ cấp lúc bắt đầu đo (POST /api/v1/bench/start)</summary>
        [DataMember(Name = "nonce", Order = 7, EmitDefaultValue = false)] public string Nonce;
        [DataMember(Name = "cpu", Order = 8, EmitDefaultValue = false)] public BenchDevice Cpu;
        [DataMember(Name = "gpu", Order = 9, EmitDefaultValue = false)] public BenchDevice Gpu;
    }

    [DataContract]
    public class BenchDevice
    {
        [DataMember(Name = "name", Order = 1)] public string Name;
        [DataMember(Name = "type", Order = 2)] public string Type;
        [DataMember(Name = "scenes", Order = 3)] public BenchScenes Scenes;
        [DataMember(Name = "threads", Order = 4, EmitDefaultValue = false)] public int? Threads;
        /// <summary>Kết quả gốc từng cảnh (số mẫu, thời gian) — máy chủ kiểm tra khớp với điểm</summary>
        [DataMember(Name = "runs", Order = 5, EmitDefaultValue = false)] public List<BenchRun> Runs;
        /// <summary>Điểm Blender = tổng samples_per_minute 3 cảnh (giống trang Blender Open Data)</summary>
        public double Score => Scenes == null ? 0 : Scenes.Monster + Scenes.Junkshop + Scenes.Classroom;
    }

    [DataContract]
    public class BenchRun
    {
        [DataMember(Name = "scene", Order = 1)] public string Scene;
        [DataMember(Name = "sceneChecksum", Order = 2, EmitDefaultValue = false)] public string SceneChecksum;
        [DataMember(Name = "samples", Order = 3)] public long Samples;
        [DataMember(Name = "seconds", Order = 4)] public double Seconds;
        [DataMember(Name = "timeLimit", Order = 5, EmitDefaultValue = false)] public double? TimeLimit;
    }

    [DataContract]
    public class BenchScenes
    {
        [DataMember(Name = "monster", Order = 1)] public double Monster;
        [DataMember(Name = "junkshop", Order = 2)] public double Junkshop;
        [DataMember(Name = "classroom", Order = 3)] public double Classroom;
    }

    // ---------- kết quả --json của benchmark-launcher-cli (chỉ lấy trường cần; trình đọc JSON gán qua phản chiếu) ----------
#pragma warning disable CS0649

    [DataContract] class RunEntry
    {
        [DataMember(Name = "scene")] public SceneLabel Scene;
        [DataMember(Name = "blender_version")] public Version Blender;
        [DataMember(Name = "benchmark_launcher")] public SceneLabel Launcher;
        [DataMember(Name = "benchmark_script")] public SceneLabel Script;
        [DataMember(Name = "system_info")] public SysInfo System;
        [DataMember(Name = "device_info")] public DevInfo Device;
        [DataMember(Name = "stats")] public Stats Stats;
    }
    [DataContract] class SceneLabel { [DataMember(Name = "label")] public string Text; [DataMember(Name = "checksum")] public string Checksum; }
    [DataContract] class Version { [DataMember(Name = "version")] public string Text; [DataMember(Name = "checksum")] public string Checksum; }
    [DataContract] class SysInfo { [DataMember(Name = "devices")] public List<Dev> Devices; }
    [DataContract] class DevInfo { [DataMember(Name = "device_type")] public string Type; [DataMember(Name = "compute_devices")] public List<Dev> Devices; [DataMember(Name = "num_cpu_threads")] public int? Threads; }
    [DataContract] class Dev { [DataMember(Name = "type")] public string Type; [DataMember(Name = "name")] public string Name; [DataMember(Name = "is_display")] public bool? IsDisplay; }
    [DataContract] class Stats
    {
        [DataMember(Name = "samples_per_minute")] public double? Spm;
        [DataMember(Name = "number_of_samples")] public long? Samples;
        [DataMember(Name = "time_for_samples")] public double? Seconds;
        [DataMember(Name = "time_limit")] public double? TimeLimit;
    }

#pragma warning restore CS0649

    public class BenchCancelled : Exception { }

    /// <summary>
    /// Đo hiệu năng bằng Blender Benchmark (công cụ chính thức của Blender, tải từ download.blender.org lúc chạy — không đóng gói kèm).
    /// Cách đo giống Blender Open Data: 3 cảnh monster, junkshop, classroom trên Blender 4.5, CPU rồi card (OptiX / HIP / oneAPI).
    /// Lần đầu tải công cụ (~7 MB), Blender 4.5 và 3 cảnh (~500 MB) vào %LOCALAPPDATA%\pcdex-scan\bench; các lần sau dùng lại.
    /// Không gửi gì cho Blender — chỉ kết quả đi kèm bản quét gửi lên pcdex khi người dùng bấm gắn vào tài khoản.
    /// </summary>
    public class Bench
    {
        public const string BlenderVersion = "4.5.0";
        const string LauncherVersion = "3.3.0";
        const string LauncherUrl = "https://download.blender.org/release/BlenderBenchmark2.0/launcher/benchmark-launcher-cli-" + LauncherVersion + "-windows.zip";
        static readonly string[] Scenes = { "monster", "junkshop", "classroom" };
        /// <summary>Thứ tự ưu tiên API card — cùng loại với dữ liệu so sánh trên web</summary>
        static readonly string[] GpuApis = { "OPTIX", "HIP", "ONEAPI" };

        public static string Dir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "pcdex-scan", "bench");
        string Exe => Path.Combine(Dir, "launcher-" + LauncherVersion, "benchmark-launcher-cli.exe");

        /// <summary>Bước đang chạy (chữ hiện cho người dùng) và phần trăm ước lượng 0–100</summary>
        public event Action<string, int> Progress;
        Process current;
        CancellationToken token;

        /// <param name="gpuHint">Tên card chính đọc được khi quét (chọn đúng card khi máy có nhiều thiết bị)</param>
        /// <param name="nonce">mã đo máy chủ cấp (null nếu không xin được — số đo vẫn hiện nhưng chưa được xác minh)</param>
        public async Task<BenchReport> RunAsync(string gpuHint, string nonce, CancellationToken ct)
        {
            token = ct;
            Report(L.T("Đang tải công cụ đo của Blender…", "Downloading the Blender benchmark tool…"), 2);
            await EnsureLauncher();
            Report(L.T("Đang tải Blender 4.5 (lần đầu khoảng 400 MB)…", "Downloading Blender 4.5 (about 400 MB the first time)…"), 6);
            await Run("blender download " + BlenderVersion);
            Report(L.T("Đang tải 3 cảnh thử (lần đầu khoảng 100 MB)…", "Downloading 3 test scenes (about 100 MB the first time)…"), 22);
            await Run($"scenes download --blender-version {BlenderVersion} " + string.Join(" ", Scenes));

            var report = new BenchReport { Blender = BlenderVersion, Launcher = LauncherVersion, Nonce = nonce };
            Report(L.T("Đang đo CPU (3 cảnh, khoảng 2–3 phút)…", "Benchmarking the CPU (3 scenes, about 2–3 minutes)…"), 30);
            var cpuRuns = Parse(await Run($"benchmark --blender-version {BlenderVersion} --device-type CPU --json " + string.Join(" ", Scenes)));
            report.Cpu = Device(cpuRuns, "CPU");
            // checksum do chính Blender ghi (bản công cụ, script đo, bản Blender)
            var first = cpuRuns.FirstOrDefault();
            report.LauncherChecksum = first?.Launcher?.Checksum;
            report.Script = first?.Script?.Text;
            report.ScriptChecksum = first?.Script?.Checksum;
            report.BlenderChecksum = first?.Blender?.Checksum;

            // card: lấy từ danh sách thiết bị Blender thấy được (ghi trong kết quả đo CPU)
            var devices = cpuRuns.SelectMany(r => r.System?.Devices ?? new List<Dev>()).Where(d => d.Type != "CPU" && d.Name != null)
                .GroupBy(d => d.Type + "|" + d.Name).Select(g => g.First()).ToList();
            var gpu = devices.Where(d => GpuApis.Contains(d.Type))
                .OrderBy(d => Array.IndexOf(GpuApis, d.Type))
                .ThenByDescending(d => gpuHint != null && Similar(d.Name, gpuHint))
                .FirstOrDefault();
            if (gpu != null)
            {
                Report(L.T($"Đang đo card {gpu.Name} ({gpu.Type})…", $"Benchmarking {gpu.Name} ({gpu.Type})…"), 65);
                try
                {
                    var scenes = string.Join(" ", Scenes);
                    string outp;
                    try { outp = await Run($"benchmark --blender-version {BlenderVersion} --device-type {gpu.Type} --device-name \"{gpu.Name}\" --json {scenes}"); }
                    catch (BenchCancelled) { throw; }
                    // bản công cụ không nhận --device-name → đo thiết bị mặc định của loại này (Device() vẫn kiểm tra chỉ một thiết bị)
                    catch (Exception) { outp = await Run($"benchmark --blender-version {BlenderVersion} --device-type {gpu.Type} --json {scenes}"); }
                    var gpuRuns = Parse(outp);
                    report.Gpu = Device(gpuRuns, gpu.Type);
                }
                catch (BenchCancelled) { throw; }
                catch (Exception) { /* card không đo được (driver cũ…) — vẫn giữ kết quả CPU */ }
            }
            Report(L.T("Đo xong", "Done"), 100);
            return report;
        }

        public void Cancel() { try { if (current != null && !current.HasExited) KillTree(current.Id); } catch { } }

        void Report(string text, int pct) => Progress?.Invoke(text, pct);

        static bool Similar(string a, string b)
        {
            string F(string s) => new string(s.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray()).Replace("nvidia", "").Replace("geforce", "").Replace("amd", "").Replace("radeon", "");
            var x = F(a); var y = F(b);
            return x.Length > 0 && y.Length > 0 && (x.Contains(y) || y.Contains(x));
        }

        static BenchDevice Device(List<RunEntry> runs, string type)
        {
            var mine = runs.Where(r => r.Device?.Type == type && r.Stats?.Spm > 0 && r.Device.Devices?.Count == 1).ToList();
            double Spm(string scene) => mine.FirstOrDefault(r => r.Scene?.Text == scene)?.Stats?.Spm ?? 0;
            var s = new BenchScenes { Monster = Spm("monster"), Junkshop = Spm("junkshop"), Classroom = Spm("classroom") };
            if (s.Monster <= 0 || s.Junkshop <= 0 || s.Classroom <= 0) throw new Exception(L.T("Không đọc được kết quả đo.", "Couldn’t read the benchmark result."));
            return new BenchDevice
            {
                Name = mine[0].Device.Devices[0].Name, Type = type, Scenes = s,
                Threads = type == "CPU" ? mine[0].Device.Threads : null,
                Runs = mine.Where(r => r.Stats?.Samples > 0 && r.Stats.Seconds > 0).Select(r => new BenchRun
                {
                    Scene = r.Scene?.Text, SceneChecksum = r.Scene?.Checksum, Samples = r.Stats.Samples.Value, Seconds = r.Stats.Seconds.Value, TimeLimit = r.Stats.TimeLimit,
                }).ToList(),
            };
        }

        /// <summary>Kết quả --json: một mảng JSON (lấy từ dấu [ đầu tiên đến ] cuối cùng, bỏ chữ khác nếu có)</summary>
        static List<RunEntry> Parse(string output)
        {
            int a = output.IndexOf('['), b = output.LastIndexOf(']');
            if (a < 0 || b <= a) throw new Exception(L.T("Không đọc được kết quả đo.", "Couldn’t read the benchmark result."));
            using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(output.Substring(a, b - a + 1))))
                return (List<RunEntry>)new DataContractJsonSerializer(typeof(List<RunEntry>)).ReadObject(ms);
        }

        async Task EnsureLauncher()
        {
            if (File.Exists(Exe)) return;
            Directory.CreateDirectory(Dir);
            var zip = Path.Combine(Dir, "launcher.zip");
            using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
            {
                http.DefaultRequestHeaders.UserAgent.ParseAdd("pcdex-scan/" + Program.Version);
                using (var res = await http.GetAsync(LauncherUrl, HttpCompletionOption.ResponseHeadersRead, token))
                {
                    res.EnsureSuccessStatusCode();
                    using (var f = File.Create(zip)) await res.Content.CopyToAsync(f);
                }
            }
            var target = Path.GetDirectoryName(Exe);
            if (Directory.Exists(target)) Directory.Delete(target, true);
            ZipFile.ExtractToDirectory(zip, target);
            File.Delete(zip);
            // bản zip có thể chứa thư mục con: tìm exe rồi đưa lên đúng chỗ
            if (!File.Exists(Exe))
            {
                var found = Directory.GetFiles(target, "benchmark-launcher-cli.exe", SearchOption.AllDirectories).FirstOrDefault()
                    ?? throw new Exception(L.T("Không tìm thấy công cụ đo trong gói tải về.", "The benchmark tool wasn’t found in the download."));
                File.Move(found, Exe);
            }
        }

        /// <summary>Chạy benchmark-launcher-cli, trả stdout. Lỗi → ném ngoại lệ kèm vài dòng cuối của stderr.</summary>
        Task<string> Run(string args)
        {
            token.ThrowIfCancellationRequested();
            return Task.Run(() =>
            {
                var psi = new ProcessStartInfo(Exe, args)
                {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
                    WorkingDirectory = Path.GetDirectoryName(Exe), StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
                };
                var outp = new StringBuilder(); var err = new StringBuilder();
                using (var p = new Process { StartInfo = psi })
                {
                    p.OutputDataReceived += (s, e) => { if (e.Data != null) lock (outp) outp.AppendLine(e.Data); };
                    p.ErrorDataReceived += (s, e) => { if (e.Data != null) lock (err) err.AppendLine(e.Data); };
                    p.Start();
                    current = p;
                    p.BeginOutputReadLine(); p.BeginErrorReadLine();
                    // Windows 11 coi tiến trình không cửa sổ là việc nền (EcoQoS) và đẩy sang nhân E trên CPU lai
                    // (Intel 12–14, Core Ultra) → điểm thấp hơn thật ~25%. Tắt chế độ đó cho công cụ đo và mọi Blender nó mở.
                    var boosted = new HashSet<int>();
                    using (token.Register(Cancel))
                        while (!p.WaitForExit(500)) Boost(p.Id, boosted);
                    p.WaitForExit();
                    current = null;
                    if (token.IsCancellationRequested) throw new BenchCancelled();
                    if (p.ExitCode != 0)
                    {
                        var tail = string.Join(" ", err.ToString().Split('\n').Select(x => x.Trim()).Where(x => x.Length > 0).Reverse().Take(2).Reverse());
                        throw new Exception(L.T("Công cụ đo báo lỗi", "The benchmark tool failed") + $" ({p.ExitCode})" + (tail.Length > 0 ? ": " + tail : "."));
                    }
                    return outp.ToString();
                }
            });
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PowerThrottlingState { public uint Version, ControlMask, StateMask; }
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetProcessInformation(IntPtr process, int infoClass, ref PowerThrottlingState info, int size);
        const int ProcessPowerThrottling = 4;
        const uint ThrottleExecutionSpeed = 0x1, ThrottleIgnoreTimerResolution = 0x4;

        /// <summary>Đưa công cụ đo và các Blender đang chạy về chế độ hiệu năng cao (không EcoQoS), mỗi tiến trình một lần</summary>
        static void Boost(int launcherPid, HashSet<int> done)
        {
            var targets = new List<Process>();
            try { targets.Add(Process.GetProcessById(launcherPid)); } catch { }
            try { targets.AddRange(Process.GetProcessesByName("blender")); } catch { }
            foreach (var t in targets)
            {
                try
                {
                    if (done.Contains(t.Id) || t.HasExited) continue;
                    // ControlMask = loại điều tiết mình quản lý, StateMask = 0 → tắt điều tiết (luôn chạy hết tốc)
                    var st = new PowerThrottlingState { Version = 1, ControlMask = ThrottleExecutionSpeed | ThrottleIgnoreTimerResolution, StateMask = 0 };
                    SetProcessInformation(t.Handle, ProcessPowerThrottling, ref st, Marshal.SizeOf(st));
                    done.Add(t.Id);
                }
                catch { /* Windows 10 cũ không có tùy chọn này — bỏ qua */ }
                finally { t.Dispose(); }
            }
        }

        static void KillTree(int pid)
        {
            // dừng cả Blender do công cụ đo mở ra
            try { Process.Start(new ProcessStartInfo("taskkill", $"/PID {pid} /T /F") { CreateNoWindow = true, UseShellExecute = false })?.WaitForExit(5000); } catch { }
        }
    }
}
