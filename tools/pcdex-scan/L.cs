using System;
using System.Globalization;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace PcdexScan
{
    /// <summary>
    /// Ngôn ngữ giao diện: tiếng Việt hoặc tiếng Anh. Mặc định tiếng Việt khi Windows tiếng Việt hoặc vị trí Windows là Việt Nam, còn lại tiếng Anh;
    /// tham số --lang vi|en hoặc nút đổi ngôn ngữ ghi đè, lựa chọn nhớ trong HKCU\Software\pcdex-scan.
    /// </summary>
    static class L
    {
        const string Key = @"Software\pcdex-scan";
        public static bool En { get; private set; }
        public static string Code => En ? "en" : "vi";

        /// <summary>Chọn chữ theo ngôn ngữ hiện tại</summary>
        public static string T(string vi, string en) => En ? en : vi;

        public static void Init(string arg)
        {
            var lang = arg;
            if (lang == null) try { using (var k = Registry.CurrentUser.OpenSubKey(Key)) lang = k?.GetValue("Lang") as string; } catch { }
            // nhiều máy ở Việt Nam cài Windows tiếng Anh → xét thêm vị trí (Home location) của Windows
            if (lang == null) lang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "vi" || InVietnam() ? "vi" : "en";
            En = !string.Equals(lang, "vi", StringComparison.OrdinalIgnoreCase);
        }

        [DllImport("kernel32.dll")] static extern int GetUserGeoID(int geoClass);
        /// <summary>Vị trí Windows là Việt Nam (GEOCLASS_NATION = 16, Việt Nam = 251)</summary>
        static bool InVietnam() { try { return GetUserGeoID(16) == 251; } catch { return false; } }

        public static void Set(bool en)
        {
            En = en;
            try { using (var k = Registry.CurrentUser.CreateSubKey(Key)) k?.SetValue("Lang", Code); } catch { }
        }

        /// <summary>Ngày giờ theo thói quen từng ngôn ngữ</summary>
        public static string When(DateTime t) => En ? t.ToString("MMM d, yyyy · HH:mm", CultureInfo.InvariantCulture) : t.ToString("HH:mm dd/MM/yyyy");
    }
}
