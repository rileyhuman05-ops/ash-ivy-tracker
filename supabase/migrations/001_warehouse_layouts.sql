-- Shared warehouse viewer layout (service-role access only).
-- Cursor Private app authenticates viewers; Next API uses SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.warehouse_layouts (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_sub text,
  updated_by_name text,
  updated_by_email text
);

comment on table public.warehouse_layouts is
  'Bayline warehouse 3D model layout JSON. Written by the Next /api/layout route with the Supabase service role.';

alter table public.warehouse_layouts enable row level security;

-- No policies: anon/authenticated clients cannot read or write.
-- Service role bypasses RLS.

revoke all on table public.warehouse_layouts from anon, authenticated;
grant all on table public.warehouse_layouts to service_role;
