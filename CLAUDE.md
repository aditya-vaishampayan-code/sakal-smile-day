# CLAUDE.md — Pune Smile Day

## What this is
This is a mobile web app for **Pune Smile Day**, a Sakal (Sakal Media Group, Pune) citizen campaign on **1 Nov, 9:00 AM**. Citizens open the link on their phone, take a selfie inside a branded round "Smile Frame", share it (WhatsApp, Instagram, X), and it appears on the public **Smile Wall**. Campaign goals from the pitch deck:

- a live smile counter
- every *approved* photo becomes a tile on the wall
- #SmileDay trending on X in Pune by 9:15 AM
- a live stream with a Smile Counter overlay

Hashtags: `#SmileDay` `#PuneSmileDay`.

## Current state (working prototype)
- Plain HTML/CSS/JS, no build step. `index.html` + `styles.css` + `config.js` + `app.js`.
- Hash routing: `#wall` (home) and `#camera`.
- The camera uses `getUserMedia` (front camera, mirrored). The 3-second countdown and the frame are drawn on a `<canvas>` (`composeFrame()` in `app.js`). The output is a 1080×1350 JPEG.
- Photos are stored **locally in IndexedDB** through a tiny `store` object with `list()` and `add(blob)`; `add` also saves a 360 x 450 thumbnail and the wall shows those, 12 at a time. This is the seam for a real backend.
- Share uses the Web Share API with files, and falls back to a download.

## Design system (keep it consistent)
- Source of truth: the Sakal design team's 390 x 844 mockups. Every screen is that artboard; `--u` in `styles.css` is one design pixel (width scale, never below 0.92 of it on short viewports, so the page scrolls rather than shrinks).
- Colours (tokens in `styles.css`, mirrored in `config.js` for the canvas): purple `#5B32A3`, deep purple `#402372`, yellow `#F3C11B`, peach `#FFCCB5`, red `#DA2627` (LIVE tag), white. Camera button gradient runs `#7B4C9F` to `#A85A86` so white text stays above 4.5:1.
- Fonts: Fredoka 600/700 for headings and the frame hashtag, Poppins for body and buttons.
- Assets live in `assets/`: Pune Smile Day logo (SVG), Sakal logo, skyline, emoji stickers, sample photos.
- Motifs: purple background with soft blobs and the Pune skyline, peach-to-purple photo cards with a yellow window and emoji stickers, pill buttons, a camera button you hold and slide right to open the camera (tap still works).
- Mobile first. Touch targets >= 44px. Respect `prefers-reduced-motion`. Text contrast >= 4.5:1.

## Next steps, in priority order
1. **Shared backend.** Replace `store` in `app.js` with API calls, keeping the `list()` / `add(blob)` shape. Suggested stack: Supabase (Storage bucket + `photos` table: id, url, created_at, status) or Firebase (Storage + Firestore). Upload the JPEG, insert a row with `status='pending'`, and have the wall read `status='approved'`, newest first and paginated.
2. **Moderation.** Build a simple password-protected `/admin.html` with approve/reject. Optionally auto-flag images with a moderation API. Nothing reaches the public wall without approval.
3. **Live counter.** Use a realtime subscription (Supabase Realtime or Firestore onSnapshot) to update the count and push new tiles onto the wall without a reload. Format with `en-IN` grouping (2,14,300).
4. **Big-screen wall mode.** Add a `?display=1` variant of the wall for event screens and the live-stream overlay: auto-scroll, larger tiles, the counter in the corner, no button.
5. **Countdown home (pre-event).** Before 1 Nov 9:00 AM IST, show a countdown and a pledge button, per the deck's microsite slide.
6. **Polish.** Use the real Sakal logo (replace `[SAKAL LOGO]`), add a PWA manifest and icons, OG/Twitter share meta, analytics events (frame_made, shared, added_to_wall), and Marathi copy (an i18n toggle).
7. **Privacy.** Show a consent line before upload ("Your photo will appear on the public Smile Wall"), add a delete-my-photo link, and strip EXIF data (the canvas output already does).

## Conventions
- Event text belongs in `config.js`; don't hard-code it in `app.js`.
- If you add a framework, keep the bundle small, because people will use mobile data at the event.
- Test on real iOS Safari and Android Chrome. The camera needs https.
