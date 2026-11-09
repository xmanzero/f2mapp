using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PcdexScan
{
    /// <summary>
    /// Cửa sổ chính: quét xong hiện cấu hình ngay (không cần tài khoản).
    /// "Gắn vào tài khoản" gửi dữ liệu phần cứng lên pcdex, nhận mã + QR; người dùng mở mã trên web hoặc điện thoại để chọn máy.
    /// Theo bản sắc pcdex (docs/design.md): nền đen phẳng, chữ trắng, lime cho dữ liệu và nút chính; không bóng, không gradient.
    /// </summary>
    public class MainForm : Form
    {
        static readonly Color Ground = Color.FromArgb(0x08, 0x0f, 0x24);
        static readonly Color Surface = Color.FromArgb(0x0f, 0x18, 0x30);
        static readonly Color Raised = Color.FromArgb(0x18, 0x23, 0x3f);
        static readonly Color Ink = Color.White;
        static readonly Color Muted = Color.FromArgb(0xb3, 0xbc, 0xd3);
        static readonly Color Faint = Color.FromArgb(0x8f, 0x99, 0xb3);
        // màu theo PCDEX Brand Kit: Tech Blue là màu dữ liệu, nút chính Electric Blue
        static readonly Color Lime = Color.FromArgb(0x00, 0xa6, 0xff);
        static readonly Color Cta = Color.FromArgb(0x17, 0x69, 0xff);
        static readonly Color Warn = Color.FromArgb(0xe5, 0xa9, 0x3b);
        const string FontName = "Segoe UI";

        readonly Api api;
        ScanReport report;
        CreateScanReply sent;
        readonly Timer poll = new Timer { Interval = 3000 };

        readonly TableLayoutPanel specTable = new TableLayoutPanel();
        readonly Label status = new Label();
        readonly Button sendBtn, rescanBtn, openBtn, exportBtn, benchBtn;
        readonly Label benchStatus = new Label();
        System.Threading.CancellationTokenSource benchCts;
        /// <summary>Các dòng cấu hình đang hiện (dùng lại khi xuất ảnh / PDF)</summary>
        List<KeyValuePair<string, List<string>>> rows = new List<KeyValuePair<string, List<string>>>();
        readonly Panel side = new Panel();
        readonly Label sideTitle = new Label(), sideText = new Label(), codeLabel = new Label(), expiryLabel = new Label(), claimedLabel = new Label();
        readonly QrBox qr = new QrBox();
        /// <summary>Người dùng bấm đổi ngôn ngữ: Program mở lại cửa sổ với ngôn ngữ mới, giữ kết quả quét</summary>
        public bool SwitchLang { get; private set; }
        public ScanReport Report => report;
        static string SideIntro => L.T("Gắn kết quả quét vào tài khoản pcdex để cập nhật máy đã khai hoặc tạo máy mới. Linh kiện đọc được từ máy có nhãn “Xác thực đang dùng” trên bảng xếp hạng và chợ.", "Link this scan to your pcdex account to update a machine you already added or create a new one. Parts read from this PC get the “Verified in use” label on the leaderboard and market.");

        public MainForm(Api api, ScanReport existing = null)
        {
            this.api = api;
            report = existing;
            Text = L.T("pcdex — Quét cấu hình máy", "pcdex — PC hardware scan");
            AutoScaleMode = AutoScaleMode.Dpi;
            AutoScaleDimensions = new SizeF(96F, 96F);
            ClientSize = new Size(940, 710);
            MinimumSize = new Size(820, 690);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Ground; ForeColor = Ink;
            Font = new Font(FontName, 10F);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            // ---------- đầu trang ----------
            var head = new Panel { Dock = DockStyle.Top, Height = 64, BackColor = Ground, Padding = new Padding(24, 16, 24, 0) };
            // symbol P (brand kit) lấy từ icon của exe
            var logo = new PictureBox { Size = new Size(32, 32), Location = new Point(24, 16), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Ground };
            try { if (Icon != null) logo.Image = new Icon(Icon, new Size(64, 64)).ToBitmap(); } catch { }
            var brand = new Label { Text = "pcdex", Font = new Font(FontName, 18F, FontStyle.Bold), ForeColor = Ink, AutoSize = true, Location = new Point(62, 14) };
            var sub = new Label { Text = L.T("Quét cấu hình máy", "Hardware scan"), Font = new Font(FontName, 11F), ForeColor = Muted, AutoSize = true, Location = new Point(80, 23) };
            var ver = new Label { Text = L.T("phiên bản ", "version ") + Program.Version, ForeColor = Faint, AutoSize = true, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            // đổi ngôn ngữ: tên ngôn ngữ kia, viết bằng chính ngôn ngữ đó
            var langBtn = new LinkLabel { Text = L.En ? "Tiếng Việt" : "English", AutoSize = true, LinkColor = Lime, ActiveLinkColor = Ink, LinkBehavior = LinkBehavior.HoverUnderline, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            // không nhận tiêu điểm: cửa sổ mới mở mà người dùng đang gõ phím (Space / Enter) thì không bị đổi ngôn ngữ nhầm
            langBtn.TabStop = false;
            langBtn.LinkClicked += (s, e) => { if (e.Button == MouseButtons.Left) { SwitchLang = true; Close(); } };
            head.Controls.AddRange(new Control[] { logo, brand, sub, ver, langBtn });
            head.Resize += (s, e) => { langBtn.Location = new Point(head.ClientSize.Width - langBtn.Width - 24, 26); ver.Location = new Point(langBtn.Left - ver.Width - 16, 26); };
            head.Layout += (s, e) => sub.Location = new Point(brand.Right + 8, sub.Top);

            // ---------- cột phải: gắn vào tài khoản ----------
            side.Dock = DockStyle.Right; side.Width = 340; side.BackColor = Surface; side.Padding = new Padding(24);
            sideTitle.Text = L.T("Gắn vào tài khoản", "Link to your account"); sideTitle.Font = new Font(FontName, 13F, FontStyle.Bold); sideTitle.AutoSize = true;
            sideText.ForeColor = Muted; sideText.AutoSize = true; sideText.MaximumSize = new Size(280, 0);
            sideText.Text = SideIntro;
            qr.Size = new Size(200, 200); qr.Visible = false;
            codeLabel.Font = new Font(FontName, 22F, FontStyle.Bold); codeLabel.ForeColor = Lime; codeLabel.AutoSize = true; codeLabel.Visible = false;
            expiryLabel.ForeColor = Faint; expiryLabel.AutoSize = true; expiryLabel.MaximumSize = new Size(280, 0); expiryLabel.Visible = false;
            claimedLabel.ForeColor = Lime; claimedLabel.Font = new Font(FontName, 11F, FontStyle.Bold); claimedLabel.AutoSize = true; claimedLabel.MaximumSize = new Size(280, 0); claimedLabel.Visible = false;
            openBtn = MakeButton(L.T("Mở trên trình duyệt máy này", "Open in this PC’s browser"), false); openBtn.Visible = false; openBtn.Width = 280;
            openBtn.Click += (s, e) => { if (sent != null) Open(sent.ClaimUrl); };
            var sideFlow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, BackColor = Surface, AutoScroll = false };
            sideFlow.Controls.AddRange(new Control[] { sideTitle, Gap(8), sideText, Gap(16), qr, Gap(12), codeLabel, Gap(4), expiryLabel, Gap(16), openBtn, Gap(12), claimedLabel });
            side.Controls.Add(sideFlow);

            // ---------- cột trái: cấu hình ----------
            var main = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 8, 24, 24), BackColor = Ground };
            var h = new Label { Text = L.T("Cấu hình máy này", "This PC’s configuration"), Font = new Font(FontName, 13F, FontStyle.Bold), AutoSize = true, Dock = DockStyle.Top };
            status.ForeColor = Muted; status.AutoSize = true; status.Dock = DockStyle.Top; status.Padding = new Padding(0, 6, 0, 10); status.Text = L.T("Đang đọc cấu hình…", "Reading hardware…");
            specTable.Dock = DockStyle.Top; specTable.AutoSize = true; specTable.ColumnCount = 2; specTable.BackColor = Ground;
            specTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, L.En ? 120 : 110));
            specTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 180, FlowDirection = FlowDirection.LeftToRight, BackColor = Ground, Padding = new Padding(0, 12, 0, 0) };
            sendBtn = MakeButton(SendLabel, true); sendBtn.Width = 220; sendBtn.Enabled = false;
            rescanBtn = MakeButton(L.T("Quét lại", "Scan again"), false); rescanBtn.Width = L.En ? 120 : 110; rescanBtn.Enabled = false;
            exportBtn = MakeButton(L.T("Xuất ảnh / PDF", "Save image / PDF"), false); exportBtn.Width = L.En ? 170 : 150; exportBtn.Enabled = false;
            exportBtn.Click += (s, e) => ExportSheet();
            benchBtn = MakeButton(BenchLabel, false); benchBtn.Width = L.En ? 130 : 140; benchBtn.Enabled = false; benchBtn.Margin = new Padding(0, 10, 12, 0);
            benchBtn.Click += async (s, e) => await RunBench();
            benchStatus.ForeColor = Muted; benchStatus.AutoSize = true; benchStatus.MaximumSize = new Size(380, 0); benchStatus.Margin = new Padding(0, 16, 0, 0);
            benchStatus.Text = L.T("Đo sức mạnh thật bằng Blender Benchmark, so với trung bình của cùng mẫu CPU / card.", "Measure real performance with Blender Benchmark against the average of the same CPU / card.");
            sendBtn.Click += async (s, e) => await Send();
            rescanBtn.Click += async (s, e) => await RunScan();
            var privacy = new Label
            {
                Text = L.T("Chỉ gửi thông tin phần cứng ở trên. Không gửi tên máy, tên người dùng, số serial hay tệp nào.", "Only the hardware details above are sent. No computer name, user name, serial numbers or files."),
                ForeColor = Faint, AutoSize = true, MaximumSize = new Size(520, 0), Margin = new Padding(0, 10, 0, 0),
            };
            actions.Controls.AddRange(new Control[] { sendBtn, rescanBtn, exportBtn, benchBtn, benchStatus });
            actions.SetFlowBreak(exportBtn, true);
            actions.SetFlowBreak(benchStatus, true);
            actions.Controls.Add(privacy);

            main.Controls.Add(specTable);
            main.Controls.Add(status);
            main.Controls.Add(h);
            main.Controls.Add(actions);

            Controls.Add(main);
            Controls.Add(side);
            Controls.Add(head);

            poll.Tick += async (s, e) => await Poll();
            Shown += async (s, e) => { if (report == null) await RunScan(); else { ShowSpec(report); status.Text = ScannedNote(); sendBtn.Enabled = rescanBtn.Enabled = exportBtn.Enabled = benchBtn.Enabled = true; } };
            FormClosed += (s, e) => { poll.Stop(); benchCts?.Cancel(); };
        }

        // ---------- quét ----------
        async Task RunScan()
        {
            sendBtn.Enabled = rescanBtn.Enabled = exportBtn.Enabled = benchBtn.Enabled = false;
            ResetSide();
            status.ForeColor = Muted;
            status.Text = L.T("Đang đọc cấu hình…", "Reading hardware…");
            report = await Task.Run(() => Scanner.Scan("pcdex-scan/" + Program.Version));
            ShowSpec(report);
            status.Text = ScannedNote();
            sendBtn.Enabled = rescanBtn.Enabled = exportBtn.Enabled = benchBtn.Enabled = true;
        }

        static string BenchLabel => L.T("Đo hiệu năng", "Benchmark");
        static string SendLabel => L.T("Gắn vào tài khoản pcdex", "Link to pcdex account");
        static string ScannedNote() => L.T($"Đọc lúc {DateTime.Now:HH:mm}. Nguồn (PSU) không đọc được bằng phần mềm — khai trên web.", $"Read at {DateTime.Now:HH:mm}. The power supply can’t be detected by software — add it on the web.");

        void ShowSpec(ScanReport r)
        {
            specTable.SuspendLayout();
            specTable.Controls.Clear();
            specTable.RowStyles.Clear();
            specTable.RowCount = 0;
            rows = SpecRows(r);
            foreach (var row in rows) Row(row.Key, row.Value, row.Key == PsuKey ? Faint : (Color?)null);
            specTable.ResumeLayout();

            void Row(string k, List<string> vs, Color? color = null)
            {
                var key = new Label { Text = k, ForeColor = Muted, AutoSize = true, Margin = new Padding(0, 8, 8, 8) };
                var val = new Label
                {
                    Text = vs.Count > 0 ? string.Join(Environment.NewLine, vs) : Unreadable,
                    ForeColor = vs.Count > 0 ? (color ?? Ink) : Warn, AutoSize = true, MaximumSize = new Size(440, 0),
                    Margin = new Padding(0, 8, 0, 8), Font = new Font(FontName, 10.5F, vs.Count > 0 ? FontStyle.Bold : FontStyle.Regular),
                };
                specTable.RowCount++;
                specTable.Controls.Add(key, 0, specTable.RowCount - 1);
                specTable.Controls.Add(val, 1, specTable.RowCount - 1);
            }
        }

        public static string PsuKey => L.T("Nguồn", "Power supply");
        public static string Unreadable => L.T("Không đọc được", "Not detected");

        /// <summary>Các dòng cấu hình từ kết quả quét (dùng cho bảng trong cửa sổ và phiếu xuất ảnh / PDF)</summary>
        public static List<KeyValuePair<string, List<string>>> SpecRows(ScanReport r)
        {
            var list = new List<KeyValuePair<string, List<string>>>();
            void Row(string k, IEnumerable<string> values) =>
                list.Add(new KeyValuePair<string, List<string>>(k, values.Where(v => !string.IsNullOrWhiteSpace(v)).ToList()));
            Row("CPU", new[] { r.Cpu?.Name + (r.Cpu?.Cores > 0 ? L.T($"  ·  {r.Cpu.Cores} nhân / {r.Cpu.Threads} luồng", $"  ·  {r.Cpu.Cores} cores / {r.Cpu.Threads} threads") : "") });
            Row(L.T("Card đồ họa", "Graphics card"), r.Gpus.OrderByDescending(g => g.VramBytes ?? 0).Select(g => g.Name + (g.VramBytes > 0 ? $"  ·  {Gb(g.VramBytes.Value, 1024)} GB" : "") + (g.PcieGen > 0 ? $"  ·  PCIe {g.PcieGen}.0" : "")));
            Row("Mainboard", new[] { $"{Brand(r.Board?.Manufacturer)} {r.Board?.Product}".Trim() });
            Row("RAM", RamLines(r.Ram));
            Row(L.T("Ổ cứng", "Storage"), r.Disks.Where(d => d.BusType != 7 && d.SizeBytes > 16e9).Select(DiskLine));
            Row(L.T("Màn hình", "Display"), new[] { r.Display != null ? $"{r.Display.Width} × {r.Display.Height}" : null });
            if (r.Bench != null)
                Row(L.T("Hiệu năng", "Performance"), new[] { r.Bench.Cpu, r.Bench.Gpu }.Where(d => d != null)
                    .Select(d => (d.Type == "CPU" ? "CPU" : $"{d.Name} ({d.Type})") + L.T($"  ·  {d.Score:0} điểm Blender {r.Bench.Blender}", $"  ·  {d.Score:0} Blender {r.Bench.Blender} points")));
            Row(PsuKey, new[] { L.T("Không đọc được — khai trên web", "Not detected — add it on the web") });
            return list;
        }

        /// <summary>Tên hãng gọn như trên web (ASUSTeK COMPUTER INC. → ASUS)</summary>
        static string Brand(string m)
        {
            if (string.IsNullOrEmpty(m)) return "";
            var u = m.ToUpperInvariant();
            if (u.StartsWith("ASUS")) return "ASUS";
            if (u.StartsWith("MICRO-STAR") || u.StartsWith("MSI")) return "MSI";
            if (u.Contains("GIGABYTE")) return "Gigabyte";
            if (u.Contains("ASROCK")) return "ASRock";
            if (u.Contains("BIOSTAR")) return "Biostar";
            if (u.StartsWith("TO BE FILLED") || u.StartsWith("DEFAULT")) return "";
            return m;
        }

        static IEnumerable<string> RamLines(List<RamInfo> ram)
        {
            var type = new Dictionary<int, string> { { 24, "DDR3" }, { 26, "DDR4" }, { 34, "DDR5" } };
            var groups = ram.GroupBy(m => new { gb = Gb(m.CapacityBytes, 1024), t = m.SmbiosType ?? 0, s = m.SpeedMhz ?? 0, p = m.PartNumber ?? "" });
            foreach (var g in groups)
            {
                var n = g.Count();
                var t = type.TryGetValue(g.Key.t, out var tt) ? " " + tt : "";
                var s = g.Key.s > 0 ? $" {g.Key.s} MHz" : "";
                var p = g.Key.p != "" ? $"  ·  {g.Key.p}" : "";
                yield return (n > 1 ? $"{n} × {g.Key.gb} GB" : $"{g.Key.gb} GB") + t + s + p;
            }
            var total = ram.Sum(m => m.CapacityBytes);
            if (ram.Count > 1) yield return L.T("Tổng ", "Total ") + $"{Gb(total, 1024)} GB";
        }

        static string DiskLine(DiskInfo d)
        {
            var kind = d.BusType == 17 ? "NVMe" + (d.PcieGen > 0 ? $" Gen{d.PcieGen}" : "") : d.MediaType == 3 ? "HDD" : "SSD SATA";
            var gb = Math.Round(d.SizeBytes / 1e9);
            var size = gb >= 1000 ? $"{Math.Round(gb / 1000.0, 1)} TB" : $"{gb} GB";
            return $"{d.Model}  ·  {size}  ·  {kind}" + (d.IsBoot ? L.T("  ·  ổ Windows", "  ·  Windows drive") : "") + (d.HealthPct != null ? L.T("  ·  sức khỏe ", "  ·  health ") + $"{d.HealthPct}%" : "");
        }
        static long Gb(double bytes, int unit) => (long)Math.Round(bytes / unit / unit / unit);

        // ---------- xuất ảnh / PDF ----------
        void ExportSheet()
        {
            if (report == null) return;
            using (var dlg = new SaveFileDialog
            {
                Title = L.T("Xuất cấu hình", "Save configuration"),
                Filter = L.T("Ảnh PNG (*.png)|*.png|PDF khổ A4 (*.pdf)|*.pdf", "PNG image (*.png)|*.png|A4 PDF (*.pdf)|*.pdf"),
                FileName = $"pcdex-scan-{DateTime.Now:yyyy-MM-dd}",
                AddExtension = true,
            })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    Image logo = null;
                    try { if (Icon != null) logo = new Icon(Icon, new Size(256, 256)).ToBitmap(); } catch { }
                    using (var bmp = SheetExport.Render(rows, report.Os, DateTime.Now, logo)) SheetExport.Save(bmp, dlg.FileName);
                    status.ForeColor = Muted;
                    status.Text = L.T("Đã lưu ", "Saved ") + System.IO.Path.GetFileName(dlg.FileName);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, L.T("Chưa xuất được", "Couldn’t save"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        // ---------- đo hiệu năng ----------
        async Task RunBench()
        {
            if (benchCts != null) { benchCts.Cancel(); return; }
            if (report == null) return;
            if (MessageBox.Show(this, L.T("Phần mềm sẽ tải công cụ đo chính thức của Blender (lần đầu khoảng 500 MB, lưu ở %LOCALAPPDATA%\\pcdex-scan\\bench) rồi render 3 cảnh thử trên CPU và card đồ họa, mất khoảng 5–10 phút.\n\nMáy chạy hết công suất trong lúc đo: laptop nên cắm sạc, đóng các ứng dụng nặng và không dùng máy cho đến khi đo xong để kết quả chính xác.\n\nBắt đầu đo?", "pcdex-scan will download the official Blender benchmark tool (about 500 MB the first time, stored in %LOCALAPPDATA%\\pcdex-scan\\bench) and render 3 test scenes on the CPU and graphics card. It takes about 5–10 minutes.\n\nYour PC runs at full load while measuring: plug in laptops, close heavy apps and leave the PC alone until it finishes for an accurate result.\n\nStart the benchmark?"), BenchLabel, MessageBoxButtons.OKCancel, MessageBoxIcon.Information) != DialogResult.OK) return;
            benchCts = new System.Threading.CancellationTokenSource();
            var bench = new Bench();
            bench.Progress += (text, pct) =>
            {
                void Set() { benchStatus.ForeColor = Ink; benchStatus.Text = $"{text}  {pct}%"; }
                if (InvokeRequired) BeginInvoke((Action)Set); else Set();
            };
            benchBtn.Text = L.T("Dừng đo", "Stop");
            sendBtn.Enabled = rescanBtn.Enabled = false;
            try
            {
                var gpuHint = report.Gpus.OrderByDescending(g => g.VramBytes ?? 0).FirstOrDefault()?.Name;
                report.Bench = await bench.RunAsync(gpuHint, benchCts.Token);
                ShowSpec(report);
                ResetSide(); // mã đã gửi (nếu có) chưa kèm số đo → gửi lại
                benchStatus.ForeColor = Lime;
                benchStatus.Text = L.T("Đo xong. Gắn vào tài khoản để xem so sánh với trung bình của cùng mẫu CPU / card.", "Done. Link to your account to compare with the average of the same CPU / card.");
            }
            catch (BenchCancelled) { benchStatus.ForeColor = Muted; benchStatus.Text = L.T("Đã dừng đo.", "Benchmark stopped."); }
            catch (Exception ex) { benchStatus.ForeColor = Warn; benchStatus.Text = L.T("Chưa đo được: ", "Benchmark failed: ") + ex.Message; }
            finally
            {
                benchCts = null;
                benchBtn.Text = BenchLabel;
                sendBtn.Enabled = rescanBtn.Enabled = true;
            }
        }

        // ---------- gửi & theo dõi ----------
        async Task Send()
        {
            if (report == null) return;
            sendBtn.Enabled = false;
            sendBtn.Text = L.T("Đang gửi…", "Sending…");
            try
            {
                sent = await api.SendAsync(report);
                qr.Set(sent.Qr);
                qr.Visible = true;
                sideTitle.Text = L.T("Quét mã bằng điện thoại", "Scan the code with your phone");
                sideText.Text = L.T("Hoặc mở trang dưới đây và nhập mã:", "Or open this page and enter the code:") + Environment.NewLine + Host(api.Server) + (L.En ? "/en/quet" : "/quet");
                codeLabel.Text = sent.Pretty; codeLabel.Visible = true;
                var exp = DateTime.TryParse(sent.ExpiresAt, out var t) ? t.ToLocalTime().ToString("HH:mm") : L.T("30 phút nữa", "30 minutes from now");
                expiryLabel.Text = L.T($"Mã dùng được đến {exp}. Sau khi đăng nhập, chọn cập nhật máy đã có hoặc tạo máy mới.", $"The code works until {exp}. After signing in, choose to update a machine you have or create a new one."); expiryLabel.Visible = true;
                openBtn.Visible = true;
                claimedLabel.Visible = false;
                sendBtn.Text = L.T("Đã gửi", "Sent");
                poll.Start();
            }
            catch (ApiException ex)
            {
                MessageBox.Show(this, ex.Message, L.T("Chưa gửi được", "Couldn’t send"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                sendBtn.Text = SendLabel;
                sendBtn.Enabled = true;
            }
        }

        async Task Poll()
        {
            if (sent == null) { poll.Stop(); return; }
            ScanStatus st;
            try { st = await api.StatusAsync(sent.Code); } catch { return; }
            if (st == null) return;
            if (st.Claimed != null)
            {
                poll.Stop();
                claimedLabel.Text = L.En
                    ? $"Linked to {st.Claimed.MachineName ?? "your machine"}" + (st.Claimed.Handle != null ? $" of @{st.Claimed.Handle}" : "") + ". You can close the app."
                    : $"Đã gắn vào {st.Claimed.MachineName ?? "máy"}" + (st.Claimed.Handle != null ? $" của @{st.Claimed.Handle}" : "") + ". Có thể đóng phần mềm.";
                claimedLabel.ForeColor = Lime; claimedLabel.Visible = true;
                qr.Visible = false; openBtn.Visible = false; expiryLabel.Visible = false; codeLabel.Visible = false;
                sideTitle.Text = L.T("Xong", "Done");
                sideText.Text = L.T("Xem điểm, hạng và gợi ý nâng cấp ở trang Máy của tôi.", "See the score, tier and upgrade tips on the My PC page.");
            }
            else if (st.Expired)
            {
                poll.Stop();
                claimedLabel.Text = L.T("Mã đã hết hạn. Bấm “Quét lại” rồi gửi lại để lấy mã mới.", "The code has expired. Click “Scan again” and send it again for a new code.");
                claimedLabel.ForeColor = Warn; claimedLabel.Visible = true;
                qr.Visible = false; openBtn.Visible = false;
            }
        }

        void ResetSide()
        {
            poll.Stop();
            sent = null;
            sideTitle.Text = L.T("Gắn vào tài khoản", "Link to your account");
            sideText.Text = SideIntro;
            qr.Visible = codeLabel.Visible = expiryLabel.Visible = openBtn.Visible = claimedLabel.Visible = false;
            sendBtn.Text = SendLabel;
        }

        // ---------- tiện ích giao diện ----------
        static Button MakeButton(string text, bool primary)
        {
            var b = new Button
            {
                Text = text, Height = 44, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, UseVisualStyleBackColor = false,
                BackColor = primary ? Cta : Raised, ForeColor = primary ? Color.White : Ink,
                Font = new Font(FontName, 10.5F, FontStyle.Bold), Margin = new Padding(0, 0, 10, 0),
            };
            b.FlatAppearance.BorderSize = 0;
            b.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(0x2b, 0x78, 0xff) : Color.FromArgb(0x24, 0x31, 0x55);
            b.FlatAppearance.MouseDownBackColor = primary ? Color.FromArgb(0x13, 0x5d, 0xe6) : Color.FromArgb(0x12, 0x1b, 0x33);
            b.EnabledChanged += (s, e) => { b.BackColor = b.Enabled ? (primary ? Cta : Raised) : Raised; b.ForeColor = b.Enabled ? (primary ? Color.White : Ink) : Faint; };
            return b;
        }
        static Control Gap(int h) => new Panel { Height = h, Width = 1, Margin = Padding.Empty };
        static string Host(string url) { try { return new Uri(url).Authority; } catch { return url; } }
        void Open(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { Clipboard.SetText(url); MessageBox.Show(this, L.T("Không mở được trình duyệt. Đã chép đường dẫn, dán vào trình duyệt:\n", "Couldn’t open the browser. The link is copied — paste it into your browser:\n") + url, "pcdex"); }
        }
    }

    /// <summary>Vẽ mã QR từ ma trận máy chủ gửi (ô vuông nét, có lề trắng 4 ô theo chuẩn)</summary>
    class QrBox : Control
    {
        QrMatrix m;
        public QrBox() { DoubleBuffered = true; BackColor = Color.White; Margin = Padding.Empty; }
        public void Set(QrMatrix matrix) { m = matrix; Invalidate(); }
        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(Color.White);
            if (m == null || m.Size <= 0 || m.Bits == null) return;
            int n = m.Size, cell = Math.Max(1, Math.Min(Width, Height) / (n + 8));
            int off = (Math.Min(Width, Height) - cell * n) / 2;
            using (var b = new SolidBrush(Color.Black))
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                        if (m.Bits[y * n + x] == '1') e.Graphics.FillRectangle(b, off + x * cell, off + y * cell, cell, cell);
        }
    }
}
