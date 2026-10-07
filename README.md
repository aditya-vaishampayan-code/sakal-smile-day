# Pune Smile Day — Smile Wall & Smile Frame

A phone web app for Pune Smile Day (1 Nov, 9:00 AM). It has two screens:

- **Smile Wall** (`#wall`): every photo taken is pinned up as a tilted polaroid, with a smile counter and a big "Make your Smile Frame" button.
- **Smile Frame camera** (`#camera`): front camera inside the round amber frame, 3-2-1 countdown, then the branded photo (1080×1350 JPEG) with **Add to the Smile Wall**, **Retake**, **Download** and **Share**.

This uses plain HTML, CSS and JS. There's no build step and nothing to install.

## Run it

The camera only works on `https://` or `localhost`.

```bash
cd pune-smile-day
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

To try it on your phone, deploy the folder to any static host (Vercel, Netlify, GitHub Pages, Sakal's own server), or tunnel localhost with `npx localtunnel --port 8080`.

## Files

| File | What it does |
|---|---|
| `index.html` | Both screens' markup |
| `styles.css` | Look and feel, with the colour tokens at the top |
| `config.js` | Event name, date, hashtags, share text, countdown, output size: **edit here** |
| `app.js` | Routing, wall rendering, camera, countdown, frame drawing, save/share |
| `CLAUDE.md` | Context and the next-steps plan for Claude Code |

## Current limitations (prototype)

- **Photos stay on the device** (IndexedDB). Each phone sees only its own wall, so the counter is local too. A shared backend is step 1 in `CLAUDE.md`.
- **No moderation yet.** The deck says "every *approved* photo becomes a tile".
- **[SAKAL LOGO]** is a placeholder.
- **Sharing on desktop:** Share uses the phone's share sheet (WhatsApp, Instagram and so on). Desktop browsers fall back to a download.
