// Server-rendered HTML. Everything that came from a submission goes through esc().
import { MODELS, estimateTps, tpsPerK, largestFit } from './estimate.js';

export const REPO = 'https://github.com/ponzgpt/stacksnracks';
const SUBMIT = '/submit';
const ISSUE_FORM = `${REPO}/issues/new?template=rig.yml`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = n => '$' + n.toLocaleString('en-US');
const range = p => (p.low === p.high ? usd(p.low) : `${usd(p.low)}–${usd(p.high)}`);
const num = n => (n == null ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));
const day = iso => iso.slice(0, 10);

export function layout({ title, description, body, user }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
</head><body>
<header class="top"><a class="logo" href="/"><span>Stacks</span>N<span>Racks</span></a><nav><a href="/#increments">Increments</a><a href="/rigs">Rigs</a><a href="/submit">Submit</a><a href="/#subscribe">Newsletter</a>${user ? `<span class="who">@${esc(user.login)}</span>` : ''}</nav></header>
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
  <label for="email">Get The Rack Report: weekly price moves and the best tok/s per dollar.</label>
  <div class="row">
    <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" maxlength="254">
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Subscribe</button>
  </div>
  <small>Weekly, free. We use your email only to send the newsletter.</small>
</form>`;

function tierCard(t, updated) {
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

function rigRows(rigs) {
  return rigs.map(r => `<tr>
  <th scope="row"><a href="/rigs/${r.id}">${esc(r.title)}</a><small>${esc(r.parts[0] || '')}</small></th>
  <td class="n">${num(r.best.tg)}<small>${esc(r.best.model)}</small></td>
  <td class="n">${num(r.best.pp)}</td>
  <td class="n">${r.priceUsd ? usd(r.priceUsd) : '—'}</td>
  <td class="n">${num(r.tgPerK)}</td>
  <td>${esc(r.best.backend)}</td>
</tr>`).join('\n');
}

const rigTable = rigs => `<div class="scroll"><table class="rigs">
<thead><tr><th scope="col">Rig</th><th scope="col" class="n">Decode tok/s</th><th scope="col" class="n">Prompt tok/s</th><th scope="col" class="n">Paid</th><th scope="col" class="n">tok/s per $1k</th><th scope="col">Backend</th></tr></thead>
<tbody>${rigRows(rigs)}</tbody></table></div>`;

const EMPTY = `<div class="empty"><p>No approved rigs match yet.</p><p><a class="button" href="${SUBMIT}">Submit the first one</a></p></div>`;

export function homePage({ updated, tiers, rigs, flash, user }) {
  const latest = [...rigs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return layout({
    user,
    title: 'StacksNRacks',
    description: 'Local AI hardware, priced this week. Budget tiers for running LLMs at home, community rigs with real llama-bench runs, and the newsletter that tracks it.',
    body: `
<section class="hero">
  <h1>Local AI hardware, <em>priced this week.</em></h1>
  <p>Memory shortages moved GPU prices to 2–5× MSRP. StacksNRacks tracks what a local LLM rig actually costs right now, and what each dollar buys in tokens per second.</p>
  <div id="subscribe">${FLASH[flash] || ''}${SIGNUP}</div>
</section>
<section id="increments">
  <h2>Increments <small>updated ${esc(updated)}</small></h2>
  <p class="lede">Six reference builds from ~$1k to ~$7k, cheapest first. Speeds here are <strong>estimates</strong> (see method); measured numbers live in <a href="/rigs">Rigs</a>.</p>
  <div class="tiers">${tiers.map(t => tierCard(t, updated)).join('\n')}</div>
</section>
<section id="latest">
  <h2>Latest rigs <small>${rigs.length} published</small></h2>
  ${latest.length ? `${rigTable(latest)}<p><a href="/rigs">All rigs →</a></p>` : EMPTY}
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
  <p><a class="button" href="${SUBMIT}">Submit a rig</a></p>
</section>`,
  });
}

const opt = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;

export function rigsPage({ rigs, shown, query, user }) {
  const backends = [...new Set(rigs.flatMap(r => r.runs.map(x => x.backend)).filter(Boolean))].sort();
  return layout({
    user,
    title: 'Rigs · StacksNRacks',
    description: 'Community local AI rigs with self-reported llama-bench runs, prices paid and tok/s per dollar.',
    body: `
<section>
  <h1 class="page">Rigs</h1>
  <p class="lede">Community builds with pasted <code>llama-bench</code> output, reviewed before publishing. Numbers are <strong>self-reported</strong>; "tok/s per $1k" uses the best decode run and the price the owner paid.</p>
  <form class="filters" method="get" action="/rigs">
    <label>Search <input name="q" value="${esc(query.q)}" placeholder="3090, 70B, Mac…" maxlength="60"></label>
    <label>Backend <select name="backend">${opt('', 'Any', query.backend)}${backends.map(b => opt(b, b, query.backend)).join('')}</select></label>
    <label>Sort <select name="sort">${opt('tg', 'Fastest decode', query.sort)}${opt('value', 'Best tok/s per $', query.sort)}${opt('new', 'Newest', query.sort)}</select></label>
    <button type="submit">Apply</button>
  </form>
  <p class="count">${shown.length} of ${rigs.length} rigs</p>
  ${shown.length ? rigTable(shown) : EMPTY}
  <p><a href="${SUBMIT}">Submit your rig →</a></p>
</section>`,
  });
}

export function rigPage(r, user) {
  const runs = r.runs.map(x => `<tr><th scope="row">${esc(x.model)}</th><td class="n">${x.sizeGiB ? `${x.sizeGiB} GiB` : '—'}</td><td>${esc(x.backend)}</td><td class="n">${num(x.pp)}</td><td class="n">${num(x.tg)}</td></tr>`).join('');
  return layout({
    user,
    title: `${r.title} · StacksNRacks`,
    description: `${r.title}: ${r.parts.slice(0, 2).join(', ')}. Best decode ${num(r.best.tg)} tok/s on ${r.best.model}.`,
    body: `
<article class="rig">
  <p class="crumbs"><a href="/rigs">← Rigs</a></p>
  <h1 class="page">${esc(r.title)}</h1>
  <p class="meta">by <a href="https://github.com/${esc(r.author)}" rel="noopener">@${esc(r.author)}</a> · ${esc(day(r.createdAt))} · <span class="badge">self-reported</span></p>
  <div class="stats">
    <div><span>${num(r.best.tg)}</span>decode tok/s<small>${esc(r.best.model)}</small></div>
    <div><span>${r.priceUsd ? usd(r.priceUsd) : '—'}</span>paid</div>
    <div><span>${num(r.tgPerK)}</span>tok/s per $1k</div>
    <div><span>${r.watts ? `${r.watts} W` : '—'}</span>under load</div>
  </div>
  ${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="Photo of ${esc(r.title)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
  <h2>Parts</h2>
  <ul class="parts">${r.parts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
  ${r.priceText ? `<p class="paid">Paid: ${esc(r.priceText)}</p>` : ''}
  <h2>Stack</h2>
  <pre>${esc(r.stack || 'Not given')}</pre>
  <h2>Runs</h2>
  <div class="scroll"><table class="rigs"><thead><tr><th scope="col">Model</th><th scope="col" class="n">Size</th><th scope="col">Backend</th><th scope="col" class="n">Prompt tok/s</th><th scope="col" class="n">Decode tok/s</th></tr></thead><tbody>${runs}</tbody></table></div>
  <p class="src">Prompt = first <code>pp</code> test (usually pp512), decode = first <code>tg</code> test (usually tg128). <a href="${esc(r.url)}" rel="noopener">Original submission and raw output</a>.</p>
</article>`,
  });
}

const HINTS = {
  title: 'Short and descriptive, e.g. "Dual 3090 closet box".',
  parts: 'GPU(s)/APU/Mac, CPU, RAM, PSU. One per line.',
  price: 'Total, and month bought. New or used?',
  stack: 'Backend + version (llama.cpp, vLLM, MLX, Ollama…), OS, flags.',
  bench: 'Paste the table from: llama-bench -m <model.gguf> -p 512 -n 128',
  watts: 'Optional.',
};

function field(f, values, errors) {
  const id = `f-${f.name}`;
  const big = ['parts', 'stack', 'bench'].includes(f.name);
  const attrs = `id="${id}" name="${f.name}" maxlength="${f.max}"${f.required ? ' required' : ''}${errors[f.name] ? ` aria-invalid="true" aria-describedby="${id}-err"` : ''}`;
  const input = big
    ? `<textarea ${attrs} rows="${f.name === 'bench' ? 10 : 4}"${f.name === 'bench' ? ' class="mono" spellcheck="false"' : ''}>${esc(values[f.name])}</textarea>`
    : `<input ${attrs} value="${esc(values[f.name])}"${f.name === 'watts' ? ' inputmode="decimal"' : ''}>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}${f.required ? '' : ' <small>(optional)</small>'}</label><small>${esc(HINTS[f.name])}</small>${input}${errors[f.name] ? `<p class="flash err" id="${id}-err">${esc(errors[f.name])}</p>` : ''}</div>`;
}

export function submitPage({ user, fields, values = {}, errors = {}, runs = [], csrf, loginEnabled, submitEnabled, flash }) {
  const intro = `<h1 class="page">Submit a rig</h1>
  <p class="lede">Share the parts, what you paid and your <code>llama-bench</code> numbers. Every submission is reviewed before it appears in <a href="/rigs">Rigs</a>; it becomes a public GitHub issue in <a href="${REPO}/issues" rel="noopener">our repo</a>.</p>`;
  const alt = `<p class="src">Prefer GitHub? <a href="${ISSUE_FORM}" rel="noopener">Use the issue form</a> (lets you attach a photo).</p>`;
  let body;
  if (!user || !submitEnabled) {
    body = `${intro}${flash ? `<p class="flash err" role="alert">${esc(flash)}</p>` : ''}
  ${loginEnabled && submitEnabled ? '<p><a class="button" href="/login">Sign in with GitHub</a></p><p class="src">We only read your public username. No repo access.</p>' : `<p><a class="button" href="${ISSUE_FORM}" rel="noopener">Submit via GitHub</a></p>`}
  ${loginEnabled && submitEnabled ? alt : ''}`;
  } else {
    const preview = runs.length ? `<p class="src">Found ${runs.length} run${runs.length > 1 ? 's' : ''}: ${runs.map(r => esc(`${r.model} (${r.backend || '?'})`)).join(', ')}.</p>` : '';
    body = `${intro}
  <form class="submit" method="post" action="/submit">
    <input type="hidden" name="csrf" value="${esc(csrf)}">
    ${fields.map(f => field(f, values, errors)).join('\n    ')}
    ${preview}
    <p><button type="submit">Submit for review</button></p>
  </form>
  <form method="post" action="/logout" class="logout"><input type="hidden" name="csrf" value="${esc(csrf)}">Signed in as <strong>@${esc(user.login)}</strong> · <button type="submit" class="link">Sign out</button></form>
  ${alt}`;
  }
  return layout({ user, title: 'Submit a rig · StacksNRacks', description: 'Submit your local AI rig and llama-bench numbers to StacksNRacks.', body: `<section>${body}</section>` });
}

export function thanksPage({ user, issue }) {
  return layout({
    user,
    title: 'Thanks · StacksNRacks',
    description: 'Rig submitted for review.',
    body: `<section><h1 class="page">Thanks, it's in review.</h1>
  <p class="lede">Your rig is <a href="${esc(issue.url)}" rel="noopener">issue #${issue.number}</a>. Once a maintainer approves it, it shows up in <a href="/rigs">Rigs</a> within 10 minutes. To fix something or add a photo, comment on the issue and a maintainer will update it.</p>
  <p><a class="button" href="/rigs">Browse rigs</a></p></section>`,
  });
}
