// End-to-end check of the Smile Wall API.
//   npm run smoke                       -> against `wrangler dev` on :8787
//   BASE=https://… ADMIN=… npm run smoke -> against a deployed Worker
// Creates a few test photos and removes them again.
const BASE = process.env.BASE || 'http://localhost:8787';
const ADMIN = process.env.ADMIN || 'local-test-password';
const CONSENT = process.env.CONSENT || '2026-10-v1';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failed++;
};
const call = async (method, path, { body, headers = {} } = {}) => {
  const res = await fetch(BASE + path, { method, body, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, res };
};
const admin = { Authorization: `Bearer ${ADMIN}` };
const jpeg = () => {
  const b = new Uint8Array(5000);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  crypto.getRandomValues(b.subarray(4, 100));
  return b;
};
const up = (headers = {}, body = jpeg()) =>
  call('POST', '/api/photos', { body, headers: { 'Content-Type': 'image/jpeg', 'X-Consent': CONSENT, ...headers } });

const start = await call('GET', '/api/wall');
check('wall loads', start.status === 200 && Array.isArray(start.data.photos), `count ${start.data && start.data.count}`);
check('uploads open', start.data && start.data.closed === false);

check('upload without consent is refused', (await up({ 'X-Consent': '' })).status === 400);
check('non-JPEG is refused', (await up({}, new TextEncoder().encode('hello'.repeat(300)))).status === 415);
check('oversized upload is refused', (await up({}, new Uint8Array(500 * 1024).fill(0xff))).status === 413);

const a = await up();
check('upload works', a.status === 201 && a.data.id && a.data.deleteToken, a.data && a.data.id);
const b = await up();
check('second upload works', b.status === 201);

const img = await fetch(BASE + a.data.url.replace(/^https?:\/\/[^/]+/, ''));
check('photo is served', img.status === 200 && img.headers.get('content-type') === 'image/jpeg');

const w = await call('GET', '/api/wall');
check('newest photo is first on the wall', w.data.photos[0] && w.data.photos[0].id === b.data.id);
check('counter went up by 2', w.data.count === start.data.count + 2, `${start.data.count} -> ${w.data.count}`);

const page = await call('GET', `/api/wall?before=${b.data.id}`);
check('pagination skips newer photos', page.data.photos[0] && page.data.photos[0].id === a.data.id);

check('delete with wrong token fails', (await call('DELETE', `/api/photos/${a.data.id}`, { headers: { 'X-Delete-Token': 'nope' } })).status === 404);
check('delete own photo works', (await call('DELETE', `/api/photos/${a.data.id}`, { headers: { 'X-Delete-Token': a.data.deleteToken } })).status === 200);
check('deleted photo is gone from storage', (await fetch(`${BASE}/p/${a.data.id}.jpg`)).status === 404);

for (let i = 0; i < 5; i++) await call('POST', `/api/photos/${b.data.id}/report`);
const afterReports = await call('GET', `/api/wall?before=${'z'.repeat(17)}`);
check('5 reports hide a photo', !afterReports.data.photos.some((p) => p.id === b.data.id));

check('admin needs password', (await call('GET', '/api/admin/photos')).status === 401);
const hidden = await call('GET', '/api/admin/photos?view=hidden', { headers: admin });
check('admin sees hidden photo', hidden.status === 200 && hidden.data.photos.some((p) => p.id === b.data.id && p.reports === 5));
check('admin restore works', (await call('POST', `/api/admin/photos/${b.data.id}/restore`, { headers: admin })).status === 200);
const latest = await call('GET', '/api/admin/photos?view=latest', { headers: admin });
check('restored photo is visible again', latest.data.photos.some((p) => p.id === b.data.id));
check('admin remove works', (await call('DELETE', `/api/admin/photos/${b.data.id}`, { headers: admin })).status === 200);

const end = await call('GET', `/api/wall?before=${'z'.repeat(17)}`);
check('counter back to start', end.data.count === start.data.count, `${end.data.count}`);
check('unknown API path is 404', (await call('GET', '/api/nope')).status === 404);
check('home page is served', (await fetch(BASE + '/')).status === 200);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
