-- Tin nhắn (09/11/2026): người mua nhắn người bán về một tin rao, hoặc nhắn trực tiếp từ hồ sơ.
-- Một hội thoại = hai người (+ tin rao nếu có). a_id < b_id để mỗi cặp (và mỗi tin) chỉ có một hội thoại.
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  a_id            uuid not null references users(id) on delete cascade,
  b_id            uuid not null references users(id) on delete cascade,
  listing_id      uuid references listings(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (a_id < b_id)
);
create unique index conversations_pair on conversations (a_id, b_id, coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on conversations (a_id, last_message_at desc);
create index on conversations (b_id, last_message_at desc);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references users(id) on delete cascade,
  body            text not null check (length(body) between 1 and 2000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index on messages (conversation_id, created_at desc);
create index on messages (sender_id, created_at);
