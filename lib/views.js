// Server-rendered HTML. Everything that came from a submission goes through esc().
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODELS, estimateTps, tpsPerK, largestFit } from './estimate.js';

export const REPO = 'https://github.com/ponzgpt/stacksnracks';
const SUBMIT = `${REPO}/issues/new?template=rig.yml`;

// Content hash on the stylesheet URL: browsers cache it for an hour, so a new deploy must change the URL.
const CSS_V = createHash('sha256').update(readFileSync(new URL('../public/style.css', import.meta.url))).digest('hex').slice(0, 8);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = n => '$' + n.toLocaleString('en-US');
const range = p => (p.low === p.high ? usd(p.low) : `${usd(p.low)}–${usd(p.high)}`);
const num = n => (n == null ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10));
const day = iso => iso.slice(0, 10);
const mid = p => (p.low + p.high) / 2;
// Bar as SVG attributes, not inline style, so the strict CSP holds.
const bar = (v, max) => `<svg class="bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="6" class="track"/><rect width="${Math.max(2, Math.round((v / max) * 100))}" height="6"/></svg>`;

export function layout({ title, description, body }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css?v=${CSS_V}">
</head><body>
<header class="top"><a class="logo" href="/"><span>Stacks</span>N<span>Racks</span></a><nav><a href="/#ranking">Ranking</a><a href="/rigs">Rigs</a><a href="${SUBMIT}" rel="noopener">Submit</a></nav></header>
<main>${body}</main>
<footer><p>StacksNRacks · not financial advice, just tokens per dollar · <a href="${REPO}" rel="noopener">source</a></p></footer>
</body></html>`;
}

const FLASH = {
  ok: '<p class="flash ok" role="status">You\'re in. The first Rack Report lands in your inbox soon.</p>',
  err: '<p class="flash err" role="alert">That email didn\'t look right. Try again?</p>',
  slow: '<p class="flash err" role="alert">Too many tries from your network. Try again in an hour.</p>',
};

const SIGNUP = `<form class="signup" method="post" action="/subscribe">
  <label for="email">The Rack Report: weekly price moves and the best tok/s per dollar. Free.</label>
  <div class="row">
    <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" maxlength="254">
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Subscribe</button>
  </div>
</form>`;

// The three questions people actually ask, answered from the tier data.
function answers(tiers) {
  const [m8, m32, m70] = MODELS;
  const cheapest70 = tiers.filter(t => estimateTps(t, m70) != null).sort((a, b) => mid(a.price) - mid(b.price))[0];
  const fastest32 = [...tiers].sort((a, b) => (estimateTps(b, m32) ?? 0) - (estimateTps(a, m32) ?? 0))[0];
  const value8 = [...tiers].sort((a, b) => (tpsPerK(b, m8) ?? 0) - (tpsPerK(a, m8) ?? 0))[0];
  const tile = (q, t, stat) => `<a class="answer" href="#${esc(t.id)}"><span class="q">${q}</span><span class="a">${esc(t.name)}</span><span class="s">${stat}</span></a>`;
  return `<div class="answers">
  ${tile('Cheapest way to run 70B', cheapest70, `~${estimateTps(cheapest70, m70)} tok/s · ${range(cheapest70.price)}`)}
  ${tile('Fastest on 32B', fastest32, `~${estimateTps(fastest32, m32)} tok/s · ${range(fastest32.price)}`)}
  ${tile('Most tok/s per dollar', value8, `${tpsPerK(value8, m8)} tok/s per $1k on 8B`)}
</div>`;
}

function ranking(tiers, updated) {
  const m32 = MODELS[1];
  const max = Math.max(...tiers.map(t => tpsPerK(t, m32) ?? 0));
  // Ranked by value on the mid-size model; builds that can't run it go last.
  const ranked = [...tiers].sort((a, b) => (tpsPerK(b, m32) ?? -1) - (tpsPerK(a, m32) ?? -1));
  const rows = ranked.map(t => {
    const v = tpsPerK(t, m32);
    const fit = largestFit(t);
    return `<tr id="${esc(t.id)}">
  <th scope="row"><span class="budget">${esc(t.budget)}</span>${esc(t.name)}<small>${esc(t.core)}. ${esc(t.why)}</small></th>
  <td data-label="Fits up to">${fit ? esc(fit.id.toUpperCase()) : '—'}<small>${t.memGb} GB · ${t.bwGbs} GB/s</small></td>
  ${MODELS.map(m => `<td class="n" data-label="${esc(m.id.toUpperCase())} tok/s">${estimateTps(t, m) ?? '<span class="nofit" title="Doesn\'t fit">—</span>'}</td>`).join('')}
  <td class="n value" data-label="tok/s per $1k (32B)">${v == null ? '<span class="nofit">—</span>' : `${v}${bar(v, max)}`}</td>
  <td class="n price" data-label="Price">${range(t.price)}<small><a href="${esc(t.source.url)}" rel="noopener" title="${esc(t.source.label)}">${esc(t.price.what)}</a></small></td>
</tr>`;
  }).join('\n');
  return `<div class="table"><table class="grid">
<thead><tr><th scope="col">Build</th><th scope="col">Fits up to</th>${MODELS.map(m => `<th scope="col" class="n">${esc(m.id.toUpperCase())} tok/s</th>`).join('')}<th scope="col" class="n">tok/s per $1k<br>(32B)</th><th scope="col" class="n">Price</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="note">tok/s are <strong>estimates</strong> from memory bandwidth for decode at Q4; prices checked ${esc(updated)}, each links to its source. <a href="#method">How we estimate</a>.</p>`;
}

const rigRows = rigs => rigs.map(r => `<tr>
  <th scope="row"><a href="/rigs/${r.id}">${esc(r.title)}</a><small>${esc(r.parts[0] || '')}</small></th>
  <td class="n" data-label="Decode tok/s">${num(r.best.tg)}<small>${esc(r.best.model)}</small></td>
  <td class="n" data-label="Prompt tok/s">${num(r.best.pp)}</td>
  <td class="n" data-label="Paid">${r.priceUsd ? usd(r.priceUsd) : '—'}</td>
  <td class="n" data-label="tok/s per $1k">${num(r.tgPerK)}</td>
</tr>`).join('\n');

const rigTable = rigs => `<div class="table"><table class="grid">
<thead><tr><th scope="col">Rig</th><th scope="col" class="n">Decode tok/s</th><th scope="col" class="n">Prompt tok/s</th><th scope="col" class="n">Paid</th><th scope="col" class="n">tok/s per $1k</th></tr></thead>
<tbody>${rigRows(rigs)}</tbody></table></div>`;

const EMPTY = `<div class="empty"><p>No measured rigs yet. Paste your <code>llama-bench</code> output and yours is the first.</p><p><a class="button" href="${SUBMIT}" rel="noopener">Submit a rig</a></p></div>`;

export function homePage({ updated, tiers, rigs, flash }) {
  const latest = [...rigs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return layout({
    title: 'StacksNRacks',
    description: 'Local AI hardware ranked by tokens per dollar: what each budget runs, how fast, and community rigs with real llama-bench numbers.',
    body: `
<section class="hero">
  <h1>Local AI hardware,<br><em>ranked by tokens per dollar.</em></h1>
  <p>GPU prices are 2–5× MSRP. Here's what each budget actually runs, and how fast.</p>
  ${answers(tiers)}
</section>
<section id="ranking">
  <h2>The ranking <small>by tok/s per $1k on 32B</small></h2>
  ${ranking(tiers, updated)}
</section>
<section id="rigs">
  <h2>Measured rigs <small>${rigs.length} published</small></h2>
  ${latest.length ? `${rigTable(latest)}<p class="more"><a href="/rigs">All rigs →</a> · <a href="${SUBMIT}" rel="noopener">Submit yours</a></p>` : EMPTY}
</section>
<section id="subscribe" class="panel">${FLASH[flash] || ''}${SIGNUP}</section>
<section id="method">
  <details><summary>How we estimate</summary>
  <p>Generating a token reads the whole model from memory once, so decode speed is bound by memory bandwidth: <code>tok/s ≈ bandwidth × 0.6 ÷ model size</code>. A model fits when its weights plus 3 GB (KV cache at ~8k context, buffers) fit in usable GPU or unified memory. Two GPUs add capacity, not decode speed.</p>
  <p>Reference models, Q4_K_M GGUF: ${MODELS.map(m => `${esc(m.name)} (${m.gb} GB)`).join(', ')}. Prompt processing, batching and MoE behave differently; measured rigs show the real thing.</p>
  </details>
</section>`,
  });
}

const opt = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;

export function rigsPage({ rigs, shown, query }) {
  return layout({
    title: 'Rigs · StacksNRacks',
    description: 'Community local AI rigs with self-reported llama-bench runs, prices paid and tok/s per dollar.',
    body: `
<section>
  <h1 class="page">Rigs</h1>
  <p class="lede">Real builds with pasted <code>llama-bench</code> output, reviewed before publishing. Numbers are <strong>self-reported</strong>; tok/s per $1k uses the best decode run and the price paid.</p>
  <form class="filters" method="get" action="/rigs">
    <label>Search <input name="q" value="${esc(query.q)}" placeholder="3090, 70B, Mac…" maxlength="60"></label>
    <label>Sort <select name="sort">${opt('tg', 'Fastest decode', query.sort)}${opt('value', 'Best tok/s per $', query.sort)}${opt('new', 'Newest', query.sort)}</select></label>
    <button type="submit">Apply</button>
  </form>
  <p class="count">${shown.length} of ${rigs.length} rigs</p>
  ${shown.length ? rigTable(shown) : EMPTY}
</section>`,
  });
}

export function rigPage(r) {
  const runs = r.runs.map(x => `<tr><th scope="row">${esc(x.model)}</th><td class="n" data-label="Size">${x.sizeGiB ? `${x.sizeGiB} GiB` : '—'}</td><td data-label="Backend">${esc(x.backend)}</td><td class="n" data-label="Prompt tok/s">${num(x.pp)}</td><td class="n" data-label="Decode tok/s">${num(x.tg)}</td></tr>`).join('');
  return layout({
    title: `${r.title} · StacksNRacks`,
    description: `${r.title}: ${r.parts.slice(0, 2).join(', ')}. Best decode ${num(r.best.tg)} tok/s on ${r.best.model}.`,
    body: `
<article class="rig">
  <p class="crumbs"><a href="/rigs">← Rigs</a></p>
  <h1 class="page">${esc(r.title)}</h1>
  <p class="meta">by <a href="https://github.com/${esc(r.author)}" rel="noopener">@${esc(r.author)}</a> · ${esc(day(r.createdAt))} · <span class="badge">self-reported</span></p>
  <div class="answers">
    <div class="answer"><span class="q">Decode</span><span class="a">${num(r.best.tg)} tok/s</span><span class="s">${esc(r.best.model)}</span></div>
    <div class="answer"><span class="q">Paid</span><span class="a">${r.priceUsd ? usd(r.priceUsd) : '—'}</span><span class="s">${num(r.tgPerK)} tok/s per $1k</span></div>
    <div class="answer"><span class="q">Power</span><span class="a">${r.watts ? `${r.watts} W` : '—'}</span><span class="s">under load</span></div>
  </div>
  ${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="Photo of ${esc(r.title)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
  <h2>Parts</h2>
  <ul class="parts">${r.parts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
  ${r.priceText ? `<p class="paid">Paid: ${esc(r.priceText)}</p>` : ''}
  <h2>Stack</h2>
  <pre>${esc(r.stack || 'Not given')}</pre>
  <h2>Runs</h2>
  <div class="table"><table class="grid"><thead><tr><th scope="col">Model</th><th scope="col" class="n">Size</th><th scope="col">Backend</th><th scope="col" class="n">Prompt tok/s</th><th scope="col" class="n">Decode tok/s</th></tr></thead><tbody>${runs}</tbody></table></div>
  <p class="note">Prompt = first <code>pp</code> test (usually pp512), decode = first <code>tg</code> test (usually tg128). <a href="${esc(r.url)}" rel="noopener">Original submission and raw output</a>.</p>
</article>`,
  });
}
