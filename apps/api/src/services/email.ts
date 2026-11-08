import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { DB } from "../db.js";
import { mailer, SettingsError } from "./settings.js";

/**
 * Thư tự động của pcdex: mẫu thư (mặc định trong mã, quản trị viên sửa được), gửi qua SMTP trong app_settings, ghi email_log.
 *
 * Cú pháp mẫu (cả tiêu đề lẫn nội dung):
 *   {{bien}}                 chèn giá trị (đã thoát HTML)
 *   {{#bien}} … {{/bien}}    chỉ hiện khi biến có giá trị
 *   **chữ**                  in đậm
 *   [chữ](url)               liên kết; đứng riêng một đoạn thì thành nút
 *   dòng trống               sang đoạn mới
 * Giá trị biến không được hiểu là cú pháp (tên người dùng có "[x](y)" vẫn chỉ là chữ).
 */

export interface Outgoing { to: string; subject: string; text: string; html: string }
/** Bộ gửi thư thay thế (test). Không đặt = gửi qua SMTP đã cấu hình. */
export type MailSender = (m: Outgoing) => Promise<void>;
export interface MailCtx { db: DB; settingsKey?: string; webUrl?: string; sendMail?: MailSender }

// ---------- mẫu thư ----------
interface VarDef { name: string; desc: string; sample: string }
interface TemplateDef { key: TemplateKey; name: string; event: string; vars: VarDef[]; subject: string; body: string }

const COMMON: VarDef[] = [
  { name: "ten", desc: "Tên hiển thị", sample: "Minh Anh" },
  { name: "handle", desc: "Tên tài khoản (không có @)", sample: "minhanh" },
  { name: "email", desc: "Email người nhận", sample: "minhanh@gmail.com" },
  { name: "link_app", desc: "Địa chỉ pcdex", sample: "https://pcdex.app" },
];
const TIME: VarDef = { name: "thoi_gian", desc: "Thời điểm (giờ Việt Nam)", sample: "21:05 08/11/2026" };
const IP: VarDef = { name: "ip", desc: "Địa chỉ IP", sample: "14.231.10.25" };
const DEVICE: VarDef = { name: "thiet_bi", desc: "Trình duyệt và hệ điều hành", sample: "Chrome trên Windows" };

export const TEMPLATE_KEYS = ["welcome", "verify_email", "password_reset", "password_changed", "new_login", "account_banned", "listing_removed"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATES: TemplateDef[] = [
  {
    key: "welcome", name: "Chào mừng", event: "Tạo tài khoản (email + mật khẩu, hoặc Google lần đầu)",
    vars: [...COMMON, { name: "link_xac_minh", desc: "Link xác minh email, 48 giờ (trống khi đăng ký bằng Google)", sample: "https://pcdex.app/xac-minh-email?t=…" }],
    subject: "Chào mừng {{ten}} đến với pcdex",
    body: `Chào {{ten}},

Tài khoản pcdex của bạn đã được tạo với tên **@{{handle}}**.
{{#link_xac_minh}}
Bấm nút dưới đây để xác minh email. Link có hiệu lực 48 giờ.

[Xác minh email]({{link_xac_minh}})
{{/link_xac_minh}}
Bắt đầu bằng việc khai cấu hình máy, hoặc tải pcdex-scan để tự đọc cấu hình trên Windows.

[Mở Máy của tôi]({{link_app}}/may)

Nếu không phải bạn tạo tài khoản này, bỏ qua thư này.`,
  },
  {
    key: "verify_email", name: "Xác minh email", event: "Người dùng bấm “Gửi lại thư xác minh” trong trang Tài khoản",
    vars: [...COMMON, { name: "link", desc: "Link xác minh, 48 giờ", sample: "https://pcdex.app/xac-minh-email?t=…" }],
    subject: "Xác minh email cho tài khoản pcdex",
    body: `Chào {{ten}},

Bấm nút dưới đây để xác minh email {{email}} cho tài khoản @{{handle}}. Link có hiệu lực 48 giờ.

[Xác minh email]({{link}})

Nếu bạn không yêu cầu, bỏ qua thư này.`,
  },
  {
    key: "password_reset", name: "Quên mật khẩu", event: "Người dùng gửi yêu cầu ở trang Quên mật khẩu",
    vars: [...COMMON, { name: "link", desc: "Link đặt lại mật khẩu, 60 phút, dùng một lần", sample: "https://pcdex.app/dat-lai-mat-khau?t=…" }, TIME, IP],
    subject: "Đặt lại mật khẩu pcdex",
    body: `Chào {{ten}},

Có yêu cầu đặt lại mật khẩu cho tài khoản @{{handle}} lúc {{thoi_gian}} (IP {{ip}}).

[Đặt lại mật khẩu]({{link}})

Link dùng được một lần và hết hạn sau 60 phút. Nếu không phải bạn yêu cầu, bỏ qua thư này; mật khẩu hiện tại vẫn giữ nguyên.`,
  },
  {
    key: "password_changed", name: "Mật khẩu đã đổi", event: "Đổi mật khẩu trong trang Tài khoản, hoặc đặt lại qua email",
    vars: [...COMMON, TIME, IP, DEVICE],
    subject: "Mật khẩu pcdex của bạn vừa được đổi",
    body: `Chào {{ten}},

Mật khẩu tài khoản @{{handle}} vừa được đổi lúc {{thoi_gian}}.

Thiết bị: {{thiet_bi}}
IP: {{ip}}

Các thiết bị khác đã được đăng xuất. Nếu không phải bạn đổi, đặt lại mật khẩu ngay:

[Đặt lại mật khẩu]({{link_app}}/quen-mat-khau)`,
  },
  {
    key: "new_login", name: "Đăng nhập từ thiết bị mới", event: "Đăng nhập (mật khẩu hoặc Google) từ trình duyệt / hệ điều hành chưa từng dùng",
    vars: [...COMMON, TIME, IP, DEVICE],
    subject: "Đăng nhập pcdex từ thiết bị mới",
    body: `Chào {{ten}},

Tài khoản @{{handle}} vừa đăng nhập từ một thiết bị mới.

Thiết bị: {{thiet_bi}}
IP: {{ip}}
Thời gian: {{thoi_gian}}

Nếu là bạn, không cần làm gì. Nếu không phải bạn, đổi mật khẩu ngay và đăng xuất các thiết bị khác trong trang Tài khoản.

[Mở trang Tài khoản]({{link_app}}/tai-khoan)`,
  },
  {
    key: "account_banned", name: "Tài khoản bị khóa", event: "Quản trị viên khóa tài khoản",
    vars: [...COMMON, TIME, { name: "ly_do", desc: "Lý do khóa (có thể trống)", sample: "Đăng tin lừa đảo" }],
    subject: "Tài khoản pcdex của bạn đã bị khóa",
    body: `Chào {{ten}},

Tài khoản @{{handle}} đã bị khóa lúc {{thoi_gian}}.{{#ly_do}} Lý do: {{ly_do}}.{{/ly_do}}

Trong thời gian bị khóa, bạn không đăng nhập được và tin rao của bạn bị ẩn khỏi chợ. Nếu cho rằng đây là nhầm lẫn, liên hệ lienhe@pcdex.app.`,
  },
  {
    key: "listing_removed", name: "Tin rao bị gỡ", event: "Quản trị viên gỡ tin rao",
    vars: [...COMMON, TIME, { name: "tin", desc: "Tên tin rao", sample: "RTX 3060 12GB" }, { name: "ly_do", desc: "Lý do gỡ (có thể trống)", sample: "Ảnh không phải hàng thật" }],
    subject: "Tin rao “{{tin}}” đã bị gỡ",
    body: `Chào {{ten}},

Tin rao **{{tin}}** của bạn đã bị quản trị viên gỡ khỏi chợ lúc {{thoi_gian}}.{{#ly_do}} Lý do: {{ly_do}}.{{/ly_do}}

Bạn vẫn xem được tin trong mục Tin của tôi nhưng không tự mở lại được. Liên hệ lienhe@pcdex.app nếu cần trao đổi.

[Tin của tôi]({{link_app}}/cho/cua-toi)`,
  },
];
const defOf = (key: string) => TEMPLATES.find((t) => t.key === key);

// ---------- dựng thư ----------
type Vars = Record<string, string | null | undefined>;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sections = (tpl: string, vars: Vars) =>
  tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, inner: string) => (vars[k] ? inner : ""));
const tidy = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const safeUrl = (u: string) => /^(https?:\/\/|mailto:)/i.test(u);

export function renderSubject(tpl: string, vars: Vars) {
  return sections(tpl, vars).replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 250);
}

export function renderText(tpl: string, vars: Vars) {
  const filled = tidy(sections(tpl, vars));
  // cú pháp xử lý trên mẫu trước, rồi mới chèn giá trị
  return filled.replace(LINK, (_, label: string, url: string) => `${label}: ${url}`).replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function renderHtml(tpl: string, vars: Vars) {
  const val = (k: string) => esc(vars[k] ?? "");
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => val(k));
  const href = (raw: string) => { const u = raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? ""); return safeUrl(u) ? esc(u) : null; };
  const inline = (s: string) => fill(esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(LINK, (m, label: string, url: string) => {
      const h = href(url.replace(/&amp;/g, "&"));
      return h ? `<a href="${h}" style="color:#1460E6;text-decoration:underline">${label}</a>` : label;
    }))
    .replace(/\n/g, "<br>");
  const button = (line: string) => {
    const b = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(line.trim());
    const h = b ? href(b[2]!) : null;
    return h ? `<p style="margin:24px 0"><a href="${h}" style="display:inline-block;background:#1769FF;color:#ffffff;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">${fill(esc(b![1]!))}</a></p>` : null;
  };
  const para = (lines: string[]) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${inline(lines.join("\n"))}</p>`;
  // dòng chỉ có một liên kết thành nút; các dòng còn lại gom thành đoạn
  const paras = tidy(sections(tpl, vars)).split(/\n{2,}/).flatMap((p) => {
    const out: string[] = [];
    let buf: string[] = [];
    for (const line of p.split("\n")) {
      const b = button(line);
      if (b) { if (buf.length) out.push(para(buf)); buf = []; out.push(b); } else buf.push(line);
    }
    if (buf.length) out.push(para(buf));
    return out;
  }).join("\n");
  const home = vars.link_app && safeUrl(vars.link_app) ? esc(vars.link_app) : "https://pcdex.app";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#EEF2FA;color:#0B1530;font-family:Inter,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2FA"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px"><tr><td style="padding:32px 32px 16px">
<div style="font-size:22px;font-weight:800;font-style:italic;letter-spacing:-0.03em;margin-bottom:28px;color:#080F24"><img src="${home}/brand/icon-96.png" width="32" height="32" alt="" style="vertical-align:-9px;margin-right:8px;border:0">PCD<span style="color:#1769FF">EX</span></div>
${paras}
</td></tr></table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b6b66">Thư tự động từ <a href="${home}" style="color:#6b6b66">pcdex</a>, mạng xã hội PC độc lập. Vui lòng không trả lời thư này.</p>
</td></tr></table></body></html>`;
}

// ---------- mẫu đã sửa (bảng email_templates) ----------
export async function getTemplate(db: DB, key: TemplateKey) {
  const def = defOf(key)!;
  const row = await db.selectFrom("email_templates").selectAll().where("key", "=", key).executeTakeFirst();
  return { subject: row?.subject ?? def.subject, body: row?.body ?? def.body, enabled: row?.enabled ?? true };
}

export async function listTemplates(db: DB) {
  const rows = await db.selectFrom("email_templates as t").leftJoin("users as u", "u.id", "t.updated_by")
    .select(["t.key", "t.subject", "t.body", "t.enabled", "t.updated_at", "u.handle"]).execute();
  const sent = await db.selectFrom("email_log").select((eb) => ["template", eb.fn.countAll<string>().as("n"), eb.fn.max("created_at").as("last")])
    .where("status", "=", "sent").groupBy("template").execute();
  return TEMPLATES.map((d) => {
    const r = rows.find((x) => x.key === d.key);
    const s = sent.find((x) => x.template === d.key);
    return {
      key: d.key, name: d.name, event: d.event, vars: d.vars.map(({ name, desc }) => ({ name, desc })),
      subject: r?.subject ?? d.subject, body: r?.body ?? d.body, enabled: r?.enabled ?? true, customized: !!r,
      updatedAt: r?.updated_at ?? null, updatedBy: r?.handle ?? null, defaultSubject: d.subject, defaultBody: d.body,
      sent: Number(s?.n ?? 0), lastSent: s?.last ?? null,
    };
  });
}

export const templateInput = z.object({
  subject: z.string().trim().min(1, "Nhập tiêu đề").max(200, "Tiêu đề tối đa 200 ký tự"),
  body: z.string().trim().min(1, "Nhập nội dung").max(10_000, "Nội dung tối đa 10.000 ký tự"),
  enabled: z.boolean(),
});
export type TemplateInput = z.infer<typeof templateInput>;
export const isTemplateKey = (k: string): k is TemplateKey => (TEMPLATE_KEYS as readonly string[]).includes(k);

/** Lỗi cú pháp dễ gặp: biến không có trong mẫu, khối {{#…}} chưa đóng */
export function checkTemplate(key: TemplateKey, input: { subject: string; body: string }) {
  const known = new Set(defOf(key)!.vars.map((v) => v.name));
  const all = `${input.subject}\n${input.body}`;
  const unknown = [...new Set([...all.matchAll(/\{\{[#/]?(\w+)\}\}/g)].map((m) => m[1]!))].filter((v) => !known.has(v));
  if (unknown.length) return `Mẫu này không có biến ${unknown.map((v) => `{{${v}}}`).join(", ")}.`;
  for (const m of all.matchAll(/\{\{#(\w+)\}\}/g)) if (!all.includes(`{{/${m[1]}}}`)) return `Khối {{#${m[1]}}} chưa có {{/${m[1]}}} để đóng.`;
  return null;
}

export async function saveTemplate(db: DB, key: TemplateKey, input: TemplateInput, adminId: string) {
  const v = { subject: input.subject, body: input.body, enabled: input.enabled, updated_by: adminId };
  await db.insertInto("email_templates").values({ key, ...v })
    .onConflict((oc) => oc.column("key").doUpdateSet({ ...v, updated_at: new Date() })).execute();
}
export async function resetTemplate(db: DB, key: TemplateKey) {
  await db.deleteFrom("email_templates").where("key", "=", key).execute();
}

/** Dữ liệu mẫu để xem trước / gửi thử */
export function sampleVars(key: TemplateKey, over: Vars = {}): Vars {
  return { ...Object.fromEntries(defOf(key)!.vars.map((v) => [v.name, v.sample])), ...over };
}

export function render(tpl: { subject: string; body: string }, vars: Vars) {
  return { subject: renderSubject(tpl.subject, vars), text: renderText(tpl.body, vars), html: renderHtml(tpl.body, vars) };
}

// ---------- gửi ----------
async function deliver(ctx: MailCtx, m: Outgoing) {
  if (ctx.sendMail) return ctx.sendMail(m);
  const t = await mailer(ctx.db, ctx.settingsKey);
  if (!t) throw new SkipError("Chưa cấu hình SMTP hoặc đang tắt");
  await t.send(m.to, m.subject, m.text, m.html);
}
class SkipError extends Error {}

export async function logEmail(db: DB, row: { template: string; to: string; userId?: string | null; subject: string; status: "sent" | "failed" | "skipped"; error?: string | null }) {
  await db.insertInto("email_log").values({
    template: row.template, to_email: row.to, user_id: row.userId ?? null, subject: row.subject.slice(0, 250), status: row.status, error: row.error?.slice(0, 500) ?? null,
  }).execute();
}

/** Gửi một thư theo mẫu. Không bao giờ ném lỗi: kết quả (gửi / lỗi / bỏ qua) ghi vào email_log. */
export async function sendTemplate(ctx: MailCtx, key: TemplateKey, to: string, vars: Vars, userId?: string | null) {
  let subject = defOf(key)!.subject;
  try {
    const tpl = await getTemplate(ctx.db, key);
    const out = render(tpl, { link_app: ctx.webUrl ?? "https://pcdex.app", email: to, ...vars });
    subject = out.subject;
    if (!tpl.enabled) { await logEmail(ctx.db, { template: key, to, userId, subject, status: "skipped", error: "Mẫu đang tắt" }); return "skipped" as const; }
    await deliver(ctx, { to, ...out });
    await logEmail(ctx.db, { template: key, to, userId, subject, status: "sent" });
    return "sent" as const;
  } catch (e) {
    const skip = e instanceof SkipError;
    const error = skip || e instanceof SettingsError ? (e as Error).message : String((e as Error)?.message ?? e);
    await logEmail(ctx.db, { template: key, to, userId, subject, status: skip ? "skipped" : "failed", error }).catch(() => {});
    return skip ? ("skipped" as const) : ("failed" as const);
  }
}

/** Gửi theo mẫu cho một người dùng (lấy tên, handle, email); người dùng không có email thì thôi */
export async function sendToUser(ctx: MailCtx, key: TemplateKey, userId: string, vars: Vars = {}) {
  const u = await ctx.db.selectFrom("users").select(["email", "display_name", "handle"]).where("id", "=", userId).executeTakeFirst();
  if (!u?.email) return "skipped" as const;
  return sendTemplate(ctx, key, u.email, { ten: u.display_name, handle: u.handle, ...vars }, userId);
}

/** Gửi nền: không chặn phản hồi API, lỗi đã ghi nhật ký */
export function later(p: Promise<unknown>) { p.catch(() => {}); }

export async function emailLog(db: DB, opts: { limit: number; offset: number; template?: string; status?: string }) {
  let q = db.selectFrom("email_log as l").leftJoin("users as u", "u.id", "l.user_id")
    .select(["l.id", "l.template", "l.to_email", "l.subject", "l.status", "l.error", "l.created_at", "u.handle"]);
  if (opts.template) q = q.where("l.template", "=", opts.template);
  if (opts.status === "sent" || opts.status === "failed" || opts.status === "skipped") q = q.where("l.status", "=", opts.status);
  return q.orderBy("l.created_at", "desc").limit(opts.limit).offset(opts.offset).execute();
}

// ---------- mã một lần ----------
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const VERIFY_TTL_MS = 48 * 3600_000;
export const RESET_TTL_MS = 60 * 60_000;

/** Tạo mã mới; mã chưa dùng cùng mục đích của người này bị hủy */
export async function issueToken(db: DB, userId: string, purpose: "verify" | "reset", email: string) {
  const token = randomBytes(32).toString("base64url");
  await db.deleteFrom("email_tokens").where("user_id", "=", userId).where("purpose", "=", purpose).where("used_at", "is", null).execute();
  await db.insertInto("email_tokens").values({
    token_hash: sha(token), user_id: userId, purpose, email, used_at: null,
    expires_at: new Date(Date.now() + (purpose === "verify" ? VERIFY_TTL_MS : RESET_TTL_MS)),
  }).execute();
  return token;
}

/** Dùng mã: còn hạn, chưa dùng, email vẫn là email hiện tại của tài khoản. Trả về user_id hoặc null. */
export async function consumeToken(db: DB, token: string, purpose: "verify" | "reset") {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const row = await db.selectFrom("email_tokens as t").innerJoin("users as u", "u.id", "t.user_id")
    .select(["t.token_hash", "t.user_id", "t.email", "u.email as current"])
    .where("t.token_hash", "=", sha(token)).where("t.purpose", "=", purpose)
    .where("t.used_at", "is", null).where("t.expires_at", ">", new Date()).executeTakeFirst();
  if (!row || row.email !== row.current) return null;
  const done = await db.updateTable("email_tokens").set({ used_at: new Date() }).where("token_hash", "=", row.token_hash).where("used_at", "is", null).executeTakeFirst();
  return Number(done.numUpdatedRows) === 1 ? row.user_id : null;
}

/** Số mã đã tạo gần đây (chống gửi dồn) */
export async function recentTokens(db: DB, userId: string, purpose: "verify" | "reset", withinMs: number) {
  const r = await db.selectFrom("email_tokens").select((eb) => [eb.fn.countAll<string>().as("n"), eb.fn.max("created_at").as("last")])
    .where("user_id", "=", userId).where("purpose", "=", purpose).where("created_at", ">", new Date(Date.now() - withinMs)).executeTakeFirstOrThrow();
  return { count: Number(r.n), last: r.last ? new Date(r.last) : null };
}

// ---------- thông tin yêu cầu ----------
export function clientIp(req: FastifyRequest) {
  const cf = req.headers["cf-connecting-ip"];
  return (typeof cf === "string" && cf) || req.ip || "không rõ";
}

/** "Chrome trên Windows" — đủ để người dùng nhận ra thiết bị, không lưu chuỗi User-Agent đầy đủ */
export function deviceOf(ua: string | undefined) {
  if (!ua) return "Thiết bị không rõ";
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari"
    : /okhttp|Expo|CFNetwork|Dalvik/.test(ua) ? "Ứng dụng pcdex" : "Trình duyệt khác";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "hệ điều hành khác";
  return `${browser} trên ${os}`;
}

export const nowVn = () => new Date().toLocaleString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
});

/**
 * Ghi nhận thiết bị đăng nhập. Trả về true khi nên báo "đăng nhập từ thiết bị mới":
 * tài khoản đã có thiết bị khác từ trước và thiết bị này chưa gặp. Lần đầu (tài khoản mới, hoặc tài khoản có từ trước khi có tính năng) thì không báo.
 */
export async function noteDevice(db: DB, userId: string, ua: string | undefined, ip: string) {
  const device = deviceOf(ua);
  const known = await db.selectFrom("user_devices").select("device").where("user_id", "=", userId).execute();
  await db.insertInto("user_devices").values({ user_id: userId, device, last_ip: ip })
    .onConflict((oc) => oc.columns(["user_id", "device"]).doUpdateSet({ last_ip: ip, last_seen: new Date() })).execute();
  return { device, isNew: known.length > 0 && !known.some((k) => k.device === device) };
}

/** Ngữ cảnh gửi thư cho một yêu cầu: link trong thư trỏ về WEB_URL, chưa đặt thì về địa chỉ người dùng đang vào */
export function mailCtx(deps: { db: DB; settingsKey?: string; webUrl?: string; sendMail?: MailSender }, req: FastifyRequest): MailCtx {
  const proto = req.headers["x-forwarded-proto"]?.toString().split(",")[0]?.trim() || req.protocol;
  const host = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim() || req.headers.host;
  return { db: deps.db, settingsKey: deps.settingsKey, sendMail: deps.sendMail, webUrl: (deps.webUrl ?? `${proto}://${host}`).replace(/\/+$/, "") };
}
