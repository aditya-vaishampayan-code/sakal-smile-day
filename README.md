# Pune Smile Day — Smile Wall & Smile Frame

A phone web app for Pune Smile Day (1 Nov, 9:00 AM). It has two screens:

- **Smile Wall** (`#wall`): every photo taken is pinned up as a tilted polaroid, with a smile counter and a big "Make your Smile Frame" button.
- **Smile Frame camera** (`#camera`): front camera inside the round amber frame, 3-2-1 countdown, then the branded photo (1080×1350 JPEG) with **Add to the Smile Wall**, **Retake**, **Download** and **Share**.

The site is plain HTML, CSS and JS in `public/` (no build step). It runs on one Cloudflare Worker: photos in R2, the photo list in D1. See `DEPLOY.md` to put it online.

## Run it locally

The camera only works on `https://` or `localhost`.

```bash
npm install
npm run db:init:local && npm run dev      # real Cloudflare runtime on http://localhost:8787
node test/dev-server.mjs                  # or: same Worker in plain Node (no Visual C++ runtime needed)
npm run smoke                             # API checks against :8787
```

Local admin password: whatever `ADMIN_PASSWORD` is in `.dev.vars` (not committed).

## Files

| File | What it does |
|---|---|
| `public/index.html` | Both screens, plus the consent / confirm / your-photos sheets |
| `public/styles.css` | Look and feel, with the colour tokens at the top |
| `public/config.js` | Event text, consent wording, upload size, poll interval: **edit here** |
| `public/app.js` | Routing, wall, camera, countdown, frame drawing, share, upload, delete/report |
| `public/admin.html` | Moderator page: latest, reported and auto-hidden photos; remove/restore |
| `public/privacy.html` | DPDP privacy notice (draft for Sakal legal) |
| `worker/index.js` | The API: upload, wall, delete-own, report, admin, deletion cron |
| `worker/schema.sql` | D1 tables |
| `wrangler.toml` | Cloudflare config: bindings, deadlines, consent version |
| `test/` | `smoke.mjs` API checks, `dev-server.mjs` Node runner |
| `CLAUDE.md` | Context and next steps for Claude Code |

## Limits to know

- Uploads close at 11:30 PM IST on 2 Nov; every photo is deleted from midnight IST on 3 Nov.
- No pre-approval: photos go straight up. Moderators remove offensive ones at `/admin.html`; 5 citizen reports hide a photo automatically.
- A photo can only be deleted by the citizen from the phone that added it (or by a moderator, if they email ccare@esakal.com).
- **Sharing on desktop:** Share uses the phone's share sheet. Desktop browsers fall back to a download.
