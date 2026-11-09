-- Bảng tin & thông báo (09/11/2026).
-- activities: việc người dùng làm, hiện cho người theo dõi (thêm máy, đổi CPU / card, lên hạng, đăng tin bán, đo hiệu năng đã xác minh).
create table activities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,             -- machine_added | part_changed | tier_up | listing_posted | bench_verified
  target     text,                      -- khóa gộp (VD "<machine_id>:cpu"): các lần đổi liên tiếp trong 30 phút gộp thành một dòng
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on activities(user_id, created_at desc);

-- notifications: báo cho chính người dùng (có người theo dõi, có người thích máy).
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,  -- người nhận
  actor_id   uuid references users(id) on delete cascade,
  kind       text not null,             -- follow | like
  target     text,                      -- like: id máy
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on notifications(user_id, created_at desc);
