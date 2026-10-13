# Deploying Pune Smile Day (Cloudflare)

Everything runs on Sakal's Cloudflare account, which also hosts esakal.com's
live Workers (`ocean`, `saamtv-youtube`, `beta-reverseproxy`, ...). **Only ever
create, change or delete things named `smileday*`.** Never change the Workers plan.

## What gets created

| Thing | Name | Purpose |
|---|---|---|
| Worker (+ static assets) | `smileday` | Website, API, deletion cron |
| D1 database | `smileday-db` | Photo list and counter (no personal data) |
| R2 bucket | `smileday-photos` | The photos |
| Zone | `bharatsmitdin.com` | Domain DNS (free zone plan) |
| R2 custom domain | `photos.bharatsmitdin.com` | Cached photo delivery |

## One-time setup

1. **Domain on Cloudflare.** Add `bharatsmitdin.com` as a domain (Free plan), and have
   Dimakh Consulting switch the nameservers to the two Cloudflare ones. Wait for the
   "domain is active" email.
2. **API token** (Profile → API Tokens → Create Token → Custom token), named `smileday-deploy`,
   expiring 10 Nov 2026:
   - Account · Workers Scripts · Edit
   - Account · Workers R2 Storage · Edit
   - Account · D1 · Edit
   - Zone · Workers Routes · Edit
   - Zone · DNS · Edit
   - Account resources: the Sakal account only. Zone resources: `bharatsmitdin.com` only.
3. **Put the token on the deploy machine** without pasting it anywhere else:
   ```powershell
   npm run set-token        # prompts for the token and account id, stores them for your Windows user
   ```
4. **Create the database and bucket:**
   ```bash
   npx wrangler d1 create smileday-db          # copy the database_id into wrangler.toml
   npm run db:init:remote
   npx wrangler r2 bucket create smileday-photos --location apac
   ```
5. **Moderator password** (long and random; share it only with moderators):
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   ```
6. **Deploy:** `npx wrangler deploy`. Test at the `smileday.<subdomain>.workers.dev`
   URL it prints: `BASE=https://… ADMIN=… npm run smoke`.
7. **Domain** (once the zone is active):
   - Uncomment `routes` in `wrangler.toml` and deploy again.
   - `npx wrangler r2 bucket domain add smileday-photos --domain photos.bharatsmitdin.com --zone-id <zone id>`
   - Set `PHOTO_BASE = "https://photos.bharatsmitdin.com/"` in `wrangler.toml` and deploy again.

## Day to day

- Change event text or consent wording: edit `public/config.js` (and bump both consent versions if the
  wording changes), then `npx wrangler deploy`.
- Live logs while debugging: `npx wrangler tail` (not stored).
- Moderation: `https://bharatsmitdin.com/admin.html`.

## After the event

- From midnight IST on 3 Nov the cron deletes every photo and row (checks every 30 min). Confirm:
  `npx wrangler r2 object list smileday-photos` shows nothing, and the moderator page shows 0.
- Then remove everything: `npx wrangler delete`, `npx wrangler d1 delete smileday-db`,
  `npx wrangler r2 bucket delete smileday-photos`, and revoke the `smileday-deploy` token.
