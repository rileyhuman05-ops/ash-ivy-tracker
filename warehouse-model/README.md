# Bayline warehouse model

Canonical Three.js warehouse viewer for Bayline Mesa.

The HTML now lives at **`../server-data/warehouse-site-preview-v3.html`** so it is
not shipped as a static URL. Only `GET /api/viewer` (Cursor Private identity)
reads and serves it. Middleware returns 404 for `/warehouse-model/*` and
`/server-data/*` if those paths are requested directly.

| Location | Notes |
| --- | --- |
| `server-data/warehouse-site-preview-v3.html` | ~1.4MB offline viewer (embedded inventory). Served only after identity check. |

Do not copy this file under `public/`.
