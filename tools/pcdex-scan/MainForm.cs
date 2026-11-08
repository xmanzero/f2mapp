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
        readonly Button sendBtn, rescanBtn, openBtn;
        readonly Panel side = new Panel();
        readonly Label sideTitle = new Label(), sideText = new Label(), codeLabel = new Label(), expiryLabel = new Label(), claimedLabel = new Label();
        readonly QrBox qr = new QrBox();

        public MainForm(Api api)
        {
            this.api = api;
            Text = "pcdex — Quét cấu hình máy";
            AutoScaleMode = AutoScaleMode.Dpi;
            AutoScaleDimensions = new SizeF(96F, 96F);
            ClientSize = new Size(940, 660);
            MinimumSize = new Size(820, 640);
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
            var sub = new Label { Text = "Quét cấu hình máy", Font = new Font(FontName, 11F), ForeColor = Muted, AutoSize = true, Location = new Point(80, 23) };
            var ver = new Label { Text = "phiên bản " + Program.Version, ForeColor = Faint, AutoSize = true, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            head.Controls.AddRange(new Control[] { logo, brand, sub, ver });
            head.Resize += (s, e) => ver.Location = new Point(head.ClientSize.Width - ver.Width - 24, 26);
            head.Layout += (s, e) => sub.Location = new Point(brand.Right + 8, sub.Top);

            // ---------- cột phải: gắn vào tài khoản ----------
            side.Dock = DockStyle.Right; side.Width = 340; side.BackColor = Surface; side.Padding = new Padding(24);
            sideTitle.Text = "Gắn vào tài khoản"; sideTitle.Font = new Font(FontName, 13F, FontStyle.Bold); sideTitle.AutoSize = true;
            sideText.ForeColor = Muted; sideText.AutoSize = true; sideText.MaximumSize = new Size(280, 0);
            sideText.Text = "Gắn kết quả quét vào tài khoản pcdex để cập nhật máy đã khai hoặc tạo máy mới. Linh kiện đọc được từ máy có nhãn “Xác thực đang dùng” trên bảng xếp hạng và chợ.";
            qr.Size = new Size(200, 200); qr.Visible = false;
            codeLabel.Font = new Font(FontName, 22F, FontStyle.Bold); codeLabel.ForeColor = Lime; codeLabel.AutoSize = true; codeLabel.Visible = false;
            expiryLabel.ForeColor = Faint; expiryLabel.AutoSize = true; expiryLabel.MaximumSize = new Size(280, 0); expiryLabel.Visible = false;
            claimedLabel.ForeColor = Lime; claimedLabel.Font = new Font(FontName, 11F, FontStyle.Bold); claimedLabel.AutoSize = true; claimedLabel.MaximumSize = new Size(280, 0); claimedLabel.Visible = false;
            openBtn = MakeButton("Mở trên trình duyệt máy này", false); openBtn.Visible = false; openBtn.Width = 280;
            openBtn.Click += (s, e) => { if (sent != null) Open(sent.ClaimUrl); };
            var sideFlow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, BackColor = Surface, AutoScroll = false };
            sideFlow.Controls.AddRange(new Control[] { sideTitle, Gap(8), sideText, Gap(16), qr, Gap(12), codeLabel, Gap(4), expiryLabel, Gap(16), openBtn, Gap(12), claimedLabel });
            side.Controls.Add(sideFlow);

            // ---------- cột trái: cấu hình ----------
            var main = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 8, 24, 24), BackColor = Ground };
            var h = new Label { Text = "Cấu hình máy này", Font = new Font(FontName, 13F, FontStyle.Bold), AutoSize = true, Dock = DockStyle.Top };
            status.ForeColor = Muted; status.AutoSize = true; status.Dock = DockStyle.Top; status.Padding = new Padding(0, 6, 0, 10); status.Text = "Đang đọc cấu hình…";
            specTable.Dock = DockStyle.Top; specTable.AutoSize = true; specTable.ColumnCount = 2; specTable.BackColor = Ground;
            specTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
            specTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 124, FlowDirection = FlowDirection.LeftToRight, BackColor = Ground, Padding = new Padding(0, 12, 0, 0) };
            sendBtn = MakeButton("Gắn vào tài khoản pcdex", true); sendBtn.Width = 220; sendBtn.Enabled = false;
            rescanBtn = MakeButton("Quét lại", false); rescanBtn.Width = 110; rescanBtn.Enabled = false;
            sendBtn.Click += async (s, e) => await Send();
            rescanBtn.Click += async (s, e) => await RunScan();
            var privacy = new Label
            {
                Text = "Chỉ gửi thông tin phần cứng ở trên. Không gửi tên máy, tên người dùng, số serial hay tệp nào.",
                ForeColor = Faint, AutoSize = true, MaximumSize = new Size(520, 0), Margin = new Padding(0, 10, 0, 0),
            };
            actions.Controls.AddRange(new Control[] { sendBtn, rescanBtn });
            actions.SetFlowBreak(rescanBtn, true);
            actions.Controls.Add(privacy);

            main.Controls.Add(specTable);
            main.Controls.Add(status);
            main.Controls.Add(h);
            main.Controls.Add(actions);

            Controls.Add(main);
            Controls.Add(side);
            Controls.Add(head);

            poll.Tick += async (s, e) => await Poll();
            Shown += async (s, e) => await RunScan();
            FormClosed += (s, e) => poll.Stop();
        }

        // ---------- quét ----------
        async Task RunScan()
        {
            sendBtn.Enabled = rescanBtn.Enabled = false;
            ResetSide();
            status.ForeColor = Muted;
            status.Text = "Đang đọc cấu hình…";
            report = await Task.Run(() => Scanner.Scan("pcdex-scan/" + Program.Version));
            ShowSpec(report);
            status.Text = $"Đọc lúc {DateTime.Now:HH:mm}. Nguồn (PSU) không đọc được bằng phần mềm — khai trên web.";
            sendBtn.Enabled = rescanBtn.Enabled = true;
        }

        void ShowSpec(ScanReport r)
        {
            specTable.SuspendLayout();
            specTable.Controls.Clear();
            specTable.RowStyles.Clear();
            specTable.RowCount = 0;
            void Row(string k, IEnumerable<string> values, Color? color = null)
            {
                var vs = values.Where(v => !string.IsNullOrWhiteSpace(v)).ToList();
                var key = new Label { Text = k, ForeColor = Muted, AutoSize = true, Margin = new Padding(0, 8, 8, 8) };
                var val = new Label
                {
                    Text = vs.Count > 0 ? string.Join(Environment.NewLine, vs) : "Không đọc được",
                    ForeColor = vs.Count > 0 ? (color ?? Ink) : Warn, AutoSize = true, MaximumSize = new Size(440, 0),
                    Margin = new Padding(0, 8, 0, 8), Font = new Font(FontName, 10.5F, vs.Count > 0 ? FontStyle.Bold : FontStyle.Regular),
                };
                specTable.RowCount++;
                specTable.Controls.Add(key, 0, specTable.RowCount - 1);
                specTable.Controls.Add(val, 1, specTable.RowCount - 1);
            }
            Row("CPU", new[] { r.Cpu?.Name + (r.Cpu?.Cores > 0 ? $"  ·  {r.Cpu.Cores} nhân / {r.Cpu.Threads} luồng" : "") });
            Row("Card đồ họa", r.Gpus.OrderByDescending(g => g.VramBytes ?? 0).Select(g => g.Name + (g.VramBytes > 0 ? $"  ·  {Gb(g.VramBytes.Value, 1024)} GB" : "") + (g.PcieGen > 0 ? $"  ·  PCIe {g.PcieGen}.0" : "")));
            Row("Mainboard", new[] { $"{Brand(r.Board?.Manufacturer)} {r.Board?.Product}".Trim() });
            Row("RAM", RamLines(r.Ram));
            Row("Ổ cứng", r.Disks.Where(d => d.BusType != 7 && d.SizeBytes > 16e9).Select(DiskLine));
            Row("Màn hình", new[] { r.Display != null ? $"{r.Display.Width} × {r.Display.Height}" : null });
            Row("Nguồn", new[] { "Không đọc được — khai trên web" }, Faint);
            specTable.ResumeLayout();
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
            if (ram.Count > 1) yield return $"Tổng {Gb(total, 1024)} GB";
        }

        static string DiskLine(DiskInfo d)
        {
            var kind = d.BusType == 17 ? "NVMe" + (d.PcieGen > 0 ? $" Gen{d.PcieGen}" : "") : d.MediaType == 3 ? "HDD" : "SSD SATA";
            var gb = Math.Round(d.SizeBytes / 1e9);
            var size = gb >= 1000 ? $"{Math.Round(gb / 1000.0, 1)} TB" : $"{gb} GB";
            return $"{d.Model}  ·  {size}  ·  {kind}" + (d.IsBoot ? "  ·  ổ Windows" : "") + (d.HealthPct != null ? $"  ·  sức khỏe {d.HealthPct}%" : "");
        }
        static long Gb(double bytes, int unit) => (long)Math.Round(bytes / unit / unit / unit);

        // ---------- gửi & theo dõi ----------
        async Task Send()
        {
            if (report == null) return;
            sendBtn.Enabled = false;
            sendBtn.Text = "Đang gửi…";
            try
            {
                sent = await api.SendAsync(report);
                qr.Set(sent.Qr);
                qr.Visible = true;
                sideTitle.Text = "Quét mã bằng điện thoại";
                sideText.Text = $"Hoặc mở trang dưới đây và nhập mã:{Environment.NewLine}{Host(api.Server)}/quet";
                codeLabel.Text = sent.Pretty; codeLabel.Visible = true;
                var exp = DateTime.TryParse(sent.ExpiresAt, out var t) ? t.ToLocalTime().ToString("HH:mm") : "30 phút nữa";
                expiryLabel.Text = $"Mã dùng được đến {exp}. Sau khi đăng nhập, chọn cập nhật máy đã có hoặc tạo máy mới."; expiryLabel.Visible = true;
                openBtn.Visible = true;
                claimedLabel.Visible = false;
                sendBtn.Text = "Đã gửi";
                poll.Start();
            }
            catch (ApiException ex)
            {
                MessageBox.Show(this, ex.Message, "Chưa gửi được", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                sendBtn.Text = "Gắn vào tài khoản pcdex";
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
                claimedLabel.Text = $"Đã gắn vào {st.Claimed.MachineName ?? "máy"}" + (st.Claimed.Handle != null ? $" của @{st.Claimed.Handle}" : "") + ". Có thể đóng phần mềm.";
                claimedLabel.ForeColor = Lime; claimedLabel.Visible = true;
                qr.Visible = false; openBtn.Visible = false; expiryLabel.Visible = false; codeLabel.Visible = false;
                sideTitle.Text = "Xong";
                sideText.Text = "Xem điểm, hạng và gợi ý nâng cấp ở trang Máy của tôi.";
            }
            else if (st.Expired)
            {
                poll.Stop();
                claimedLabel.Text = "Mã đã hết hạn. Bấm “Quét lại” rồi gửi lại để lấy mã mới.";
                claimedLabel.ForeColor = Warn; claimedLabel.Visible = true;
                qr.Visible = false; openBtn.Visible = false;
            }
        }

        void ResetSide()
        {
            poll.Stop();
            sent = null;
            sideTitle.Text = "Gắn vào tài khoản";
            sideText.Text = "Gắn kết quả quét vào tài khoản pcdex để cập nhật máy đã khai hoặc tạo máy mới. Linh kiện đọc được từ máy có nhãn “Xác thực đang dùng” trên bảng xếp hạng và chợ.";
            qr.Visible = codeLabel.Visible = expiryLabel.Visible = openBtn.Visible = claimedLabel.Visible = false;
            sendBtn.Text = "Gắn vào tài khoản pcdex";
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
            catch { Clipboard.SetText(url); MessageBox.Show(this, "Không mở được trình duyệt. Đã chép đường dẫn, dán vào trình duyệt:\n" + url, "pcdex"); }
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
