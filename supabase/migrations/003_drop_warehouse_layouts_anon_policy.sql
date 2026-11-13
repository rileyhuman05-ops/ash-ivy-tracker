-- Remove insecure anon open policy (defense in depth).
-- Layout access is only via Next /api/layout with the service role + Cursor SSO.

drop policy if exists warehouse_layouts_anon_all on public.warehouse_layouts;

revoke all on table public.warehouse_layouts from anon, authenticated;
grant all on table public.warehouse_layouts to service_role;
