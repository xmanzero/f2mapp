import { jpegToPdf } from "./pdf";

/**
 * "Phiếu cấu hình" để xuất ảnh / PDF: khổ A4 dọc (1240×1754 px ≈ 150 dpi), nền sáng để in,
 * đầu trang có logo pcdex, dấu chìm "pcdex.app" chéo khắp trang, chân trang ghi nguồn và thời điểm.
 * Phần mềm quét (tools/pcdex-scan/Export.cs) vẽ cùng bố cục.
 */
export interface SheetRow { label: string; value: string; verified: boolean | null }
export interface SheetData {
  heading: string; machineName: string; byline: string; date: string;
  power: string; tierName: string; tierColor: string; ratio: string;
  scores: [string, string][];
  fps: [string, string][];
  rows: SheetRow[];
  notes: string[];
  text: { score: string; fps: string; config: string; notes: string; verified: string; declared: string; footer: string; created: string };
}

const W = 1240, H = 1754, M = 72;
const NAVY = "#080f24", INK = "#0b1530", MUTED = "#5c6681", RULE = "#e3e9f5", PANEL = "#f1f4fa", BLUE = "#1460e6", GREEN = "#0b8457";

function fonts() {
  const body = getComputedStyle(document.body).fontFamily || "Inter, Arial, sans-serif";
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-chakra").trim() || body;
  return { body, display };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
}

/** Xuống dòng theo bề rộng; trả về các dòng */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function drawSheet(d: SheetData): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const { body, display } = fonts();
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const font = (px: number, weight = 400, fam = body, style = "") => { x.font = `${style} ${weight} ${px}px ${fam}`.trim(); };

  // nền + dấu chìm chéo
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  x.save();
  x.translate(W / 2, H / 2); x.rotate(-Math.PI / 7);
  font(44, 800, body, "italic"); x.fillStyle = "rgba(20, 96, 230, 0.055)"; x.textAlign = "center";
  for (let r = -9; r <= 9; r++) for (let k = -4; k <= 4; k++) x.fillText("pcdex.app", k * 380 + (r % 2) * 190, r * 150);
  x.restore();

  // đầu trang: dải navy, logo, tiêu đề
  x.fillStyle = NAVY; x.fillRect(0, 0, W, 168);
  try { x.drawImage(await loadImage("/brand/symbol.svg"), M, 46, 82, 74); } catch { /* không tải được logo: vẫn có chữ */ }
  font(54, 800, body, "italic"); x.textAlign = "left"; x.fillStyle = "#f8faff";
  x.fillText("PCD", M + 100, 106);
  const pcd = x.measureText("PCD").width;
  const g = x.createLinearGradient(M + 100 + pcd, 0, M + 100 + pcd + 70, 0);
  g.addColorStop(0, "#00a6ff"); g.addColorStop(1, "#8a2bff");
  x.fillStyle = g; x.fillText("EX", M + 100 + pcd, 106);
  x.textAlign = "right"; x.fillStyle = "#f8faff"; font(32, 600); x.fillText(d.heading, W - M, 86);
  x.fillStyle = "#b3bcd3"; font(22); x.fillText(d.date, W - M, 122);

  // tên máy
  let y = 250;
  x.textAlign = "left"; x.fillStyle = INK; font(46, 700, display); x.fillText(d.machineName, M, y);
  if (d.byline) { y += 44; x.fillStyle = MUTED; font(24); x.fillText(d.byline, M, y); }

  // khối điểm
  y += 40;
  const top = y, ph = 300;
  x.fillStyle = PANEL; x.beginPath(); x.roundRect(M, top, W - 2 * M, ph, 24); x.fill();
  x.fillStyle = MUTED; font(20, 600); x.fillText(d.text.score.toUpperCase(), M + 36, top + 54);
  x.fillStyle = d.tierColor; font(108, 700, display); x.fillText(d.power, M + 30, top + 168);
  font(32, 700); x.fillText(d.tierName, M + 36, top + 218);
  x.fillStyle = MUTED; font(22); x.fillText(d.ratio, M + 36, top + 258);
  // điểm thành phần + FPS: lưới 3 cột bên phải
  const gx = 610, cw = (W - M - 36 - gx) / 3;
  const cell = (row: number, i: number, label: string, value: string) => {
    const cx = gx + i * cw, cy = top + 36 + row * 130;
    x.fillStyle = "#ffffff"; x.beginPath(); x.roundRect(cx, cy, cw - 14, 110, 16); x.fill();
    x.fillStyle = MUTED; font(20); x.fillText(label, cx + 20, cy + 38);
    x.fillStyle = INK; font(38, 700, display); x.fillText(value, cx + 20, cy + 88);
  };
  d.scores.slice(0, 3).forEach(([l, v], i) => cell(0, i, l, v));
  d.fps.slice(0, 3).forEach(([l, v], i) => cell(1, i, l, v));
  y = top + ph + 74;

  // bảng cấu hình
  x.fillStyle = INK; font(32, 700); x.fillText(d.text.config, M, y);
  y += 22;
  for (const r of d.rows) {
    font(26, 500);
    const lines = wrap(x, r.value, 640);
    const rh = Math.max(66, 24 + lines.length * 34);
    x.strokeStyle = RULE; x.lineWidth = 2; x.beginPath(); x.moveTo(M, y); x.lineTo(W - M, y); x.stroke();
    x.fillStyle = MUTED; font(22); x.fillText(r.label, M, y + 42);
    x.fillStyle = INK; font(26, 500); lines.forEach((ln, i) => x.fillText(ln, 330, y + 43 + i * 34));
    if (r.verified !== null) {
      x.textAlign = "right"; font(20, 600);
      x.fillStyle = r.verified ? GREEN : MUTED; x.fillText(r.verified ? `✓ ${d.text.verified}` : d.text.declared, W - M, y + 42);
      x.textAlign = "left";
    }
    y += rh;
    if (y > H - 360) break;
  }
  x.strokeStyle = RULE; x.beginPath(); x.moveTo(M, y); x.lineTo(W - M, y); x.stroke();

  // nhận xét (tối đa 3, nếu còn chỗ)
  if (d.notes.length && y < H - 300) {
    y += 64; x.fillStyle = INK; font(28, 700); x.fillText(d.text.notes, M, y);
    font(22);
    for (const n of d.notes.slice(0, 3)) {
      const lines = wrap(x, n, W - 2 * M - 30);
      if (y + 20 + lines.length * 32 > H - 150) break;
      y += 12;
      x.fillStyle = BLUE; x.beginPath(); x.arc(M + 8, y + 22, 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = INK; lines.forEach((ln) => { y += 32; x.fillText(ln, M + 30, y); });
    }
  }

  // chân trang
  x.strokeStyle = RULE; x.beginPath(); x.moveTo(M, H - 100); x.lineTo(W - M, H - 100); x.stroke();
  x.fillStyle = BLUE; font(24, 700); x.fillText("pcdex.app", M, H - 54);
  const pw = x.measureText("pcdex.app ").width;
  x.fillStyle = MUTED; font(22); x.fillText(`· ${d.text.footer}`, M + pw, H - 54);
  x.textAlign = "right"; x.fillText(`${d.text.created} ${d.date}`, W - M, H - 54);
  return c;
}

const save = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
};

export async function exportSheet(d: SheetData, format: "png" | "pdf", fileBase: string) {
  const c = await drawSheet(d);
  if (format === "png") {
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (blob) save(blob, `${fileBase}.png`);
    return;
  }
  const jpg = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.92));
  if (!jpg) return;
  save(jpegToPdf(new Uint8Array(await jpg.arrayBuffer()), W, H, `${d.machineName} · pcdex`), `${fileBase}.pdf`);
}
