-- Admin settings: company branding (this install) and Business Central connection.
-- One row. Secrets stay on the server; the client only sees whether they are set.

create table if not exists mesh_settings (
  id integer primary key check (id = 1),
  company_name text not null default 'Requestick',
  tagline text not null default 'Sales board',
  logo_data text not null default '',
  paper text not null default '#efe8dc',
  ink text not null default '#1c1917',
  accent text not null default '#1c1917',
  bc_tenant_id text not null default '',
  bc_environment text not null default 'Production',
  bc_company_id text not null default '',
  bc_company_name text not null default '',
  bc_client_id text not null default '',
  bc_client_secret text not null default '',
  bc_base_url text not null default '',
  bc_basic_user text not null default '',
  bc_basic_password text not null default '',
  updated_at timestamptz not null default now()
);

insert into mesh_settings (id) values (1)
on conflict (id) do nothing;
