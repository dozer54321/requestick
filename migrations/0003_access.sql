-- Company-only access: role + approval. First existing profile becomes admin
-- so a live preview user is not locked out after this ships.

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
