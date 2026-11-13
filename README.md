# Bayline warehouse

Serves the Bayline Mesa warehouse site model.

## Access (owner-approved for tonight)

- **Cursor Private app** — only the owner (and people they invite in Cursor) can open the URL.
- **No warehouse username/password.** Cursor sign-in is the only gate.
- A boss without Cursor **cannot** open the link while visibility stays Private.
- Warehouse password login can be restored later; helpers remain in `lib/auth.js` unused.

## Layout

| Path | Role |
| --- | --- |
| `/` | Redirects to the model |
| `/api/viewer` | Serves the HTML after Cursor identity check |
| `warehouse-model/` | Canonical HTML |

## Publish

Keep visibility **Private** unless the owner explicitly chooses Public.
