-- Tin rao có thời hạn: người bán chọn 1–30 ngày; hết hạn thì tin tự hủy (status = 'expired'), linh kiện về kho.
alter table listings add column expires_at timestamptz;
update listings set expires_at = created_at + interval '7 days' where expires_at is null;
alter table listings alter column expires_at set not null;

alter table listings drop constraint if exists listings_status_check;
alter table listings add constraint listings_status_check check (status in ('active','reserved','sold','hidden','expired'));

create index on listings(status, expires_at);
