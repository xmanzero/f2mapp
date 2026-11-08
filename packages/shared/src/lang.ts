/**
 * Ngôn ngữ của câu chữ sinh ra trong packages/shared (nhận xét, gợi ý, nhãn).
 * Mặc định tiếng Việt; web truyền ngôn ngữ trang vào. Thêm ngôn ngữ: thêm mã vào Lang và một nhánh trong `tr`.
 */
export type Lang = "vi" | "en";
export const tr = (lang: Lang, vi: string, en: string) => (lang === "en" ? en : vi);

/**
 * Nhãn linh kiện đã lưu trong cơ sở dữ liệu (sinh bằng tiếng Việt, VD "Nguồn 650 W", "Mainboard (khe PCIe 4.0)")
 * đổi sang ngôn ngữ hiển thị. Tên model, dung lượng giữ nguyên.
 */
export function localizePartLabel(label: string, lang: Lang) {
  if (lang === "vi") return label;
  return label
    .replace(/^Nguồn (\d+) W/, "PSU $1 W")
    .replace(/Mainboard \(khe PCIe (\d)\.0\)/, "Motherboard (PCIe $1.0 slot)")
    .replace(/^Mainboard (?=\S)/, "Motherboard ")
    .replace(/Không rõ chuẩn/, "Unrated");
}
