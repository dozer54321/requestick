-- Idempotent retry of 0003. Preview PGLite can miss an ALTER if the file
-- landed while the process was already up; IF NOT EXISTS makes this safe
-- on a fresh deploy where 0003 already ran.

alter table mesh_profiles
  add column if not exists role text not null default 'member';

alter table mesh_profiles
  add column if not exists access_status text not null default 'pending';

alter table mesh_profiles
  add column if not exists email text not null default '';

update mesh_profiles
set role = 'admin', access_status = 'approved'
where user_id = (
  select user_id from mesh_profiles order by created_at asc limit 1
)
and not exists (
  select 1 from mesh_profiles where role = 'admin'
);
