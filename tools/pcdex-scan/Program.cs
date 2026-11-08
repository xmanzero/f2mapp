using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace PcdexScan
{
    static class Program
    {
        public const string Version = "0.1.0";
        /// <summary>Địa chỉ web pcdex mặc định. Đổi bằng tham số --server hoặc biến môi trường PCDEX_SERVER.</summary>
        const string DefaultServer = "http://192.168.110.136:8141";

        [STAThread]
        static int Main(string[] args)
        {
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

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(new Api(server)));
            return 0;
        }

        static string Arg(string[] args, string name)
        {
            var i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[i + 1] : null;
        }
    }
}
