-- Tài khoản: đăng nhập bằng số điện thoại (OTP) hoặc Google. Phiên đăng nhập và mã OTP chỉ lưu dạng băm.

-- Một người có thể gắn cả số điện thoại lẫn Google
create table user_identities (
  provider   text not null check (provider in ('phone','google')),
  subject    text not null,            -- số điện thoại dạng +84…, hoặc "sub" của Google
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);
create index on user_identities(user_id);

create table otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz not null default now()
);
create index on otp_codes(phone, created_at desc);

create table sessions (
  token_hash   text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index on sessions(user_id);
