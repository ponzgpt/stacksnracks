// Zero-dependency server: Increments page from data/tiers.json, community rigs from approved GitHub issues,
// GitHub sign-in + on-site rig submissions, newsletter signups.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { validEmail, rateLimiter, saveSubscriber } from './lib/subscribe.js';
import { loadRigs, filterRigs } from './lib/rigs.js';
import { homePage, rigsPage, rigPage, submitPage, thanksPage } from './lib/views.js';
import { loadSecret, currentUser, csrfToken, startLogin, finishLogin, sessionCookie, cookie, SESSION_COOKIE, OAUTH_COOKIE } from './lib/auth.js';
import { FIELDS, validateSubmission, toIssue, fileIssue } from './lib/submit.js';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const RIGS_REFRESH_MS = 10 * 60 * 1000; // 6 GitHub calls/hour: fine even unauthenticated (60/hour)
const PUB = new URL('./public/', import.meta.url);
const ASSETS = { 'style.css': 'text/css', 'favicon.svg': 'image/svg+xml' };
const SITE_URL = process.env.SITE_URL || 'https://stacksnracks.technoir.cloud';
const { GITHUB_CLIENT_ID = '', GITHUB_CLIENT_SECRET = '', GITHUB_TOKEN = '' } = process.env; // set via scripts/set-github-key.sh
const LOGIN_ENABLED = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
const SUBMIT_ENABLED = Boolean(GITHUB_TOKEN);
const REDIRECT_URI = `${SITE_URL}/auth/callback`;
const HOUR = 60 * 60 * 1000;
const allowSignup = rateLimiter({ max: 5, windowMs: HOUR });
const allowSubmitIp = rateLimiter({ max: 10, windowMs: HOUR });
const allowSubmitUser = rateLimiter({ max: 5, windowMs: HOUR });
const SECRET = await loadSecret(DATA_DIR);

const { updated, tiers } = JSON.parse(await readFile(new URL('./data/tiers.json', import.meta.url), 'utf8'));

let rigs = [];
const refreshRigs = async () => { rigs = await loadRigs({ dataDir: DATA_DIR, url: process.env.RIGS_URL || undefined, token: GITHUB_TOKEN }); }; // RIGS_URL: local fixture in dev
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

async function readBody(req, max = 4 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

// Traefik is the only ingress, so the first X-Forwarded-For hop is the client.
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const back = (res, s) => send(res, 303, '', 'text/plain', { location: `/?s=${s}#subscribe` });
const html = (res, body, code = 200, extra = {}) => send(res, code, body, 'text/html', { 'cache-control': 'no-cache', ...extra });
const redirect = (res, location, extra = {}) => send(res, 303, '', 'text/plain', { location, ...extra });
const sameOrigin = req => !req.headers.origin || req.headers.origin === new URL(SITE_URL).origin;
const csrfOk = (req, user, form) => Boolean(user) && sameOrigin(req) && form.get('csrf') === csrfToken(SECRET, user);
const clearCookie = name => cookie(name, '', 0);

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
    const user = currentUser(SECRET, req);
    if (read && url.pathname === '/') return html(res, homePage({ updated, tiers, rigs, flash: url.searchParams.get('s'), user }));
    if (read && a === 'rigs' && !b) {
      const query = { q: url.searchParams.get('q') || '', backend: url.searchParams.get('backend') || '', sort: url.searchParams.get('sort') || 'tg' };
      return html(res, rigsPage({ rigs, shown: filterRigs(rigs, query), query, user }));
    }
    if (read && a === 'rigs' && /^\d+$/.test(b)) {
      const rig = rigs.find(r => r.id === Number(b));
      if (rig) return html(res, rigPage(rig, user));
    }

    const page = (opts, code = 200, extra) => html(res, submitPage({
      user, fields: FIELDS, csrf: user && csrfToken(SECRET, user), loginEnabled: LOGIN_ENABLED, submitEnabled: SUBMIT_ENABLED, ...opts,
    }), code, extra);
    if (read && url.pathname === '/login' && LOGIN_ENABLED) {
      const go = startLogin({ secret: SECRET, clientId: GITHUB_CLIENT_ID, redirectUri: REDIRECT_URI });
      return send(res, 302, '', 'text/plain', { location: go.url, 'set-cookie': go.cookie });
    }
    if (read && url.pathname === '/auth/callback' && LOGIN_ENABLED) {
      try {
        const who = await finishLogin({ secret: SECRET, clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET, redirectUri: REDIRECT_URI, req, query: url.searchParams });
        return redirect(res, '/submit', { 'set-cookie': [sessionCookie(SECRET, who), clearCookie(OAUTH_COOKIE)] });
      } catch (e) {
        return page({ user: null, flash: e.message }, 400, { 'set-cookie': clearCookie(OAUTH_COOKIE) });
      }
    }
    if (url.pathname === '/logout' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      if (!csrfOk(req, user, form)) return send(res, 403, 'forbidden', 'text/plain');
      return redirect(res, '/', { 'set-cookie': clearCookie(SESSION_COOKIE) });
    }
    if (read && url.pathname === '/submit') return page({});
    if (url.pathname === '/submit' && req.method === 'POST') {
      if (!user || !SUBMIT_ENABLED) return redirect(res, '/submit');
      const form = new URLSearchParams(await readBody(req, 32 * 1024));
      if (!csrfOk(req, user, form)) return send(res, 403, 'forbidden', 'text/plain');
      const v = validateSubmission(form);
      if (!v.ok) return page(v, 422);
      if (!allowSubmitIp(clientIp(req)) || !allowSubmitUser(String(user.id))) return page({ ...v, errors: { title: 'Too many submissions this hour. Try again later.' } }, 429);
      try {
        const issue = await fileIssue({ token: GITHUB_TOKEN, issue: toIssue(v.values, user) });
        return html(res, thanksPage({ user, issue }));
      } catch (e) {
        console.error('submit:', e.message);
        return page({ ...v, errors: { title: 'GitHub didn\'t accept the submission just now. Your text is still here: try again in a minute.' } }, 502);
      }
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    console.error(e);
    send(res, 400, 'bad request', 'text/plain');
  }
});

server.listen(PORT, () => console.log(`stacksnracks on :${PORT}, ${rigs.length} rigs`));
