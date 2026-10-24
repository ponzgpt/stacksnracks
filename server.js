// Zero-dependency server: Increments page from data/tiers.json, community rigs from approved GitHub issues, newsletter signups.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { validEmail, rateLimiter, saveSubscriber } from './lib/subscribe.js';
import { loadRigs, filterRigs } from './lib/rigs.js';
import { homePage, rigsPage, rigPage } from './lib/views.js';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const RIGS_REFRESH_MS = 10 * 60 * 1000; // 6 unauthenticated GitHub calls/hour, well under the 60/hour limit
const PUB = new URL('./public/', import.meta.url);
const ASSETS = { 'style.css': 'text/css', 'favicon.svg': 'image/svg+xml' };
const MAX_BODY = 4 * 1024;
const allowSignup = rateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

const { updated, tiers } = JSON.parse(await readFile(new URL('./data/tiers.json', import.meta.url), 'utf8'));

let rigs = [];
const refreshRigs = async () => { rigs = await loadRigs({ dataDir: DATA_DIR, url: process.env.RIGS_URL || undefined }); }; // RIGS_URL: local fixture in dev
await refreshRigs();
setInterval(refreshRigs, RIGS_REFRESH_MS).unref();

function send(res, code, body, type = 'text/html', extra = {}) {
  res.writeHead(code, {
    'content-type': `${type}; charset=utf-8`,
    'content-security-policy': "default-src 'self'; img-src 'self' data: https://github.com https://*.githubusercontent.com; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extra,
  });
  res.end(body);
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

// Traefik is the only ingress, so the first X-Forwarded-For hop is the client.
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const back = (res, s) => send(res, 303, '', 'text/plain', { location: `/?s=${s}#subscribe` });
const html = (res, body) => send(res, 200, body, 'text/html', { 'cache-control': 'no-cache' });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const [, a, b] = url.pathname.split('/');
  const read = req.method === 'GET' || req.method === 'HEAD';
  try {
    if (a === 'healthz') return send(res, 200, 'ok', 'text/plain');
    if (a === 'assets' && ASSETS[b]) return send(res, 200, await readFile(new URL(b, PUB)), ASSETS[b], { 'cache-control': 'public, max-age=3600' });
    if (url.pathname === '/subscribe' && req.method === 'POST') {
      if (!allowSignup(clientIp(req))) return back(res, 'slow');
      const form = new URLSearchParams(await readBody(req));
      if (form.get('website')) return back(res, 'ok'); // honeypot: pretend success
      const email = (form.get('email') || '').trim();
      if (!validEmail(email)) return back(res, 'err');
      await saveSubscriber(DATA_DIR, email);
      return back(res, 'ok');
    }
    if (read && url.pathname === '/') return html(res, homePage({ updated, tiers, rigs, flash: url.searchParams.get('s') }));
    if (read && a === 'rigs' && !b) {
      const query = { q: url.searchParams.get('q') || '', backend: url.searchParams.get('backend') || '', sort: url.searchParams.get('sort') || 'tg' };
      return html(res, rigsPage({ rigs, shown: filterRigs(rigs, query), query }));
    }
    if (read && a === 'rigs' && /^\d+$/.test(b)) {
      const rig = rigs.find(r => r.id === Number(b));
      if (rig) return html(res, rigPage(rig));
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    console.error(e);
    send(res, 400, 'bad request', 'text/plain');
  }
});

server.listen(PORT, () => console.log(`stacksnracks on :${PORT}, ${rigs.length} rigs`));
