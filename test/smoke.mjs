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
// Uploads reach the wall through a queue, so poll until a condition holds.
const until = async (fn, ms = 20000) => {
  for (const end = Date.now() + ms; ; await new Promise((r) => setTimeout(r, 500))) {
    const v = await fn();
    if (v || Date.now() > end) return v;
  }
};
const wallTop = () => call('GET', '/api/wall').then((r) => r.data);
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

const img = await fetch(new URL(a.data.url, BASE));   // absolute once PHOTO_BASE is set
check('photo is served', img.status === 200 && img.headers.get('content-type') === 'image/jpeg');

const w = { data: await until(async () => { const d = await wallTop(); return d.count === start.data.count + 2 && d; }) || await wallTop() };
check('newest photo is first on the wall', w.data.photos[0] && w.data.photos[0].id === b.data.id);
check('counter went up by 2', w.data.count === start.data.count + 2, `${start.data.count} -> ${w.data.count}`);

// Deleting straight after uploading, likely before the queue has written the row
const c = await up();
check('delete while still queued works', (await call('DELETE', `/api/photos/${c.data.id}`, { headers: { 'X-Delete-Token': c.data.deleteToken } })).status === 200);
await new Promise((r) => setTimeout(r, 4000));
const afterQueued = await wallTop();
check('queued-then-deleted photo never shows', !afterQueued.photos.some((p) => p.id === c.data.id) && afterQueued.count === w.data.count, `count ${afterQueued.count}`);

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
// Event-update sign-ups
const SIGNUP_CONSENT = process.env.SIGNUP_CONSENT || '2026-10-s1';
const su = (body) => call('POST', '/api/signups', { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const testEmail = `smoke-${Date.now()}@example.com`;
const testPhone = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
check('sign-up without consent is refused', (await su({ email: testEmail })).status === 400);
check('sign-up without email or phone is refused', (await su({ consent: SIGNUP_CONSENT })).data?.error === 'contact_required');
check('bad email is refused', (await su({ consent: SIGNUP_CONSENT, email: 'not-an-email' })).data?.error === 'invalid_email');
check('bad phone is refused', (await su({ consent: SIGNUP_CONSENT, phone: '12345' })).data?.error === 'invalid_phone');
check('forged Google token is refused', (await su({ consent: SIGNUP_CONSENT, credential: 'aaa.bbb.ccc' })).data?.error === 'google_invalid');
check('email sign-up works', (await su({ consent: SIGNUP_CONSENT, email: testEmail.toUpperCase() })).status === 201);
check('adding a phone to the same email works', (await su({ consent: SIGNUP_CONSENT, email: testEmail, phone: `+91 ${testPhone}` })).status === 201);
check('signing up again is fine', (await su({ consent: SIGNUP_CONSENT, phone: `0${testPhone}` })).status === 201);
check('sign-up list needs password', (await call('GET', '/api/admin/signups')).status === 401);
const csv = await fetch(`${BASE}/api/admin/signups.csv`, { headers: admin }).then((r) => r.text());
const rows = csv.split('\r\n').filter((l) => l.includes(testEmail));
check('CSV has one merged row', rows.length === 1 && rows[0].includes(`"+91${testPhone}"`), rows[0]);
const removed = await call('DELETE', `/api/admin/signups?contact=${encodeURIComponent(testPhone)}`, { headers: admin });
check('admin removes a person', removed.status === 200 && removed.data.deleted === 1);
const csv2 = await fetch(`${BASE}/api/admin/signups.csv`, { headers: admin }).then((r) => r.text());
check('removed person is gone from CSV', !csv2.includes(testEmail));

check('unknown API path is 404', (await call('GET', '/api/nope')).status === 404);
check('home page is served', (await fetch(BASE + '/')).status === 200);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
