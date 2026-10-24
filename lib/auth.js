// GitHub sign-in (OAuth web flow, no scopes: identity only) and HMAC-signed session cookies.
// We keep only { login, id } in the cookie; the GitHub access token is dropped after one /user call.
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export const SESSION_COOKIE = 'snr_session';
export const OAUTH_COOKIE = 'snr_oauth';
const SESSION_DAYS = 30;

const b64 = buf => Buffer.from(buf).toString('base64url');

// One secret per deployment, kept on the data volume so sessions survive restarts.
export async function loadSecret(dataDir) {
  const file = `${dataDir}/session.key`;
  const existing = await readFile(file, 'utf8').catch(() => '');
  if (existing.length >= 43) return existing.trim();
  const secret = b64(randomBytes(32));
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, secret, { mode: 0o600 });
  return secret;
}

export function sign(secret, payload, ttlMs, now = Date.now()) {
  const body = b64(JSON.stringify({ ...payload, exp: now + ttlMs }));
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}

export function verify(secret, token, now = Date.now()) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > now ? data : null;
  } catch { return null; }
}

export const parseCookies = header => Object.fromEntries(
  String(header || '').split(';').map(c => c.trim().split('=')).filter(([k, v]) => k && v).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
);

export const cookie = (name, value, maxAgeSec) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

export const sessionCookie = (secret, user) => cookie(SESSION_COOKIE, sign(secret, user, SESSION_DAYS * 864e5), SESSION_DAYS * 86400);

export const currentUser = (secret, req) => verify(secret, parseCookies(req.headers.cookie)[SESSION_COOKIE]);

// CSRF token bound to the session, so a form posted from elsewhere can't reuse it.
export const csrfToken = (secret, user) => b64(createHmac('sha256', secret).update(`csrf:${user.id}:${user.exp}`).digest());

// Step 1: where to send the browser, plus the short-lived cookie that carries state + PKCE verifier.
export function startLogin({ secret, clientId, redirectUri }) {
  const state = b64(randomBytes(16));
  const verifier = b64(randomBytes(32));
  const challenge = b64(createHash('sha256').update(verifier).digest());
  const url = new URL('https://github.com/login/oauth/authorize');
  for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256', allow_signup: 'true' })) url.searchParams.set(k, v);
  return { url: url.href, cookie: cookie(OAUTH_COOKIE, sign(secret, { state, verifier }, 10 * 60e3), 600) };
}

// Step 2: check state, swap the code for a token, read the user, forget the token.
export async function finishLogin({ secret, clientId, clientSecret, redirectUri, req, query, fetchFn = fetch }) {
  const pending = verify(secret, parseCookies(req.headers.cookie)[OAUTH_COOKIE]);
  const state = query.get('state') || '';
  if (!pending || state.length !== pending.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) throw new Error('sign-in expired, try again');
  const tok = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: query.get('code'), redirect_uri: redirectUri, code_verifier: pending.verifier }),
  }).then(r => r.json());
  if (!tok.access_token) throw new Error(tok.error_description || 'GitHub sign-in failed');
  const res = await fetchFn('https://api.github.com/user', { headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'stacksnracks' } });
  if (!res.ok) throw new Error(`GitHub /user ${res.status}`);
  const { login, id } = await res.json();
  return { login, id };
}
