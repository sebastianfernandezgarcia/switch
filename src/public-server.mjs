import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { createLiveRailClient } from './live-rail.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INFERENCE_ROUTES = new Set(['/api/analyse', '/api/rehearse', '/api/network/review', '/api/network/explore']);
const COOKIE = 'switch_demo';

// Public visitors get independent local workspaces. No provider key or writable
// credit ledger is passed into this free showcase; recorded actual runs stay labelled.
export async function startPublicServer(options = {}) {
  const env = options.env ?? process.env;
  const configured = options.origin ?? env.SWITCH_PUBLIC_ORIGIN ?? env.RENDER_EXTERNAL_URL;
  const external = configured ? new URL(configured) : null;
  if (external && (!['http:', 'https:'].includes(external.protocol) || external.username || external.password || external.pathname !== '/' || external.search || external.hash)) {
    throw new Error('Configure a plain external HTTP(S) origin.');
  }
  const root = await mkdtemp(join(tmpdir(), 'switch-public-'));
  const visitors = new Map();
  const liveRail = options.liveRail ?? createLiveRailClient();
  const networkCache = {};
  const maxVisitors = options.maxVisitors ?? 24;
  const idleMs = options.idleMs ?? 30 * 60_000;
  let closed = false;

  function send(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  }
  async function release(id, entry) {
    visitors.delete(id);
    const workspace = await entry.promise.catch(() => null);
    if (workspace) await new Promise(resolve => { workspace.closeAllConnections(); workspace.close(resolve); });
    await rm(join(root, id), { recursive: true, force: true });
  }
  async function expire() {
    const now = Date.now();
    await Promise.all([...visitors].filter(([, entry]) => now - entry.lastSeen > idleMs && !entry.active).map(([id, entry]) => release(id, entry)));
  }
  const maintenance = setInterval(() => { void expire().catch(() => {}); }, 60_000);
  maintenance.unref();

  const server = http.createServer(async (req, res) => {
    try {
      if (closed) return send(res, 503, { error: 'SHUTTING_DOWN' });
      const port = server.address().port;
      const origin = external?.origin ?? `http://127.0.0.1:${port}`;
      const allowedHosts = external ? [external.host] : [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) return send(res, 403, { error: 'HOST_REJECTED' });
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/healthz') {
        return send(res, 200, { status: 'ok', mode: 'public_showcase', newInference: false, version: '0.12.0' });
      }
      if (req.method === 'GET' && path === '/api/deployment') return send(res, 200, { mode: 'public_showcase', newInference: false });
      if (!['GET', 'POST', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (req.method === 'POST' && req.headers.origin !== origin) return send(res, 403, { error: 'ORIGIN_REJECTED' });
      if (INFERENCE_ROUTES.has(path)) {
        return send(res, 403, { error: 'PUBLIC_INFERENCE_PAUSED', message: 'New Meta requests are paused in this public demo. Inspect the labelled actual saved runs; the simulator and published train observations remain available.' });
      }
      const match = (req.headers.cookie ?? '').match(/(?:^|;\s*)switch_demo=([a-f0-9-]{36})(?:;|$)/);
      let id = match?.[1], entry = id ? visitors.get(id) : null;
      if (!entry) {
        if (visitors.size >= maxVisitors) return send(res, 503, { error: 'DEMO_BUSY', message: 'The demo is busy. Please try again shortly.' });
        id = randomUUID();
        entry = { lastSeen: Date.now(), active: 0, windowStart: Date.now(), requests: 0 };
        entry.promise = startServer({ port: 0, dataDir: join(root, id), env: {}, liveRail, networkCache,
          recordedFile: join(ROOT, 'examples/recorded-meta.json'), agentRecordedFile: join(ROOT, 'examples/recorded-agent.json') });
        visitors.set(id, entry);
        res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${external?.protocol === 'https:' ? '; Secure' : ''}`);
      }
      entry.lastSeen = Date.now();
      if (Date.now() - entry.windowStart > 60_000) { entry.windowStart = Date.now(); entry.requests = 0; }
      if (++entry.requests > 300) return send(res, 429, { error: 'RATE_LIMITED' });
      entry.active++;
      let settled = false;
      const finish = () => { if (!settled) { settled = true; entry.active--; } };
      res.once('close', finish); res.once('finish', finish);
      const workspace = await entry.promise;
      const targetPort = workspace.address().port;
      const headers = { host: `127.0.0.1:${targetPort}` };
      for (const key of ['content-type', 'content-length', 'accept-encoding']) if (req.headers[key]) headers[key] = req.headers[key];
      if (req.method === 'POST') headers.origin = `http://127.0.0.1:${targetPort}`;
      const proxy = http.request({ hostname: '127.0.0.1', port: targetPort, path: req.url, method: req.method, headers }, upstream => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      });
      proxy.once('error', () => { if (!res.headersSent) send(res, 502, { error: 'WORKSPACE_UNAVAILABLE' }); else res.destroy(); });
      req.once('aborted', () => proxy.destroy());
      req.pipe(proxy);
    } catch {
      if (!res.headersSent) send(res, 503, { error: 'DEMO_UNAVAILABLE' }); else res.destroy();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? Number(env.PORT ?? 10000), options.host ?? '0.0.0.0', resolve); });
  server.shutdown = async () => {
    closed = true; clearInterval(maintenance);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await Promise.all([...visitors].map(([id, entry]) => release(id, entry)));
    await rm(root, { recursive: true, force: true });
  };
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startPublicServer();
  console.log(`SWITCH public showcase listening on ${server.address().port}; new inference paused.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void server.shutdown().then(() => process.exit(0)); });
}
