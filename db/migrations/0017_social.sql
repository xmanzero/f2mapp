-- Cộng đồng (09/11/2026): theo dõi người dùng, thích cấu hình máy. Không có bình luận.
create table follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on follows(followee_id);

create table machine_likes (
  user_id    uuid not null references users(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, machine_id)
);
create index on machine_likes(machine_id);
