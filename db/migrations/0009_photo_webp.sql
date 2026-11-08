-- Ảnh tin rao: máy chủ đổi sang WebP và đóng dấu "F2m". Ảnh đăng trước đó (processed = false) được xử lý lại lúc API khởi động.
alter table listing_photos add column processed boolean not null default false;
