-- Chống giả mạo số đo hiệu năng (pcdex-scan 0.6): mã đo dùng một lần máy chủ cấp lúc bắt đầu đo.
-- Bản quét gửi kèm mã; máy chủ kiểm tra mã chưa dùng và đã đủ thời gian để đo thật (mỗi thiết bị ≥ 75 giây).
create table bench_nonces (
  nonce      text primary key,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
create index on bench_nonces(created_at);

-- Mọi số đo đã gắn vào máy (kể cả chưa xác minh) — để quản trị xem và hiệu chỉnh danh mục bằng số đo thật.
create table bench_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  machine_id  uuid references machines(id) on delete set null,
  kind        text not null,              -- cpu | gpu
  part        text,                       -- tên trong danh mục
  raw         text not null,              -- tên Blender báo
  api         text not null,              -- CPU / OPTIX / HIP / ONEAPI / CUDA
  points      integer not null,           -- thang render của app
  expected    integer,
  pct         integer,
  trust       text not null,              -- verified | unverified
  flags       text[] not null default '{}',
  tool        text,
  created_at  timestamptz not null default now()
);
create index on bench_results(kind, part);
