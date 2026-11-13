# Legacy Ash & Ivy delivery tracker — not shipped

The previous root `index.html` delivery tracker is **not included** in the Cursor publish bundle for the Bayline warehouse app.

Reasons: it embedded a live Supabase URL and anon JWT in client JavaScript, was reachable without the warehouse login gate, and could load/modify live order data.

To recover the last checked-in HTML, use git history on this branch (commit before the security fix) or earlier `main` commits that still had root `index.html`.

Do not re-add a tracker HTML file here unless credentials come only from server-side secrets and every route is behind warehouse auth.
