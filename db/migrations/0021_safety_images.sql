-- Chặn / báo cáo người dùng, ảnh trong tin nhắn (09/11/2026).

-- Chặn: hai bên không nhắn tin, không theo dõi được nhau (chặn thì gỡ các lượt theo dõi giữa hai người)
create table user_blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on user_blocks(blocked_id);

-- Báo cáo: quản trị viên chỉ đọc được hội thoại khi hội thoại đó bị báo cáo
create table reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references users(id) on delete set null,
  target_id       uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  reason          text not null check (reason in ('spam', 'scam', 'harassment', 'inappropriate', 'other')),
  note            text,
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at      timestamptz not null default now(),
  resolved_by     uuid references users(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text
);
create index on reports(status, created_at desc);
create index on reports(target_id);

-- Ảnh trong tin nhắn: WebP ≤ 1600 px, bỏ metadata; chỉ người trong hội thoại (và quản trị viên khi bị báo cáo) xem được
create table message_images (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  uploader_id     uuid not null references users(id) on delete cascade,
  data            bytea not null,
  width           integer not null,
  height          integer not null,
  size_bytes      integer not null,
  created_at      timestamptz not null default now()
);
alter table messages add column image_id uuid references message_images(id) on delete set null;
-- tin chỉ có ảnh thì nội dung chữ trống
alter table messages drop constraint messages_body_check;
alter table messages add constraint messages_body_check check (length(body) <= 2000 and (length(body) > 0 or image_id is not null));
