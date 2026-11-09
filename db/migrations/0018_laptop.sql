-- Laptop (09/11/2026): máy là laptop thì chấm nguyên chiếc (CPU / card / nguồn không thay được),
-- card NVIDIA laptop tính theo TGP thực tế; tên model để hiện thay cho mainboard.
alter table machines add column form_factor text not null default 'desktop' check (form_factor in ('desktop', 'laptop'));
alter table machines add column gpu_tgp_w integer;
alter table machines add column laptop_model text;
