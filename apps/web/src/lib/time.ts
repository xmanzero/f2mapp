/** "5 phút trước", "2 ngày trước" theo ngôn ngữ (chỉ dùng phía trình duyệt — trang tĩnh không đọc đồng hồ lúc dựng) */
export function ago(iso: string, locale: "vi" | "en"): string {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const f = new Intl.RelativeTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return f.format(Math.round(s / n), u);
  return f.format(0, "second");
}
