-- Tin rao bán linh kiện. Card/CPU gắn với danh mục (part_id) để tính điểm; RAM, ổ, linh kiện khác nhập tên (title).
alter table listings
  alter column part_id drop not null,
  add column kind       text not null default 'other' check (kind in ('gpu','cpu','ram','storage','other')),
  add column title      text,                     -- tên tự nhập khi không có trong danh mục
  add column contact    text,                     -- Zalo / số điện thoại; chỉ hiện cho người đã đăng nhập
  add column updated_at timestamptz not null default now(),
  add column sold_at    timestamptz,
  add constraint listings_has_item check (part_id is not null or title is not null);

alter table listings alter column kind drop default;
create index on listings(seller_id, status);
create index on listings(kind, status, created_at desc);
