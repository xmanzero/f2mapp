-- Thương hiệu sửa được trong trang quản trị: logo (nền tối / nền sáng), favicon.
-- Chữ (tên web, slogan, mô tả) nằm ở app_settings key "branding". Không có dòng = dùng bộ mặc định trong mã web (PCDEX Brand Kit).
create table brand_assets (
  kind       text primary key check (kind in ('logo', 'logo_light', 'favicon')),
  mime       text not null,             -- image/svg+xml | image/webp | image/png
  data       bytea not null,
  width      int not null,
  height     int not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
