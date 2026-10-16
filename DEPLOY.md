# Deploying Pune Smile Day (Cloudflare)

Everything runs on Sakal's Cloudflare account, which also hosts esakal.com's
live Workers (`ocean`, `saamtv-youtube`, `beta-reverseproxy`, ...). **Only ever
create, change or delete things named `smileday*`.** Never change the Workers plan.

## What gets created

| Thing | Name | Purpose |
|---|---|---|
| Worker (+ static assets) | `smileday` | Website, API, deletion cron |
| D1 database | `smileday-db` | Photo list and counter; event-update sign-ups (email/phone) |
| R2 bucket | `smileday-photos` | The photos |
| Queue | `smileday-uploads` | Upload rows, written to D1 in batches of 100 |
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
   - Account · Queues · Edit
   - Zone · Workers Routes · Edit
   - Zone · DNS · Edit
   - Account resources: the Sakal account only. Zone resources: `bharatsmitdin.com` only.
3. **Put the token on the deploy machine** without pasting it anywhere else:
   ```powershell
   npm run set-token        # prompts for the token and account id, stores them for your Windows user
   ```
4. **Create the database, bucket and queue** (all near India, so every query stays short):
   ```bash
   npx wrangler d1 create smileday-db --location apac   # copy the database_id into wrangler.toml
   npm run db:init:remote
   npx wrangler r2 bucket create smileday-photos --location apac
   npx wrangler queues create smileday-uploads
   ```
5. **Moderator password** (long and random; share it only with moderators):
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   ```
   Pipe it in from Git Bash (`printf '%s' "$PW" | npx wrangler secret put ADMIN_PASSWORD`), not from
   Windows PowerShell 5.1, whose pipe adds invisible characters so the password never matches. The
   current password is in `MODERATOR-PASSWORD.txt` on the deploy machine (git-ignored).
6. **"Continue with Google"** (optional; without it people type their email). Use a new
   Google Cloud project owned by a Sakal account, not the existing esakal sign-in client:
   - console.cloud.google.com → New project `smileday`.
   - Google Auth Platform → Branding: app name "Pune Smile Day", Sakal logo, support email,
     privacy policy `https://bharatsmitdin.com/privacy.html`, authorised domain `bharatsmitdin.com`.
     Audience: External, then **Publish app** (email/profile scopes need no Google review).
   - Clients → Create client → Web application. Authorised JavaScript origins:
     `https://bharatsmitdin.com`, `https://www.bharatsmitdin.com`, the `workers.dev` URL,
     and `http://localhost` + `http://localhost:8787` for testing. No redirect URIs needed.
   - Copy the client id (`….apps.googleusercontent.com`; it is public, not a secret) into
     `GOOGLE_CLIENT_ID` in `wrangler.toml` **and** `googleClientId` in `public/config.js`.
7. **Deploy:** `npx wrangler deploy`. Test at the `smileday.<subdomain>.workers.dev`
   URL it prints: `BASE=https://… ADMIN=… npm run smoke`.
8. **Domain** (once the zone is active):
   - Uncomment `routes` in `wrangler.toml` and deploy again.
   - `npx wrangler r2 bucket domain add smileday-photos --domain photos.bharatsmitdin.com --zone-id <zone id>`
   - Set `PHOTO_BASE = "https://photos.bharatsmitdin.com/"` in `wrangler.toml` and deploy again.

## Day to day

- Change event text or consent wording: edit `public/config.js` (and bump both consent versions if the
  wording changes), then `npx wrangler deploy`.
- Live logs while debugging: `npx wrangler tail` (not stored).
- Moderation: `https://bharatsmitdin.com/admin.html`.
- Event-update sign-ups: admin page → **Sign-ups** → Download CSV. Unsubscribe or deletion requests
  that reach `ccare@esakal.com`: same tab → Remove person (email or mobile number). Also remove them
  from any list you already imported the CSV into.

## After the event

- From midnight IST on 3 Nov the cron deletes every photo and row (checks every 30 min). Confirm:
  `npx wrangler r2 object list smileday-photos` shows nothing, and the moderator page shows 0.
- **Sign-ups are kept** (until `SIGNUPS_DELETE_AT`, 31 Oct 2027 by default), so leave the Worker and
  `smileday-db` running; the cron empties the `signups` table on that date. The empty R2 bucket and the
  queue cost nothing and can stay.
- Once the sign-ups are gone (or if Sakal decides to end it early: run
  `npx wrangler d1 execute smileday-db --remote --command "DELETE FROM signups"`), remove everything: `npx wrangler delete`, `npx wrangler d1 delete smileday-db`,
  `npx wrangler r2 bucket delete smileday-photos`, `npx wrangler queues delete smileday-uploads`,
  and revoke the `smileday-deploy` token.
