-- Email: mẫu thư sửa được trong trang quản trị, nhật ký gửi, mã một lần (xác minh email, đặt lại mật khẩu), thiết bị đã đăng nhập.

-- Mẫu thư đã sửa. Không có dòng = dùng mẫu mặc định trong mã (apps/api/src/services/email.ts).
create table email_templates (
  key        text primary key,          -- welcome, verify_email, password_reset, password_changed, new_login, account_banned, listing_removed
  subject    text not null,
  body       text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

create table email_log (
  id         bigserial primary key,
  template   text not null,             -- khóa mẫu, hoặc "smtp.test"
  to_email   text not null,
  user_id    uuid references users(id) on delete set null,
  subject    text not null,
  status     text not null check (status in ('sent', 'failed', 'skipped')),
  error      text,                      -- lỗi SMTP, hoặc lý do bỏ qua (mẫu tắt, chưa cấu hình SMTP)
  created_at timestamptz not null default now()
);
create index on email_log(created_at desc);
create index on email_log(user_id, template, created_at desc);

-- Mã một lần gửi qua email. Chỉ lưu dạng băm. Mã xác minh gắn với email lúc gửi (đổi email thì mã cũ vô hiệu).
create table email_tokens (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  purpose    text not null check (purpose in ('verify', 'reset')),
  email      text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on email_tokens(user_id, purpose);

-- Thiết bị đã đăng nhập (trình duyệt + hệ điều hành): đăng nhập từ thiết bị chưa gặp thì gửi thư báo.
create table user_devices (
  user_id     uuid not null references users(id) on delete cascade,
  device      text not null,            -- VD "Chrome trên Windows"
  last_ip     text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device)
);
