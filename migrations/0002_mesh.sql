-- Mesh: shared sales-desk board for open-ticket guns and parts.
-- Rows are team-visible to any signed-in user; created_by / claimed_by / filled_by
-- are Better Auth user ids (text). No bulk wipe.

create table if not exists mesh_profiles (
  user_id text primary key,
  display_name text not null,
  extension text not null default '',
  cell text not null default '',
  alerts_on boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mesh_needs (
  id serial primary key,
  created_by text not null,
  part_number text not null,
  description text not null,
  ticket_number text not null default '',
  qty integer not null default 1,
  priority text not null default 'today',
  notes text not null default '',
  status text not null default 'open',
  claimed_by text,
  claimed_at timestamptz,
  filled_by text,
  filled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mesh_needs_status_created_idx
  on mesh_needs (status, created_at desc);

create index if not exists mesh_needs_part_idx
  on mesh_needs (part_number);

create index if not exists mesh_needs_updated_idx
  on mesh_needs (updated_at desc);
