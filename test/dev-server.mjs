// Runs worker/index.js in plain Node, for machines where `wrangler dev` can't
// start (workerd needs a recent Visual C++ runtime on Windows). D1 is played
// by node:sqlite, R2 by an in-memory Map, static assets from public/.
//   node test/dev-server.mjs            -> http://localhost:8787
// Not used in production; `wrangler dev` is the real local runtime.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8787);

// Workers-only APIs the Worker uses
crypto.subtle.timingSafeEqual ??= (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };

function d1(file) {
  const db = new DatabaseSync(file);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...args) })
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) out.push(await s.all());
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    exec: (sql) => db.exec(sql)
  };
}

function r2() {
  const m = new Map();
  return {
    put: async (key, bytes) => { m.set(key, Buffer.from(bytes)); },
    get: async (key) => (m.has(key) ? { body: m.get(key) } : null),
    delete: async (keys) => { [].concat(keys).forEach((k) => m.delete(k)); },
    list: async ({ limit = 1000 } = {}) => ({ objects: [...m.keys()].slice(0, limit).map((key) => ({ key })) }),
    size: () => m.size
  };
}

// [vars] from wrangler.toml (simple key = "value" lines) plus .dev.vars
async function vars() {
  const out = {};
  const toml = await readFile(join(root, 'wrangler.toml'), 'utf8');
  const section = toml.split(/^\[vars\]\s*$/m)[1] || '';
  for (const line of section.split('\n')) {
    if (/^\s*\[/.test(line)) break;
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"([^"]*)"/);
    if (m) out[m[1]] = m[2];
  }
  const dev = await readFile(join(root, '.dev.vars'), 'utf8').catch(() => '');
  for (const line of dev.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\r]*)"?/);
    if (m) out[m[1]] = m[2];
  }
  return { ...out, ...JSON.parse(process.env.VARS || '{}') };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain' };

async function asset(pathname) {
  const p = normalize(join(root, 'public', decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  if (!p.startsWith(join(root, 'public')) || p.endsWith('_headers')) return null;
  try {
    if (!(await stat(p)).isFile()) return null;
    return new Response(await readFile(p), { headers: { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' } });
  } catch { return null; }
}

export async function start(port = PORT) {
  const DB = d1(process.env.DB_FILE || ':memory:');
  DB.exec(await readFile(join(root, 'worker', 'schema.sql'), 'utf8'));
  const env = { ...(await vars()), DB, PHOTOS: r2(), ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
  const ctx = { waitUntil: (p) => p.catch(console.error) };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = (req.method === 'GET' && (await asset(url.pathname))) ||
      (await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body }), env, ctx));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((r) => server.listen(port, r));
  console.log(`Smile Wall dev server on http://localhost:${port}`);
  return { server, env, ctx };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) start();
