# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Citizens of Pune taking part in Pune Smile Day (1 Nov, 9:00 AM), a Sakal Media Group campaign. They open a shared link on their own phone, mostly on mobile data, take a selfie inside the branded Smile Frame, and share it (WhatsApp, Instagram, X). Setting (street, event booth, or home) is not yet decided; design for all three. Secondary audiences: Sakal stakeholders reviewing the preview, and event screens / a live stream showing the wall.

## Product Purpose
Turn one morning into a city-wide wave of smiles: every citizen makes a branded selfie in seconds, shares it, and sees it join a public Smile Wall with a live smile counter. Success: lots of frames made and shared, #SmileDay trending on X in Pune by 9:15 AM, a wall that looks alive on phones and on the big screen.

## Positioning
A newspaper's civic ritual rather than a photo filter: one city, one morning, one shared wall, counted live.

## Operating Context
- Link opened from WhatsApp/social/print; front camera, 3-second countdown, 1080x1350 JPEG output (4:5, suits Instagram and WhatsApp).
- Wall (`#wall`) and camera (`#camera`) screens; later a `?display=1` big-screen wall and an admin moderation page.
- Hashtags: #SmileDay #PuneSmileDay.

## Capabilities and Constraints
- Plain HTML/CSS/JS, no build step, deployed on Vercel from GitHub. Keep the payload small for mobile data.
- Camera needs https. Must work on iOS Safari and Android Chrome.
- Photos currently stored per device (IndexedDB); a shared backend with moderation (only approved photos public) is planned.
- Event text lives in `config.js`.
- Open: event setting (street / booth / home), exact moderation tooling.

## Brand Commitments
- The Sakal logo must appear (placeholder until the real file is supplied).
- Everything else (palette, type, motifs) is open; the previous cream/amber/smiley look is a draft, not a commitment.

## Evidence on Hand
- No real photos, counts or testimonials yet. Any sample wall tiles or counter numbers in mockups are synthetic and must be labelled or replaced.
- Sakal logo file: not yet supplied.

## Product Principles
1. Seconds from link to shared photo; the camera is the product.
2. The person's face is the hero of the frame, the branding is the signature.
3. The wall must feel alive and collective, never empty.
4. Light enough for crowded mobile networks.

## Accessibility & Inclusion
- English now; Marathi (Devanagari) toggle later, so type choices must have a Devanagari-capable companion.
- Touch targets >= 44px, text contrast >= 4.5:1, respect prefers-reduced-motion.
