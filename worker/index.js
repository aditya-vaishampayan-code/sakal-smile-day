/* Pune Smile Day — Cloudflare Worker.
 * Static files in public/ are served by Workers Static Assets before this code
 * runs; only /api/* and /p/* reach the Worker.
 *
 *   GET    /api/wall?before=<id>          public wall page + live count
 *   POST   /api/photos                    upload one JPEG (body = image/jpeg)
 *   DELETE /api/photos/<id>               uploader deletes own photo (X-Delete-Token)
 *   POST   /api/photos/<id>/report        anyone flags a photo
 *   GET    /p/<id>.jpg                    photo bytes (when PHOTO_BASE is not set)
 *   GET    /api/admin/photos?view=&offset=&at=  moderator list (Authorization: Bearer <password>)
 *   DELETE /api/admin/photos/<id>         moderator removes a photo for good
 *   POST   /api/admin/photos/<id>/restore moderator restores an auto-hidden photo
 *
 * Bindings (wrangler.toml): DB (D1), PHOTOS (R2), ASSETS, rate limiters.
 * Secret: ADMIN_PASSWORD.
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

  /* Runs every 30 minutes. After DELETE_AT, wipes every photo and row. */
  async scheduled(_event, env, ctx) {
    if (Date.now() >= Date.parse(env.DELETE_AT)) ctx.waitUntil(purgeAll(env));
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

  if (parts[1] === 'admin') {
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
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
  await env.PHOTOS.put(`${id}.jpg`, bytes, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=300' }
  });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO photos (id, created_at, delete_hash, consent) VALUES (?, ?, ?, ?)`)
      .bind(id, Date.now(), await sha256(token), env.CONSENT_VERSION),
    env.DB.prepare(`UPDATE stats SET n = n + 1 WHERE key = 'visible'`)
  ]);
  return json({ id, url: photoUrl(env, id), deleteToken: token }, 201);
}

async function deleteOwn(request, env, id) {
  const token = request.headers.get('X-Delete-Token') || '';
  if (!token) return json({ error: 'forbidden' }, 403);
  const row = await env.DB.prepare(`DELETE FROM photos WHERE id = ? AND delete_hash = ? RETURNING status`)
    .bind(id, await sha256(token)).first();
  if (!row) return json({ error: 'not_found' }, 404);
  await env.PHOTOS.delete(`${id}.jpg`);
  if (row.status === 'visible') await decrement(env);
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
