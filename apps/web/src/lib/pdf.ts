/**
 * PDF một trang A4 chứa một ảnh JPEG (khổ dọc), không cần thư viện. Dùng cho "Xuất PDF" cấu hình máy:
 * ảnh đã vẽ sẵn (canvas) → nhúng nguyên JPEG (DCTDecode) vào trang, giãn vừa khổ A4.
 */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number, title = "pcdex"): Blob {
  const enc = new TextEncoder();
  const W = 595.28, H = 841.89; // A4, đơn vị điểm
  // giữ tỉ lệ ảnh, căn giữa
  const s = Math.min(W / width, H / height);
  const w = width * s, h = height * s, x = (W - w) / 2, y = (H - h) / 2;
  const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
  // tiêu đề tài liệu dạng UTF-16BE (có dấu tiếng Việt)
  const hex = (str: string) => "FEFF" + [...str].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("").toUpperCase();

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n: number, body: () => void) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push("\nendstream");
  });
  obj(5, () => push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push(`<< /Title <${hex(title)}> /Producer (pcdex.app) /Creator (pcdex.app) >>`));
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
