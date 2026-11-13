-- Optional fallback if the app secret is the anon JWT instead of service_role.
-- Access remains gated by Cursor Private SSO in /api/layout; keys stay server-only.
create policy warehouse_layouts_anon_all
  on public.warehouse_layouts
  for all
  to anon
  using (true)
  with check (true);
