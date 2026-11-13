-- Fishbowl/site seed JSON for the 3D viewer.
-- Loaded at runtime via service role (/api/viewer/asset); not packed into the app for publish review.

create table if not exists public.warehouse_seeds (
  id text primary key,
  body jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.warehouse_seeds is
  'Bayline warehouse Fishbowl seed (rb/parts/pack). Served by /api/viewer/asset with the service role.';

alter table public.warehouse_seeds enable row level security;

revoke all on table public.warehouse_seeds from anon, authenticated;
grant all on table public.warehouse_seeds to service_role;

create table if not exists public.warehouse_seed_chunks (
  id text not null,
  seq int not null,
  chunk text not null,
  primary key (id, seq)
);

alter table public.warehouse_seed_chunks enable row level security;
revoke all on table public.warehouse_seed_chunks from anon, authenticated;
grant all on table public.warehouse_seed_chunks to service_role;
