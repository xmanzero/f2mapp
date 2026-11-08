-- Quản trị: vai trò, khóa tài khoản, gỡ tin vi phạm, cấu hình hệ thống (SMTP…), nhật ký thao tác quản trị.
alter table users add column role text not null default 'user' check (role in ('user', 'admin'));
alter table users add column banned_at timestamptz;          -- bị khóa: không đăng nhập được, tin bị ẩn, không lên bảng xếp hạng
alter table users add column ban_reason text;

-- Tin bị quản trị viên gỡ: người bán không tự mở lại được
alter table listings add column removed_at timestamptz;
alter table listings add column removed_reason text;

-- Cấu hình hệ thống dạng khóa → JSON. Mật khẩu (SMTP…) mã hóa AES-256-GCM bằng SETTINGS_KEY, không lưu bản rõ.
create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

create table admin_log (
  id           bigserial primary key,
  admin_id     uuid references users(id) on delete set null,
  admin_handle text not null,
  action       text not null,      -- user.ban, user.unban, user.role, user.delete, listing.remove, listing.restore, listing.delete, smtp.update, smtp.test
  target       text,               -- @handle hoặc id tin
  detail       jsonb,
  created_at   timestamptz not null default now()
);
create index on admin_log(created_at desc);
