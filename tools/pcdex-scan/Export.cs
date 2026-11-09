using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Text;

namespace PcdexScan
{
    /// <summary>
    /// "Phiếu cấu hình" xuất ra ảnh PNG hoặc PDF khổ A4: cùng bố cục với web (apps/web/src/lib/export-sheet.ts) —
    /// dải navy có logo pcdex, dấu chìm "pcdex.app" chéo khắp trang, bảng phần cứng, chân trang ghi nguồn.
    /// Phần mềm không tính điểm (điểm tính trên web), nên phiếu nhắc gắn vào tài khoản để xem điểm.
    /// </summary>
    static class SheetExport
    {
        const int W = 1240, H = 1754, M = 72;
        const string Font = "Segoe UI";
        static readonly Color Navy = Color.FromArgb(0x08, 0x0f, 0x24), Ink = Color.FromArgb(0x0b, 0x15, 0x30),
            Muted = Color.FromArgb(0x5c, 0x66, 0x81), Rule = Color.FromArgb(0xe3, 0xe9, 0xf5), Panel = Color.FromArgb(0xf1, 0xf4, 0xfa),
            Blue = Color.FromArgb(0x14, 0x60, 0xe6);

        static Font F(float px, FontStyle s = FontStyle.Regular) => new Font(Font, px, s, GraphicsUnit.Pixel);

        public static Bitmap Render(IList<KeyValuePair<string, List<string>>> rows, string os, DateTime at, Image logo)
        {
            var bmp = new Bitmap(W, H);
            bmp.SetResolution(150, 150);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.Clear(Color.White);

                // dấu chìm chéo
                var st = g.Save();
                g.TranslateTransform(W / 2f, H / 2f);
                g.RotateTransform(-25.7f);
                using (var wf = F(44, FontStyle.Bold | FontStyle.Italic))
                using (var wb = new SolidBrush(Color.FromArgb(14, 0x14, 0x60, 0xe6)))
                    for (int r = -9; r <= 9; r++)
                        for (int k = -4; k <= 4; k++)
                            g.DrawString("pcdex.app", wf, wb, k * 380 + (r % 2) * 190 - 110, r * 150 - 30);
                g.Restore(st);

                // đầu trang
                using (var b = new SolidBrush(Navy)) g.FillRectangle(b, 0, 0, W, 168);
                if (logo != null) g.DrawImage(logo, M, 40, 88, 88);
                using (var f = F(54, FontStyle.Bold | FontStyle.Italic))
                {
                    var typo = StringFormat.GenericTypographic;
                    g.DrawString("PCD", f, Brushes.White, M + 108, 54, typo);
                    var w = g.MeasureString("PCD", f, PointF.Empty, typo).Width;
                    using (var gr = new LinearGradientBrush(new RectangleF(M + 100 + w, 0, 80, 10), Color.FromArgb(0x00, 0xa6, 0xff), Color.FromArgb(0x8a, 0x2b, 0xff), 0f))
                        g.DrawString("EX", f, gr, M + 108 + w, 54, typo);
                }
                var right = new StringFormat { Alignment = StringAlignment.Far };
                using (var f = F(32, FontStyle.Bold)) g.DrawString(L.T("Cấu hình máy", "PC configuration"), f, Brushes.White, W - M, 50, right);
                using (var f = F(22)) using (var b = new SolidBrush(Color.FromArgb(0xb3, 0xbc, 0xd3))) g.DrawString(L.When(at), f, b, W - M, 98, right);

                // tiêu đề
                float y = 200;
                using (var f = F(46, FontStyle.Bold)) using (var b = new SolidBrush(Ink)) g.DrawString(L.T("Kết quả quét phần cứng", "Hardware scan result"), f, b, M - 4, y);
                y += 66;
                using (var f = F(24)) using (var b = new SolidBrush(Muted)) g.DrawString(L.T("Đọc bằng pcdex-scan", "Read by pcdex-scan") + (string.IsNullOrEmpty(os) ? "" : " · " + os), f, b, M, y);

                // khung nhắc xem điểm trên web
                y += 60;
                using (var b = new SolidBrush(Panel)) using (var p = Rounded(new RectangleF(M, y, W - 2 * M, 150), 24)) g.FillPath(b, p);
                using (var f = F(28, FontStyle.Bold)) using (var b = new SolidBrush(Ink)) g.DrawString(L.T("Xem điểm sức mạnh, FPS và gợi ý nâng cấp", "See the power score, FPS and upgrade tips"), f, b, M + 36, y + 32);
                using (var f = F(22)) using (var b = new SolidBrush(Muted))
                    g.DrawString(L.T("Gắn kết quả quét vào tài khoản trên pcdex.app (nút “Gắn vào tài khoản pcdex” trong phần mềm).", "Link this scan to your account on pcdex.app (the “Link to pcdex account” button in the app)."), f, b, new RectangleF(M + 36, y + 80, W - 2 * M - 72, 60));
                y += 220;

                // bảng phần cứng
                using (var f = F(32, FontStyle.Bold)) using (var b = new SolidBrush(Ink)) g.DrawString(L.T("Cấu hình", "Configuration"), f, b, M - 2, y);
                y += 60;
                using (var rule = new Pen(Rule, 2))
                using (var kf = F(22)) using (var vf = F(25)) using (var mb = new SolidBrush(Muted)) using (var ib = new SolidBrush(Ink))
                {
                    foreach (var row in rows)
                    {
                        var text = row.Value.Count > 0 ? string.Join("\n", row.Value) : MainForm.Unreadable;
                        var size = g.MeasureString(text, vf, 800);
                        var rh = Math.Max(66, size.Height + 26);
                        if (y + rh > H - 140) break;
                        g.DrawLine(rule, M, y, W - M, y);
                        g.DrawString(row.Key, kf, mb, M, y + 20);
                        g.DrawString(text, vf, ib, new RectangleF(330, y + 17, 840, size.Height + 4));
                        y += rh;
                    }
                    g.DrawLine(rule, M, y, W - M, y);
                    // chân trang
                    g.DrawLine(rule, M, H - 100, W - M, H - 100);
                }
                using (var f = F(24, FontStyle.Bold)) using (var b = new SolidBrush(Blue))
                {
                    g.DrawString("pcdex.app", f, b, M - 4, H - 76);
                    var w = g.MeasureString("pcdex.app", f).Width;
                    using (var f2 = F(22)) using (var b2 = new SolidBrush(Muted))
                    {
                        g.DrawString(L.T("· Chấm điểm PC từ cấu hình thật", "· PC scores from real configurations"), f2, b2, M + w - 4, H - 74);
                        g.DrawString(L.T("Tạo lúc ", "Created ") + L.When(at), f2, b2, W - M, H - 74, right);
                    }
                }
            }
            return bmp;
        }

        static GraphicsPath Rounded(RectangleF r, float rad)
        {
            var p = new GraphicsPath();
            var d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static void Save(Bitmap bmp, string path)
        {
            if (path.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) File.WriteAllBytes(path, Pdf(bmp));
            else bmp.Save(path, ImageFormat.Png);
        }

        /// <summary>PDF một trang A4 chứa ảnh JPEG (DCTDecode), không cần thư viện</summary>
        static byte[] Pdf(Bitmap bmp)
        {
            byte[] jpeg;
            using (var ms = new MemoryStream())
            {
                var codec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
                var ps = new EncoderParameters(1) { Param = { [0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 92L) } };
                bmp.Save(ms, codec, ps);
                jpeg = ms.ToArray();
            }
            const double PW = 595.28, PH = 841.89;
            var s = Math.Min(PW / bmp.Width, PH / bmp.Height);
            double w = bmp.Width * s, h = bmp.Height * s, x = (PW - w) / 2, y = (PH - h) / 2;
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            var content = string.Format(inv, "q {0:F2} 0 0 {1:F2} {2:F2} {3:F2} cm /Im0 Do Q", w, h, x, y);

            var outp = new MemoryStream();
            var offsets = new long[7];
            void Put(string t) { var b = Encoding.ASCII.GetBytes(t); outp.Write(b, 0, b.Length); }
            void Obj(int n, Action body) { offsets[n] = outp.Position; Put($"{n} 0 obj\n"); body(); Put("\nendobj\n"); }
            Put("%PDF-1.4\n%âã\n");
            Obj(1, () => Put("<< /Type /Catalog /Pages 2 0 R >>"));
            Obj(2, () => Put("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
            Obj(3, () => Put(string.Format(inv, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {0} {1}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>", PW, PH)));
            Obj(4, () =>
            {
                Put($"<< /Type /XObject /Subtype /Image /Width {bmp.Width} /Height {bmp.Height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {jpeg.Length} >>\nstream\n");
                outp.Write(jpeg, 0, jpeg.Length);
                Put("\nendstream");
            });
            Obj(5, () => Put($"<< /Length {content.Length} >>\nstream\n{content}\nendstream"));
            Obj(6, () => Put("<< /Title (" + L.T("pcdex - Ket qua quet phan cung", "pcdex - Hardware scan result") + ") /Producer (pcdex-scan) /Creator (pcdex.app) >>"));
            var xref = outp.Position;
            Put("xref\n0 7\n0000000000 65535 f \n");
            for (int i = 1; i <= 6; i++) Put(offsets[i].ToString("D10") + " 00000 n \n");
            Put($"trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref}\n%%EOF\n");
            return outp.ToArray();
        }
    }
}
