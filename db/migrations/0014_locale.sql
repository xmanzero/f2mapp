-- Đa ngôn ngữ: ngôn ngữ của người dùng (giao diện, email) và mẫu thư theo ngôn ngữ.
alter table users add column locale text not null default 'vi' check (locale in ('vi', 'en'));

-- Mẫu thư đã sửa: mỗi ngôn ngữ một bản. Dòng cũ là bản tiếng Việt.
alter table email_templates add column lang text not null default 'vi' check (lang in ('vi', 'en'));
alter table email_templates drop constraint email_templates_pkey;
alter table email_templates add primary key (key, lang);
