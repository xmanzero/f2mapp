-- Schema khởi đầu: người dùng, danh mục linh kiện, máy + linh kiện trong máy, điểm, tin rao.
create extension if not exists pgcrypto;

create table users (
  id           uuid primary key default gen_random_uuid(),
  handle       text not null unique,               -- tên hiển thị trong URL hồ sơ
  display_name text not null,
  phone        text unique,
  email        text unique,
  province     text,                               -- tỉnh/thành, để lọc tin rao gần
  created_at   timestamptz not null default now()
);

-- Danh mục linh kiện. Thông số và điểm để jsonb vì mỗi loại một khác; nạp từ packages/shared/src/data/parts.json.
create table parts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('cpu','gpu','ram','storage','motherboard','psu','case','cooler')),
  name          text not null,
  brand         text,
  release_year  int,
  specs         jsonb not null default '{}',
  scores        jsonb not null default '{}',
  scale_version text,
  unique (kind, name)
);

create table machines (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  name          text not null default 'Máy của tôi',
  is_primary    boolean not null default false,  -- máy dùng để xếp hạng
  ram_gb        int not null,
  ram_channels  int not null check (ram_channels in (1,2)),
  storage       text not null check (storage in ('hdd','sata','nvme3','nvme4','nvme5')),
  pcie_gen      int not null check (pcie_gen in (3,4,5)),
  psu_w         int not null,
  resolution    int not null check (resolution in (1080,1440,2160)),
  verified_at   timestamptz,                       -- có khi chạy tool xác minh
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index machines_one_primary on machines(owner_id) where is_primary;

-- Linh kiện trong máy; khi thay thì giữ lại với status 'replaced' để gợi ý đăng bán
create table machine_parts (
  id          uuid primary key default gen_random_uuid(),
  machine_id  uuid not null references machines(id) on delete cascade,
  part_id     uuid not null references parts(id),
  quantity    int not null default 1,
  status      text not null default 'in_use' check (status in ('in_use','replaced','for_sale','sold')),
  added_at    timestamptz not null default now()
);
create index on machine_parts(machine_id);

-- Điểm lưu kèm phiên bản thang điểm (đổi công thức thì tính lại, không ghi đè lịch sử)
create table machine_scores (
  machine_id    uuid not null references machines(id) on delete cascade,
  scale_version text not null,
  gaming        int not null,
  render        int not null,
  ai            int not null,
  office        int not null,
  power         int not null,
  tier          text not null,
  badges        text[] not null default '{}',
  computed_at   timestamptz not null default now(),
  primary key (machine_id, scale_version)
);
create index on machine_scores(scale_version, power desc);

create table listings (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references users(id) on delete cascade,
  part_id         uuid not null references parts(id),
  machine_part_id uuid references machine_parts(id),   -- rao từ linh kiện trong máy của mình
  price_vnd       bigint not null check (price_vnd > 0),
  condition       text not null check (condition in ('new','like_new','used','for_parts')),
  warranty_months int,
  province        text,
  description     text,
  status          text not null default 'active' check (status in ('active','reserved','sold','hidden')),
  created_at      timestamptz not null default now()
);
create index on listings(part_id, status);
create index on listings(status, created_at desc);
