-- Cấu hình chi tiết: mọi linh kiện trong máy (CPU, card, mainboard, RAM, ổ cứng, nguồn) là một dòng machine_parts.
-- Tin rao chỉ đăng được từ linh kiện người bán sở hữu. Xác thực = phần mềm quét máy đã thấy linh kiện đó.
alter table machine_parts
  alter column part_id drop not null,
  add column kind        text,
  add column label       text,
  add column details     jsonb not null default '{}',
  add column verified_at timestamptz,          -- lần quét gần nhất thấy linh kiện này; null = chưa xác thực
  add column replaced_at timestamptz;

update machine_parts mp set kind = p.kind, label = p.name from parts p where p.id = mp.part_id;

alter table machine_parts
  alter column kind set not null,
  alter column label set not null,
  add constraint machine_parts_kind_check check (kind in ('cpu','gpu','mainboard','ram','storage','psu')),
  add constraint machine_parts_catalog check (kind not in ('cpu','gpu') or part_id is not null);

alter table machines add column last_scan_at timestamptz;

alter table listings drop constraint if exists listings_kind_check;
alter table listings add constraint listings_kind_check check (kind in ('cpu','gpu','mainboard','ram','storage','psu','other'));
alter table listings add column part_was_in_use boolean not null default false;
-- tin mới bắt buộc gắn với linh kiện của người bán (tin cũ, nếu có, giữ nguyên)
alter table listings add constraint listings_owned_part check (machine_part_id is not null) not valid;
-- mỗi linh kiện chỉ có một tin đang bán
create unique index listings_one_active_per_part on listings(machine_part_id) where status in ('active','reserved') and machine_part_id is not null;
