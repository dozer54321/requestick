-- Per-install: whether strangers can request a login, or only admins add people.

alter table mesh_settings
  add column if not exists signup_open boolean not null default true;
