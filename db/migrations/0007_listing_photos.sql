-- Ảnh linh kiện do người bán đăng: tối đa 5 ảnh / tin (kiểm ở API). Lưu thẳng trong Postgres (ảnh đã thu nhỏ ở trình duyệt,
-- thường 100–400 KB) để sao lưu DB là đủ, xóa tin là mất ảnh theo.
create table listing_photos (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  position   int not null default 0,
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null,
  data       bytea not null,
  created_at timestamptz not null default now()
);
create index on listing_photos(listing_id, position);
