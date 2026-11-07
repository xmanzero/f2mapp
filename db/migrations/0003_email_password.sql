-- Đổi cách đăng nhập: email + mật khẩu, hoặc Google. Bỏ đăng nhập bằng số điện thoại (OTP).
alter table users
  add column password_hash     text,          -- scrypt$N$r$p$salt$hash; null = chưa đặt mật khẩu (tài khoản Google)
  add column email_verified_at timestamptz,   -- có khi email được Google xác minh
  add column failed_logins     int not null default 0,
  add column locked_until      timestamptz;

-- email so sánh không phân biệt hoa thường (ứng dụng luôn lưu chữ thường)
create unique index users_email_lower on users (lower(email)) where email is not null;

drop table if exists otp_codes;
delete from user_identities where provider = 'phone';
alter table user_identities drop constraint if exists user_identities_provider_check;
alter table user_identities add constraint user_identities_provider_check check (provider in ('google'));
