# Bayline warehouse (password-gated)

Cursor Cloud app that serves the Bayline Mesa warehouse site model only after a username + password check. Credentials come from environment secrets — nothing is hardcoded in the repo.

## Secrets

| Name | Purpose |
| --- | --- |
| `WAREHOUSE_USERNAME` | Primary login username (`Riley.Human`) |
| `WAREHOUSE_PASSWORD` | Primary login password |
| `WAREHOUSE_USERNAME_2` | Second login username (`Nexstar2026`) — optional if only `WAREHOUSE_PASSWORD_2` is set |
| `WAREHOUSE_PASSWORD_2` | Second login password |
| `WAREHOUSE_USERS` | Optional JSON array of `{username,password}` for more accounts |

Accounts supported in the UI: **Riley.Human** and **Nexstar2026**.

Set values in **Cursor Secrets**. Do not commit values. Never paste passwords into chat.

## Local smoke

```bash
npm install
npm run dev
```

With `npm run dev` and secrets unset, sign in as `preview` / `preview`. Production/`next start` and hosted runtimes require real `WAREHOUSE_*` secrets (no placeholder).

## Layout

| Path | Role |
| --- | --- |
| `/` | Login form |
| `/viewer` | Authenticated iframe shell |
| `/api/viewer` | Serves `warehouse-model/warehouse-site-preview-v3.html` after session check |
| `warehouse-model/` | Canonical HTML + notes |
| `legacy-tracker/` | Not shipped — README only; old tracker HTML removed from publish bundle |

## Publish

Use Cursor `publish-app` from this repo root. Prefer **private** or **team** visibility in the publish dialog; the login gate still applies for public visibility.
