using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace PcdexScan
{
    static class Program
    {
        public const string Version = "0.4.0";
        /// <summary>Địa chỉ web pcdex mặc định. Đổi bằng tham số --server hoặc biến môi trường PCDEX_SERVER.</summary>
        const string DefaultServer = "https://pcdex.app";

        [STAThread]
        static int Main(string[] args)
        {
            // --lang vi|en: ngôn ngữ giao diện và phiếu xuất (mặc định theo Windows / lựa chọn đã nhớ)
            L.Init(Arg(args, "--lang"));
            string server = Arg(args, "--server") ?? Environment.GetEnvironmentVariable("PCDEX_SERVER") ?? DefaultServer;

            // --json: in kết quả quét ra màn hình / tệp, không mở cửa sổ (để kiểm tra, gửi hỗ trợ)
            var json = Arg(args, "--json");
            if (json != null || args.Contains("--json"))
            {
                var text = Api.ToJson(Scanner.Scan("pcdex-scan/" + Version));
                if (!string.IsNullOrEmpty(json)) File.WriteAllText(json, text, new UTF8Encoding(false));
                else Console.WriteLine(text);
                return 0;
            }

            // --export <tệp.png|tệp.pdf>: quét rồi xuất phiếu cấu hình, không mở cửa sổ
            var export = Arg(args, "--export");
            if (export != null)
            {
                var r = Scanner.Scan("pcdex-scan/" + Version);
                System.Drawing.Image logo = null;
                try { logo = new System.Drawing.Icon(System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath), new System.Drawing.Size(256, 256)).ToBitmap(); } catch { }
                using (var bmp = SheetExport.Render(MainForm.SpecRows(r), r.Os, DateTime.Now, logo)) SheetExport.Save(bmp, Path.GetFullPath(export));
                return 0;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ScanReport kept = null;
            while (true)
            {
                // Api đọc ngôn ngữ lúc tạo (header x-lang) nên tạo lại mỗi lần đổi
                var form = new MainForm(new Api(server), kept);
                Application.Run(form);
                if (!form.SwitchLang) break;
                L.Set(!L.En);
                kept = form.Report;
            }
            return 0;
        }

        static string Arg(string[] args, string name)
        {
            var i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[i + 1] : null;
        }
    }
}
