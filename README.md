# Bayline warehouse

Serves the Bayline Mesa warehouse site model with **shared cloud layout persistence**.

## Access

- **Cursor Private app** — only people who can open the Private app URL can view or edit.
- **No warehouse username/password.** Cursor sign-in is the only gate.
- Layout API (`/api/layout`) also requires Cursor identity (`requireIdentity`).

## Persistence

Edits in the 3D viewer (racks, areas, equipment, containers, SKUs, settings) **autosave** to Supabase after each commit, and **reload on refresh**.

| Piece | Role |
| --- | --- |
| `SUPABASE_URL` | Project API URL (Cursor Secret) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server only**, never in the browser |
| `warehouse_layouts` table | One shared JSON document (`bayline-mesa`; preview hosts use `bayline-mesa-preview`) |
| `GET/PUT /api/layout` | Load/save after Cursor identity check |
| File download/load | Optional backup in the More tab |

Schema: `supabase/migrations/001_warehouse_layouts.sql` (RLS on, no anon policies; service role only).

## Layout

| Path | Role |
| --- | --- |
| `/` | Redirects to the model |
| `/api/viewer` | Serves HTML after Cursor identity check |
| `/api/layout` | Shared layout load/save (size-capped body) |
| `server-data/` | Server-only HTML (not a public URL; middleware 404s direct paths) |

## Local smoke

```bash
npm install
# Optional for persistence locally:
# export SUPABASE_URL=...
# export SUPABASE_SERVICE_ROLE_KEY=...
npm run dev
```

Without Supabase secrets, the viewer still opens (simulated Cursor identity in `cursor/identity.dev.js`) but shows “Cloud save not configured”.

## Publish

1. Ensure Supabase project `ogdmwufazgvpruzeiezf` is **Active** (unpause if needed).
2. Apply migration if not already applied.
3. Bind secrets `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for this app; set values in Cursor Secrets.
4. Merge this branch → `publish-app` for **bayline-warehouse**, keep visibility **Private**.
