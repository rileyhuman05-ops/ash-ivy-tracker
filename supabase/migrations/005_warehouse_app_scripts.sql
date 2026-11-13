-- Concatenated 3D editor JS for the warehouse viewer.
-- Loaded at runtime via service role (/api/viewer/asset?name=app); split sources are gitignored from the publish pack.

create table if not exists public.warehouse_app_scripts (
  id text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);

comment on table public.warehouse_app_scripts is
  'Bayline warehouse viewer app JS (concatenated). Served by /api/viewer/asset?name=app with the service role.';

alter table public.warehouse_app_scripts enable row level security;

revoke all on table public.warehouse_app_scripts from anon, authenticated;
grant all on table public.warehouse_app_scripts to service_role;

create table if not exists public.warehouse_app_chunks (
  id text not null,
  seq int not null,
  chunk text not null,
  primary key (id, seq)
);

alter table public.warehouse_app_chunks enable row level security;
revoke all on table public.warehouse_app_chunks from anon, authenticated;
grant all on table public.warehouse_app_chunks to service_role;
