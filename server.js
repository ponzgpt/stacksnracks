// Zero-dependency server: renders the Increments page from data/tiers.json and takes newsletter signups.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { MODELS, estimateTps, tpsPerK, largestFit } from './lib/estimate.js';
import { validEmail, rateLimiter, saveSubscriber } from './lib/subscribe.js';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const REPO = 'https://github.com/ponzgpt/stacksnracks';
const PUB = new URL('./public/', import.meta.url);
const ASSETS = { 'style.css': 'text/css', 'favicon.svg': 'image/svg+xml' };
const MAX_BODY = 4 * 1024;
const allowSignup = rateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

const { updated, tiers } = JSON.parse(await readFile(new URL('./data/tiers.json', import.meta.url), 'utf8'));

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = n => '$' + n.toLocaleString('en-US');
const range = p => (p.low === p.high ? usd(p.low) : `${usd(p.low)}–${usd(p.high)}`);

const FLASH = {
  ok: '<p class="flash ok" role="status">You\'re in. The first Rack Report lands in your inbox soon.</p>',
  err: '<p class="flash err" role="alert">That email didn\'t look right. Try again?</p>',
  slow: '<p class="flash err" role="alert">Too many tries from your network. Try again in an hour.</p>',
};

function tierCard(t) {
  const best = largestFit(t);
  const cells = MODELS.map(m => {
    const tps = estimateTps(t, m);
    return `<td>${tps == null ? '<span class="nofit" title="Does not fit in memory">—</span>' : `${tps}`}</td>`;
  }).join('');
  const value = tpsPerK(t, MODELS[1]);
  return `<article class="tier" id="${esc(t.id)}">
  <header><span class="budget">${esc(t.budget)}</span><h3>${esc(t.title)}</h3><p class="target">${esc(t.target)}</p></header>
  <dl>
    <div><dt>Core</dt><dd>${esc(t.core)}</dd></div>
    <div><dt>Memory</dt><dd>${t.memGb} GB usable · ${t.bwGbs} GB/s</dd></div>
    <div><dt>Price</dt><dd>${range(t.price)} <small>${esc(t.price.what)}</small></dd></div>
    <div><dt>Biggest fit</dt><dd>${best ? esc(`${best.name} ${best.quant}`) : 'none of the reference models'}</dd></div>
  </dl>
  <table><caption>Estimated decode tok/s</caption>
    <thead><tr>${MODELS.map(m => `<th scope="col">${esc(m.id.toUpperCase())}</th>`).join('')}</tr></thead>
    <tbody><tr>${cells}</tr></tbody>
  </table>
  <p class="value">${value == null ? '32B doesn\'t fit' : `<strong>${value}</strong> tok/s per $1k on 32B`}</p>
  <p class="why">${esc(t.why)}</p>
  <p class="src">Price: <a href="${esc(t.source.url)}" rel="noopener">${esc(t.source.label)}</a> · checked ${esc(updated)}</p>
</article>`;
}

const SIGNUP = `<form class="signup" method="post" action="/subscribe">
  <label for="email">Get The Rack Report: weekly price moves and the best tok/s per dollar.</label>
  <div class="row">
    <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" maxlength="254">
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Subscribe</button>
  </div>
  <small>Weekly, free. We use your email only to send the newsletter.</small>
</form>`;

function page(flash = '') {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>StacksNRacks</title>
<meta name="description" content="Local AI hardware, priced this week. Budget tiers for running LLMs at home, with tok/s per dollar and the newsletter that tracks it.">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
</head><body>
<header class="top"><a class="logo" href="/"><span>Stacks</span>N<span>Racks</span></a><nav><a href="#increments">Increments</a><a href="#method">Method</a><a href="#subscribe">Newsletter</a></nav></header>
<main>
<section class="hero">
  <h1>Local AI hardware, <em>priced this week.</em></h1>
  <p>Memory shortages moved GPU prices to 2–5× MSRP. StacksNRacks tracks what a local LLM rig actually costs right now, and what each dollar buys in tokens per second.</p>
  <div id="subscribe">${flash}${SIGNUP}</div>
</section>
<section id="increments">
  <h2>Increments <small>updated ${esc(updated)}</small></h2>
  <p class="lede">Six reference builds from ~$1k to ~$7k, cheapest first. Speeds are <strong>estimates</strong> (see method); measured community runs arrive in the next release.</p>
  <div class="tiers">${tiers.map(tierCard).join('\n')}</div>
</section>
<section id="method">
  <h2>Method</h2>
  <p>Generating a token reads the whole model from memory once, so decode speed is bound by memory bandwidth: <code>tok/s ≈ bandwidth × 0.6 ÷ model size</code>. A model "fits" when its weights plus 3 GB for KV cache (~8k context) and buffers fit in usable GPU or unified memory. Splitting layers over two GPUs adds capacity, not decode speed.</p>
  <p>Reference models (Q4_K_M GGUF): ${MODELS.map(m => `${esc(m.name)} (${m.gb} GB)`).join(', ')}. Prompt processing, batching and MoE models behave differently; that's what measured runs are for.</p>
  <p>Prices are dated snapshots from the linked sources, not live quotes. Check a listing before you buy.</p>
</section>
<section class="cta">
  <h2>Show us your rig</h2>
  <p>Running models locally? Share the parts, the price you paid and your <code>llama-bench</code> numbers. The best rigs get featured in the newsletter.</p>
  <p><a class="button" href="${REPO}/issues/new?template=rig.yml" rel="noopener">Submit a rig</a></p>
</section>
</main>
<footer><p>StacksNRacks · not financial advice, just tokens per dollar · <a href="${REPO}" rel="noopener">source</a></p></footer>
</body></html>`;
}

const PAGES = { '': page(), ...Object.fromEntries(Object.entries(FLASH).map(([k, v]) => [k, page(v)])) };

function send(res, code, body, type = 'text/html', extra = {}) {
  res.writeHead(code, {
    'content-type': `${type}; charset=utf-8`,
    'content-security-policy': "default-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'",
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const [, a, b] = url.pathname.split('/');
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
    if (url.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      return send(res, 200, PAGES[url.searchParams.get('s')] ?? PAGES[''], 'text/html', { 'cache-control': 'no-cache' });
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    console.error(e);
    send(res, 400, 'bad request', 'text/plain');
  }
});

server.listen(PORT, () => console.log(`stacksnracks on :${PORT}`));
