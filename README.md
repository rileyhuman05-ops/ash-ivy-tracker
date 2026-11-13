# Bayline warehouse

Cursor Cloud app that serves the Bayline Mesa warehouse site model.

## Access (tonight)

**Username/password login is temporarily disabled.** Opening the app serves the 3D model directly. Auth helpers remain under `lib/auth.js` for a later re-enable.

## Secrets (optional / future auth)

| Name | Purpose |
| --- | --- |
| `WAREHOUSE_USERNAME` / `WAREHOUSE_PASSWORD` | Primary account (Riley.Human) when auth is re-enabled |
| `WAREHOUSE_USERNAME_2` / `WAREHOUSE_PASSWORD_2` | Second account (Nexstar2026) when auth is re-enabled |

## Layout

| Path | Role |
| --- | --- |
| `/` | Redirects to the model |
| `/api/viewer` | Serves `warehouse-model/warehouse-site-preview-v3.html` |
| `warehouse-model/` | Canonical HTML |

## Publish

Use Cursor `publish-app` from this repo root. Prefer **private** or **team** visibility.
