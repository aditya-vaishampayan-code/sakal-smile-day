# CLAUDE.md — Pune Smile Day

## What this is
This is a mobile web app for **Pune Smile Day**, a Sakal (Sakal Media Group, Pune) citizen campaign on **1 Nov, 9:00 AM**. Citizens open the link on their phone, take a selfie inside a branded round "Smile Frame", share it (WhatsApp, Instagram, X), and it appears on the public **Smile Wall**. Campaign goals from the pitch deck:

- a live smile counter
- every *approved* photo becomes a tile on the wall
- #SmileDay trending on X in Pune by 9:15 AM
- a live stream with a Smile Counter overlay

Hashtags: `#SmileDay` `#PuneSmileDay`.

## Current state
- Plain HTML/CSS/JS in `public/`, no build step: `index.html` + `styles.css` + `config.js` + `app.js`, plus `admin.html` (moderation) and `privacy.html` (DPDP notice, draft for Sakal legal).
- Hosting: one Cloudflare Worker named `smileday` on Sakal's Cloudflare account (`wrangler.toml`). Static files in `public/` are served as Workers Static Assets; `worker/index.js` handles `/api/*` and `/p/*`. Photos in R2 (`smileday-photos`), rows in D1 (`smileday-db`, schema in `worker/schema.sql`), uploads buffered through a Queue (`smileday-uploads`). The account also runs esakal.com's live Workers: only ever touch resources named `smileday*`.
- Hash routing: `#wall` (home) and `#camera`.
- The camera uses `getUserMedia` (front camera, mirrored). The 3-second countdown and the frame are drawn on a `<canvas>` (`composeFrame()` in `app.js`). Share/download get a 1080×1350 JPEG; the wall gets a 540×675 copy (`CFG.upload`).
- Upload flow: "Add to the Smile Wall" opens a consent sheet (two tick-boxes, wording in `config.js`), then `POST /api/photos` (the app retries quietly on network errors and 5xx, `CFG.uploadRetryMs`). No pre-approval: photos go straight up. The upload never touches D1: the photo goes to R2 and its row onto the `smileday-uploads` Queue, and `queue()` in the Worker writes rows 100 per transaction (a trigger in `schema.sql` bumps the counter), so photos reach the wall ~2 s later. The server returns a delete token, kept in localStorage (`smileday-mine`) so that phone can delete its photo. Anyone can report a photo; 5 reports auto-hide it. Moderators remove photos at `/admin.html` (password = Worker secret `ADMIN_PASSWORD`).
- The wall pages through `/api/wall` 24 at a time and polls the first page every 30 s for new photos and the count (first page is edge-cached 10 s). The counter lives in a `stats` row, never a `COUNT(*)`.
- Event-update sign-ups (first-party data): after a photo is added (once per phone, `smileday-signup` in localStorage) and from "Get event updates" in the footer, a sheet takes an email and/or Indian mobile number, with an unticked consent box (wording in `config.js`, `SIGNUP_CONSENT_VERSION` must match `signupConsentVersion`). "Continue with Google" (One Tap + button, script loaded only when the sheet opens, hidden in app webviews) just fills in a verified email; the Worker checks the Google ID token itself (`verifyGoogle()`) and stores only the email. `POST /api/signups` upserts into the `signups` table (straight to D1, not the queue). Moderators download a CSV and remove people at `/admin.html` → Sign-ups. `GOOGLE_CLIENT_ID` (wrangler.toml) must match `googleClientId` (config.js); empty hides the Google button.
- Deadlines (`wrangler.toml` vars): uploads close `CLOSE_AT` (2 Nov 11:30 PM IST); a cron every 30 min wipes all photos and rows once `DELETE_AT` (3 Nov 00:00 IST) has passed. Sign-ups are not part of that wipe: the same cron empties `signups` after `SIGNUPS_DELETE_AT` (1 Nov 2027 00:00 IST, placeholder until Sakal legal confirms; `privacy.html` and `config.js` repeat the date). Worker logs are off on purpose.
- `CONSENT_VERSION` in `wrangler.toml` must match `consentVersion` in `config.js`.
- Local testing: `npx wrangler dev` (needs a current Visual C++ runtime on Windows), or `node test/dev-server.mjs`, which runs the same Worker in Node with node:sqlite and in-memory R2. `npm run smoke` runs the API checks against either (or a deployed URL with `BASE=`/`ADMIN=`). Deploy steps: `DEPLOY.md`.

## Design system (keep it consistent)
- Source of truth: the Sakal design team's 390 x 844 mockups. Every screen is that artboard; `--u` in `styles.css` is one design pixel (width scale, never below 0.92 of it on short viewports, so the page scrolls rather than shrinks). From 768px wide and 600px tall (tablets) the home screen reflows with grid (one column in portrait, logo left and wall right in landscape) and the camera artboard scales up to fit the height; see the Tablets block near the end of `styles.css`. Sheets (consent, confirm, your photos) and the toast sit outside the artboard and use plain px.
- Colours (tokens in `styles.css`, mirrored in `config.js` for the canvas): purple `#5B32A3`, deep purple `#402372`, yellow `#F3C11B`, peach `#FFCCB5`, red `#DA2627` (LIVE tag), white. Camera button gradient runs `#7B4C9F` to `#A85A86` so white text stays above 4.5:1.
- Fonts: Fredoka 600/700 for headings and the frame hashtag, Poppins for body and buttons.
- Assets live in `public/assets/`: Pune Smile Day logo (SVG), Sakal logo, skyline, emoji stickers, sample photos.
- Motifs: purple background with soft blobs and the Pune skyline, peach-to-purple photo cards with a yellow window and emoji stickers, pill buttons, a camera button you hold and slide right to open the camera (tap still works).
- Mobile first. Touch targets >= 44px. Respect `prefers-reduced-motion`. Text contrast >= 4.5:1.

## Next steps, in priority order
Done: shared backend, moderation (remove after posting, per Sakal), live counter and wall polling, consent + delete-my-photo + deletion deadline.
1. **Go live**: see `DEPLOY.md` (domain onto Cloudflare, D1/R2 created, `ADMIN_PASSWORD` secret, custom domains, `PHOTO_BASE`).
2. **Load test** before 1 Nov against the deployed Worker.
3. **Countdown home (pre-event).** Uploads are open now, but a countdown to 1 Nov 9:00 AM IST and a pledge button could sit above the wall, per the deck's microsite slide.
4. **Big-screen wall mode.** A `?display=1` variant for event screens: auto-scroll, larger tiles, the counter in the corner, no button. (No live stream is planned.)
5. **Polish.** PWA manifest and icons, OG/Twitter share meta, analytics events (frame_made, shared, added_to_wall), and Marathi copy (an i18n toggle).

## Conventions
- Event text belongs in `public/config.js`; don't hard-code it in `app.js`.
- Every photo must be gone by 3 Nov 2026 (DPDP promise in `privacy.html`). Don't add logging, backups or copies of photos anywhere else.
- Sign-ups are separate consent: never make them a condition of adding a photo, never pre-tick the box, never link a sign-up row to a photo, and use them only for event updates (what people agreed to).
- If you add a framework, keep the bundle small, because people will use mobile data at the event.
- Test on real iOS Safari and Android Chrome. The camera needs https.
