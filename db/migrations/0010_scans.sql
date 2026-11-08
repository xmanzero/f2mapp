-- Kết quả quét từ phần mềm f2m-scan (Windows). Phần mềm gửi lên không cần đăng nhập, nhận về mã ngắn + QR;
-- người dùng mở mã trên web / điện thoại (đã đăng nhập) để gắn vào một máy của mình. Mã sống 30 phút, dùng một lần.
create table scans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  report          jsonb not null,               -- dữ liệu thô phần mềm gửi
  result          jsonb not null,               -- đã nhận diện theo danh mục (packages/shared/src/scan.ts)
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  claimed_by      uuid references users(id) on delete set null,
  claimed_machine uuid references machines(id) on delete set null,
  claimed_at      timestamptz
);
create index on scans(expires_at);
