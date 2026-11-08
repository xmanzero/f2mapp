using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading.Tasks;

namespace PcdexScan
{
    public class ApiException : Exception { public ApiException(string m) : base(m) { } }

    /// <summary>Gọi máy chủ pcdex qua địa chỉ web (web chuyển /api sang API)</summary>
    public class Api
    {
        readonly HttpClient http;
        public string Server { get; }

        public Api(string server)
        {
            Server = server.TrimEnd('/');
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("pcdex-scan/" + Program.Version);
        }

        public async Task<CreateScanReply> SendAsync(ScanReport report)
        {
            var body = new StringContent(ToJson(report), Encoding.UTF8, "application/json");
            HttpResponseMessage res;
            try { res = await http.PostAsync(Server + "/api/v1/scans", body); }
            catch (Exception) { throw new ApiException("Không kết nối được máy chủ pcdex. Kiểm tra mạng rồi thử lại."); }
            var text = await res.Content.ReadAsStringAsync();
            var reply = FromJson<CreateScanReply>(text);
            if (!res.IsSuccessStatusCode || reply?.Code == null)
                throw new ApiException(reply?.Message ?? $"Máy chủ trả lỗi ({(int)res.StatusCode}).");
            return reply;
        }

        public async Task<ScanStatus> StatusAsync(string code)
        {
            var res = await http.GetAsync(Server + "/api/v1/scans/" + Uri.EscapeDataString(code));
            if (!res.IsSuccessStatusCode) return null;
            return FromJson<ScanStatus>(await res.Content.ReadAsStringAsync());
        }

        public static string ToJson<T>(T value)
        {
            using (var ms = new MemoryStream())
            {
                new DataContractJsonSerializer(typeof(T)).WriteObject(ms, value);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }

        static T FromJson<T>(string json) where T : class
        {
            try
            {
                using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                    return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(ms);
            }
            catch { return null; }
        }
    }
}
