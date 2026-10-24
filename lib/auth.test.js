import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, parseCookies, csrfToken, startLogin, finishLogin, OAUTH_COOKIE } from './auth.js';
import { validateSubmission, toIssue } from './submit.js';
import { issueToRig } from './rigs.js';

const SECRET = 'x'.repeat(43);

test('signed tokens: round-trip, tamper, expiry, wrong secret', () => {
  const t = sign(SECRET, { login: 'dev', id: 1 }, 1000, 0);
  assert.equal(verify(SECRET, t, 500).login, 'dev');
  assert.equal(verify(SECRET, t, 1001), null);
  assert.equal(verify('y'.repeat(43), t, 500), null);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ login: 'admin', id: 1, exp: 1000 })).toString('base64url');
  assert.equal(verify(SECRET, `${forged}.${sig}`, 500), null);
  assert.equal(verify(SECRET, body, 500), null);
  assert.notEqual(csrfToken(SECRET, { id: 1, exp: 1 }), csrfToken(SECRET, { id: 2, exp: 1 }));
});

test('OAuth: state must match the cookie; token is exchanged with the PKCE verifier', async () => {
  const go = startLogin({ secret: SECRET, clientId: 'cid', redirectUri: 'https://s/auth/callback' });
  const state = new URL(go.url).searchParams.get('state');
  const cookieHeader = `${OAUTH_COOKIE}=${go.cookie.split(';')[0].split('=').slice(1).join('=')}`;
  assert.ok(parseCookies(cookieHeader)[OAUTH_COOKIE]);
  let sent;
  const fetchFn = async (url, opts) => url.includes('access_token')
    ? (sent = JSON.parse(opts.body), { json: async () => ({ access_token: 'gho_x' }) })
    : { ok: true, json: async () => ({ login: 'dev', id: 42, email: 'not-kept@example.com' }) };
  const req = { headers: { cookie: cookieHeader } };
  const args = { secret: SECRET, clientId: 'cid', clientSecret: 's', redirectUri: 'https://s/auth/callback', req, fetchFn };
  assert.deepEqual(await finishLogin({ ...args, query: new URLSearchParams({ state, code: 'c' }) }), { login: 'dev', id: 42 });
  assert.ok(sent.code_verifier.length >= 43);
  await assert.rejects(finishLogin({ ...args, query: new URLSearchParams({ state: 'nope', code: 'c' }) }));
});

const BENCH = `| model | size | params | backend | ngl | test | t/s |
| --- | ---: | ---: | --- | --: | ---: | ---: |
| llama 8B Q4_K - Medium | 4.58 GiB | 8.03 B | Metal | 99 | tg128 | 85.10 ± 0.2 |`;

test('site submission → issue → rig keeps the real author, but only on owner-filed issues', () => {
  const form = new URLSearchParams({ title: 'Mac box', parts: 'Mac Studio M5 Max\n128GB', price: '$5,100', stack: 'llama.cpp Metal', bench: BENCH, watts: '' });
  const v = validateSubmission(form);
  assert.ok(v.ok, JSON.stringify(v.errors));
  const issue = toIssue(v.values, { login: 'dev', id: 42 });
  const filed = { number: 3, title: issue.title, body: issue.body, user: { login: 'ponzgpt' }, html_url: 'u', created_at: '2026-10-24T00:00:00Z' };
  const rig = issueToRig(filed);
  assert.equal(rig.author, 'dev');
  assert.equal(rig.title, 'Mac box');
  assert.equal(rig.best.tg, 85.1);
  assert.equal(rig.priceUsd, 5100);
  assert.equal(issueToRig({ ...filed, user: { login: 'mallory' } }).author, 'mallory');
});

test('submission validation', () => {
  const v = validateSubmission(new URLSearchParams({ title: 'x', parts: 'y', price: '1', stack: 'z', bench: 'not a table', watts: 'lots' }));
  assert.ok(!v.ok);
  assert.match(v.errors.bench, /llama-bench/);
  assert.ok(v.errors.watts);
  assert.ok(validateSubmission(new URLSearchParams()).errors.title);
});
