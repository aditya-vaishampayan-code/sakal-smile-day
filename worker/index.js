/* Pune Smile Day — Cloudflare Worker.
 * Static files in public/ are served by Workers Static Assets before this code
 * runs; only /api/* and /p/* reach the Worker.
 *
 *   GET    /api/wall?before=<id>          public wall page + live count
 *   POST   /api/photos                    upload one JPEG (body = image/jpeg); on the wall a few seconds later
 *   DELETE /api/photos/<id>               uploader deletes own photo (X-Delete-Token)
 *   POST   /api/photos/<id>/report        anyone flags a photo
 *   POST   /api/signups                   event-update sign-up (JSON: consent, email|credential, phone)
 *   GET    /p/<id>.jpg                    photo bytes (when PHOTO_BASE is not set)
 *   GET    /api/admin/photos?view=&offset=&at=  moderator list (Authorization: Bearer <password>)
 *   DELETE /api/admin/photos/<id>         moderator removes a photo for good
 *   POST   /api/admin/photos/<id>/restore moderator restores an auto-hidden photo
 *   GET    /api/admin/signups             sign-up count
 *   GET    /api/admin/signups.csv         every sign-up as CSV
 *   DELETE /api/admin/signups?contact=    remove one person (email or mobile number)
 *
 * Uploads never touch D1: the photo goes to R2 and its row goes onto the
 * UPLOADS queue, and queue() writes rows 100 at a time. D1 runs writes one at
 * a time, so batching is what lets a 9:00 AM spike through.
 *
 * Bindings (wrangler.toml): DB (D1), PHOTOS (R2), UPLOADS (Queue), ASSETS, rate limiters.
 * Secret: ADMIN_PASSWORD.
 *
 * Sign-ups are written straight to D1 (one small upsert each; far fewer than
 * photos). With Google, only the email inside a verified ID token is stored.
 */

const WALL_PAGE = 24;
const ADMIN_PAGE = 60;
const MAX_UPLOAD = 400 * 1024;          // the app sends ~60-120 KB; leave headroom
const ID_RE = /^[0-9a-z]{17}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, ctx, url);
      if (url.pathname.startsWith('/p/')) return await photo(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err && err.stack || err);
      return json({ error: 'server_error' }, 500);
    }
  },

  /* Writes queued uploads to D1, up to 100 rows in one transaction. A trigger
   * (schema.sql) bumps the counter per row, and INSERT OR IGNORE makes a
   * redelivered batch harmless. Throwing retries the whole batch. */
  async queue(batch, env) {
    if (Date.now() >= Date.parse(env.DELETE_AT)) return;
    const msgs = batch.messages.map((m) => m.body);
    await env.DB.batch(msgs.map((p) =>
      env.DB.prepare(`INSERT OR IGNORE INTO photos (id, created_at, delete_hash, consent) VALUES (?, ?, ?, ?)`)
        .bind(p.id, p.createdAt, p.deleteHash, p.consent)));
    // An owner can delete a photo before its row is written; drop those rows again.
    const gone = await Promise.all(msgs.map(async (p) => ((await env.PHOTOS.head(`${p.id}.jpg`)) ? null : p.id)));
    for (const id of gone.filter(Boolean)) {
      const row = await env.DB.prepare(`DELETE FROM photos WHERE id = ? RETURNING status`).bind(id).first();
      if (row && row.status === 'visible') await decrement(env);
    }
  },

  /* Runs every 30 minutes. After DELETE_AT, wipes every photo and row; after
   * SIGNUPS_DELETE_AT, every sign-up too. */
  async scheduled(_event, env, ctx) {
    if (Date.now() >= Date.parse(env.DELETE_AT)) ctx.waitUntil(purgeAll(env));
    if (signupsOver(env)) ctx.waitUntil(env.DB.prepare(`DELETE FROM signups`).run());
  }
};

/* ---------------- Routing ---------------- */

async function api(request, env, ctx, url) {
  const parts = url.pathname.split('/').filter(Boolean);   // ['api', ...]
  const m = request.method;

  if (parts[1] === 'wall' && parts.length === 2 && m === 'GET') return wall(request, env, ctx, url);

  if (parts[1] === 'photos') {
    if (parts.length === 2 && m === 'POST') return upload(request, env);
    const id = parts[2];
    if (!ID_RE.test(id || '')) return json({ error: 'not_found' }, 404);
    if (parts.length === 3 && m === 'DELETE') return deleteOwn(request, env, id);
    if (parts.length === 4 && parts[3] === 'report' && m === 'POST') return report(request, env, id);
  }

  if (parts[1] === 'signups' && parts.length === 2 && m === 'POST') return signup(request, env);

  if (parts[1] === 'admin') {
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    if (parts[2] === 'signups' && parts.length === 3 && m === 'GET') return adminSignupCount(env);
    if (parts[2] === 'signups.csv' && parts.length === 3 && m === 'GET') return adminSignupCsv(env);
    if (parts[2] === 'signups' && parts.length === 3 && m === 'DELETE') return adminSignupRemove(env, url);
    if (parts[2] === 'photos' && parts.length === 3 && m === 'GET') return adminList(env, url);
    const id = parts[3];
    if (parts[2] === 'photos' && ID_RE.test(id || '')) {
      if (parts.length === 4 && m === 'DELETE') return adminRemove(env, id);
      if (parts.length === 5 && parts[4] === 'restore' && m === 'POST') return adminRestore(env, id);
    }
  }

  return json({ error: 'not_found' }, 404);
}

/* ---------------- Public ---------------- */

async function wall(request, env, ctx, url) {
  const before = url.searchParams.get('before');
  if (before && !ID_RE.test(before)) return json({ error: 'bad_request' }, 400);

  // Every phone polls the first page, so cache it at the edge for a few seconds.
  // (The Cache API is a no-op on *.workers.dev, which is fine for testing.)
  const cache = caches.default;
  const key = new Request(`${url.origin}/api/wall${before ? `?before=${before}` : ''}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const deleted = Date.now() >= Date.parse(env.DELETE_AT);
  const [rows, stats] = deleted ? [{ results: [] }, null] : await env.DB.batch([
    env.DB.prepare(`SELECT id FROM photos WHERE status = 'visible' AND id < ? ORDER BY id DESC LIMIT ?`)
      .bind(before || '~', WALL_PAGE),
    env.DB.prepare(`SELECT n FROM stats WHERE key = 'visible'`)
  ]);
  const photos = rows.results.map((r) => ({ id: r.id, url: photoUrl(env, r.id) }));
  const body = {
    photos,
    next: photos.length === WALL_PAGE ? photos[photos.length - 1].id : null,
    count: stats ? (stats.results[0] ? stats.results[0].n : 0) : 0,
    closed: isClosed(env)
  };
  const res = json(body, 200, { 'Cache-Control': `public, max-age=${before ? 60 : 10}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function upload(request, env) {
  if (isClosed(env)) return json({ error: 'closed' }, 410);
  if (await limited(env.UPLOAD_LIMITER, request)) return json({ error: 'slow_down' }, 429);
  if (request.headers.get('X-Consent') !== env.CONSENT_VERSION) return json({ error: 'consent_required' }, 400);

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_UPLOAD) return json({ error: 'too_large' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_UPLOAD) return json({ error: 'too_large' }, 413);
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return json({ error: 'not_jpeg' }, 415);
  }

  const id = newId();
  const token = randomToken();
  const deleteHash = await sha256(token);
  // The hash rides along in R2 too, so the owner can delete before the row exists.
  await env.PHOTOS.put(`${id}.jpg`, bytes, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=300' },
    customMetadata: { deleteHash }
  });
  try {
    await env.UPLOADS.send({ id, createdAt: Date.now(), deleteHash, consent: env.CONSENT_VERSION });
  } catch (err) {
    await env.PHOTOS.delete(`${id}.jpg`);
    throw err;
  }
  return json({ id, url: photoUrl(env, id), deleteToken: token }, 201);
}

async function deleteOwn(request, env, id) {
  const token = request.headers.get('X-Delete-Token') || '';
  if (!token) return json({ error: 'forbidden' }, 403);
  const hash = await sha256(token);
  const deleteRow = () => env.DB.prepare(`DELETE FROM photos WHERE id = ? AND delete_hash = ? RETURNING status`)
    .bind(id, hash).first();
  let row = await deleteRow();
  if (!row) {
    // Still in the queue: check the token against the hash stored with the photo.
    const obj = await env.PHOTOS.head(`${id}.jpg`);
    if (!obj || !obj.customMetadata || obj.customMetadata.deleteHash !== hash) return json({ error: 'not_found' }, 404);
  }
  await env.PHOTOS.delete(`${id}.jpg`);
  if (!row) row = await deleteRow();   // the queue may have written it meanwhile
  if (row && row.status === 'visible') await decrement(env);
  return json({ ok: true });
}

async function report(request, env, id) {
  if (await limited(env.REPORT_LIMITER, request)) return json({ error: 'slow_down' }, 429);
  const row = await env.DB.prepare(
    `UPDATE photos SET reports = reports + 1 WHERE id = ? AND status = 'visible' RETURNING reports`
  ).bind(id).first();
  if (row && row.reports >= Number(env.REPORT_HIDE_AT || 5)) {
    const hidden = await env.DB.prepare(`UPDATE photos SET status = 'hidden' WHERE id = ? AND status = 'visible'`)
      .bind(id).run();
    if (hidden.meta.changes) await decrement(env);
  }
  return json({ ok: true });   // same answer whether or not the photo exists
}

async function photo(request, env, url) {
  const name = url.pathname.slice(3);
  if (!/^[0-9a-z]{17}\.jpg$/.test(name) || request.method !== 'GET') return new Response('Not found', { status: 404 });
  const obj = await env.PHOTOS.get(name);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  });
}

/* ---------------- Event-update sign-ups ---------------- */

const EMAIL_RE = /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function normEmail(raw) {
  const e = String(raw).trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/* Indian mobile numbers only: 10 digits starting 6-9, with or without +91 / 0. */
function normPhone(raw) {
  let d = String(raw).replace(/[\s\-().]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (/^91\d{10}$/.test(d)) d = d.slice(2);
  else if (/^0\d{10}$/.test(d)) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

async function signup(request, env) {
  if (signupsOver(env)) return json({ error: 'closed' }, 410);
  if (await limited(env.SIGNUP_LIMITER, request)) return json({ error: 'slow_down' }, 429);
  if (Number(request.headers.get('Content-Length') || 0) > 8192) return json({ error: 'too_large' }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (!body || body.consent !== env.SIGNUP_CONSENT_VERSION) return json({ error: 'consent_required' }, 400);

  let email = null, verified = 0, source = 'form';
  if (body.credential) {
    const g = env.GOOGLE_CLIENT_ID ? await verifyGoogle(String(body.credential), env) : null;
    email = g && normEmail(g.email);
    if (!email) return json({ error: 'google_invalid' }, 400);
    verified = 1;
    source = 'google';
  } else if (body.email) {
    email = normEmail(body.email);
    if (!email) return json({ error: 'invalid_email' }, 400);
  }
  const phone = body.phone ? normPhone(body.phone) : null;
  if (body.phone && !phone) return json({ error: 'invalid_phone' }, 400);
  if (!email && !phone) return json({ error: 'contact_required' }, 400);

  // Signing up again with a known email or number refreshes the consent and fills in the other field.
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO signups (id, created_at, consented_at, email, email_verified, phone, source, consent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         phone = COALESCE(excluded.phone, phone), email_verified = MAX(email_verified, excluded.email_verified),
         consented_at = excluded.consented_at, consent = excluded.consent
       ON CONFLICT (phone) DO UPDATE SET
         email_verified = CASE WHEN excluded.email IS NULL THEN email_verified
                               WHEN excluded.email = email THEN MAX(email_verified, excluded.email_verified)
                               ELSE excluded.email_verified END,
         email = COALESCE(excluded.email, email),
         consented_at = excluded.consented_at, consent = excluded.consent`
    ).bind(newId(), now, now, email, verified, phone, source, env.SIGNUP_CONSENT_VERSION).run();
  } catch (err) {
    // The email belongs to one row and the number to another: leave both rows as they are.
    if (!/UNIQUE/i.test(String(err && err.message))) throw err;
  }
  return json({ ok: true }, 201);   // same answer whether or not they were already signed up
}

/* Google ID token (a JWT, RS256) from One Tap or the Google button. Checked
 * against Google's published keys, our client id, the issuer and the expiry. */
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
let googleKeys = { at: 0, keys: new Map() };

async function googleKey(kid) {
  // Google rotates its keys every few days: refetch hourly, or for an unknown kid at most once a minute.
  const age = Date.now() - googleKeys.at;
  if (age > 3600e3 || (!googleKeys.keys.has(kid) && age > 60e3)) {
    const res = await fetch(GOOGLE_CERTS);
    if (!res.ok) throw new Error(`Google certs: HTTP ${res.status}`);
    const { keys } = await res.json();
    const imported = await Promise.all(keys.map(async (k) => [k.kid,
      await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])]));
    googleKeys = { at: Date.now(), keys: new Map(imported) };
  }
  return googleKeys.keys.get(kid) || null;
}

async function verifyGoogle(token, env) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s || token.length > 4096) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(h)));
    claims = JSON.parse(new TextDecoder().decode(b64url(p)));
  } catch { return null; }
  if (header.alg !== 'RS256') return null;
  const key = await googleKey(header.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const fresh = Number(claims.exp) * 1000 > Date.now();
  const issuer = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
  if (!fresh || !issuer || claims.aud !== env.GOOGLE_CLIENT_ID || claims.email_verified !== true || !claims.email) return null;
  return claims;
}

function b64url(text) {
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/* ---------------- Moderators ---------------- */

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_PASSWORD)]);
  // No lockout (moderators share an office IP); the password is long and random instead.
  return crypto.subtle.timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

async function adminList(env, url) {
  const view = url.searchParams.get('view') || 'latest';
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  // ?at=<ms timestamp> starts the latest list at that moment (to find a photo someone emails about).
  const at = Number(url.searchParams.get('at')) || 0;
  const upTo = at ? at.toString(36).padStart(9, '0') + 'zzzzzzzz' : '~';
  const sql = {
    latest: `SELECT id, created_at, reports, status FROM photos WHERE status = 'visible' AND id <= ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    reported: `SELECT id, created_at, reports, status FROM photos WHERE status = 'visible' AND reports > 0 ORDER BY reports DESC, id DESC LIMIT ? OFFSET ?`,
    hidden: `SELECT id, created_at, reports, status FROM photos WHERE status = 'hidden' ORDER BY id DESC LIMIT ? OFFSET ?`
  }[view];
  if (!sql) return json({ error: 'bad_request' }, 400);
  const [rows, stats] = await env.DB.batch([
    view === 'latest' ? env.DB.prepare(sql).bind(upTo, ADMIN_PAGE, offset) : env.DB.prepare(sql).bind(ADMIN_PAGE, offset),
    env.DB.prepare(`SELECT n FROM stats WHERE key = 'visible'`)
  ]);
  return json({
    photos: rows.results.map((r) => ({ ...r, url: photoUrl(env, r.id) })),
    more: rows.results.length === ADMIN_PAGE,
    count: stats.results[0] ? stats.results[0].n : 0
  });
}

async function adminRemove(env, id) {
  const row = await env.DB.prepare(`DELETE FROM photos WHERE id = ? RETURNING status`).bind(id).first();
  await env.PHOTOS.delete(`${id}.jpg`);
  if (row && row.status === 'visible') await decrement(env);
  return json({ ok: true });
}

async function adminRestore(env, id) {
  const res = await env.DB.prepare(`UPDATE photos SET status = 'visible', reports = 0 WHERE id = ? AND status = 'hidden'`)
    .bind(id).run();
  if (res.meta.changes) await env.DB.prepare(`UPDATE stats SET n = n + 1 WHERE key = 'visible'`).run();
  return json({ ok: true });
}

async function adminSignupCount(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM signups`).first();
  return json({ count: row ? row.n : 0, deleteAt: env.SIGNUPS_DELETE_AT });
}

async function adminSignupCsv(env) {
  const ist = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const lines = ['signed_up_ist,consented_ist,email,email_verified,phone,source,consent_version'];
  let after = '';
  for (;;) {
    const { results } = await env.DB.prepare(
      `SELECT id, created_at, consented_at, email, email_verified, phone, source, consent FROM signups WHERE id > ? ORDER BY id LIMIT 5000`
    ).bind(after).all();
    for (const r of results) {
      lines.push([ist.format(r.created_at), ist.format(r.consented_at), r.email, r.email_verified ? 'yes' : 'no', r.phone, r.source, r.consent]
        .map(csvCell).join(','));
    }
    if (results.length < 5000) break;
    after = results[results.length - 1].id;
  }
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {   // BOM so Excel reads it as UTF-8
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="smileday-signups-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
}

/* Quotes every cell, and defuses anything a spreadsheet would run as a formula. */
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=@\t\r-]/.test(s) || (s.startsWith('+') && !/^\+91\d{10}$/.test(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/* Unsubscribe or withdrawal requests: removes every row with that email or number. */
async function adminSignupRemove(env, url) {
  const raw = url.searchParams.get('contact') || '';
  const email = normEmail(raw), phone = normPhone(raw);
  if (!email && !phone) return json({ error: 'bad_request' }, 400);
  const res = await env.DB.prepare(`DELETE FROM signups WHERE email = ? OR phone = ?`).bind(email, phone).run();
  return json({ deleted: res.meta.changes });
}

/* ---------------- Deletion deadline ---------------- */

async function purgeAll(env) {
  const stopAt = Date.now() + 10 * 60 * 1000;   // the next cron run picks up anything left
  let listed;
  do {
    listed = await env.PHOTOS.list({ limit: 1000 });
    if (listed.objects.length) await env.PHOTOS.delete(listed.objects.map((o) => o.key));
  } while (listed.objects.length && Date.now() < stopAt);
  let res;
  do {
    res = await env.DB.prepare(`DELETE FROM photos WHERE id IN (SELECT id FROM photos LIMIT 5000)`).run();
  } while (res.meta.changes && Date.now() < stopAt);
  await env.DB.prepare(`UPDATE stats SET n = 0 WHERE key = 'visible'`).run();
}

/* ---------------- Helpers ---------------- */

function isClosed(env) { return Date.now() >= Date.parse(env.CLOSE_AT); }

function signupsOver(env) { return !!env.SIGNUPS_DELETE_AT && Date.now() >= Date.parse(env.SIGNUPS_DELETE_AT); }

function photoUrl(env, id) { return `${env.PHOTO_BASE || '/p/'}${id}.jpg`; }

function decrement(env) {
  return env.DB.prepare(`UPDATE stats SET n = MAX(n - 1, 0) WHERE key = 'visible'`).run();
}

/* Time-sortable id: 9 base-36 chars of ms timestamp, then 8 random. Doubles as the R2 key. */
function newId() {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  return Date.now().toString(36).padStart(9, '0') + Array.from(rand, (b) => (b % 36).toString(36)).join('');
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* Per-IP limit. The IP is only held in memory by the limiter, never stored. */
async function limited(binding, request) {
  if (!binding) return false;
  try {
    const { success } = await binding.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    return !success;
  } catch { return false; }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}
